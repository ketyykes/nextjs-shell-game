/**
 * `tr`：把管線輸入的字元換掉、刪掉或壓縮連續重複（第十九場，只開放使用，不在劇本裡）。
 *
 * - `tr 第一組 第二組`：第一組的第 n 個字換成第二組的第 n 個字；第二組比較短時用它的最後一個字補齊（GNU 行為）。
 * - `-d 第一組`：刪掉第一組裡的字。
 * - `-s 一組`：連續重複的同一個字壓成一個；跟換字或 `-d` 一起用時壓縮的是第二組。
 * - 字元組的寫法：一般字元、範圍 `a-z`、類別 `[:upper:]` `[:lower:]` `[:digit:]` `[:space:]` `[:alpha:]` `[:alnum:]`、
 *   跳脫 `\n` `\t` `\\`（其他 `\x` 就是 x）。類別照 C 語系只認英文字母與數字，中文不算字母（GNU tr 也是）。
 *
 * 跟真的 tr 一樣只讀管線輸入、不接檔名，多給的參數照 GNU 報 extra operand，並提示改用 `cat 檔案 | tr …`。
 * 中文一個字算一個（GNU tr 以位元組處理，會把中文切壞；這裡照 BSD tr 處理多位元組字元）。
 * 輸入的每一行接回含換行的文字再處理，所以換行也能被換掉或刪掉（`tr '\n' ' '` 把好幾行接成一行）。
 * 不支援 `-c`、`-t`、`[c*n]`、`[=c=]` 與八進位跳脫。
 */

import type { CommandDefinition, CommandResult } from "../types";
import {
	missingOperand,
	trEmptySet2,
	trExtraOperand,
	trInvalidClass,
	trInvalidRange,
	trNeedsPipe,
	trNeedsTwoSets,
} from "../messages";
import { joinContentLines, splitContentLines } from "./cat";
import { parseFlagArgs } from "./options";

/** 從 `from` 到 `to`（含）的每個字元。 */
function charRange(from: string, to: string): string[] {
	const chars: string[] = [];
	const end = to.codePointAt(0) ?? 0;
	for (let code = from.codePointAt(0) ?? 0; code <= end; code += 1) {
		chars.push(String.fromCodePoint(code));
	}
	return chars;
}

const UPPER = charRange("A", "Z");
const LOWER = charRange("a", "z");
const DIGIT = charRange("0", "9");

/** 字元類別，照 C 語系由小到大排（換字時位置要對得上，`[:lower:]` 換 `[:upper:]` 才會對）。 */
const CHAR_CLASSES: Record<string, string[]> = {
	upper: UPPER,
	lower: LOWER,
	digit: DIGIT,
	space: ["\t", "\n", "\v", "\f", "\r", " "],
	alpha: [...UPPER, ...LOWER],
	alnum: [...DIGIT, ...UPPER, ...LOWER],
};

/** 反斜線跳脫：`\n`、`\t`，其他（含 `\\`）就是那個字本身。 */
const ESCAPES: Record<string, string> = { n: "\n", t: "\t" };

type SetParseResult = { ok: true; chars: string[] } | { ok: false; lines: string[] };

/** 讀一個字元（處理反斜線跳脫），回傳那個字與下一個位置。 */
function readChar(chars: string[], index: number): { char: string; next: number } {
	const char = chars[index];
	const escaped = chars[index + 1];
	if (char === "\\" && escaped !== undefined) {
		return { char: ESCAPES[escaped] ?? escaped, next: index + 2 };
	}
	return { char, next: index + 1 };
}

/** 把字元組的寫法展開成一串字元，例如 `a-c` 是 `["a", "b", "c"]`。 */
function expandSet(set: string): SetParseResult {
	const chars = Array.from(set);
	const expanded: string[] = [];
	let index = 0;

	while (index < chars.length) {
		if (chars[index] === "[" && chars[index + 1] === ":") {
			const close = chars.indexOf(":", index + 2);
			if (close !== -1 && chars[close + 1] === "]") {
				const name = chars.slice(index + 2, close).join("");
				if (!Object.hasOwn(CHAR_CLASSES, name)) {
					return { ok: false, lines: trInvalidClass(name) };
				}
				expanded.push(...CHAR_CLASSES[name]);
				index = close + 2;
				continue;
			}
		}

		const startIndex = index;
		const start = readChar(chars, index);
		index = start.next;
		// 範圍：中間是 `-`、後面還有字（結尾的 `-` 是字面字元）
		if (chars[index] === "-" && index + 1 < chars.length) {
			const end = readChar(chars, index + 1);
			if ((start.char.codePointAt(0) ?? 0) > (end.char.codePointAt(0) ?? 0)) {
				return { ok: false, lines: trInvalidRange(chars.slice(startIndex, end.next).join("")) };
			}
			expanded.push(...charRange(start.char, end.char));
			index = end.next;
			continue;
		}
		expanded.push(start.char);
	}

	return { ok: true, chars: expanded };
}

/** 照第一組、第二組的位置建換字表；第二組比較短時用它的最後一個字補齊，同一個字出現兩次以後面的為準。 */
function buildTranslation(from: string[], to: string[]): Map<string, string> {
	const table = new Map<string, string>();
	const last = to[to.length - 1];
	from.forEach((char, index) => {
		table.set(char, to[index] ?? last);
	});
	return table;
}

/** 連續重複、而且在 `set` 裡的字壓成一個。 */
function squeeze(chars: string[], set: Set<string>): string[] {
	const output: string[] = [];
	for (const char of chars) {
		if (set.has(char) && output[output.length - 1] === char) {
			continue;
		}
		output.push(char);
	}
	return output;
}

/** 字元組放進範例指令時加上引號（含空白、反斜線等特殊字元時）。 */
function quoteForExample(value: string): string {
	if (/^[\p{L}\p{N}_\-.,:/[\]@%+=]+$/u.test(value)) {
		return value;
	}
	return `'${value.replace(/'/g, "'\\''")}'`;
}

/** 這種用法可以接幾組字元：最少與最多。 */
function setCountRange(deleting: boolean, squeezing: boolean): { min: number; max: number } {
	if (deleting && squeezing) {
		return { min: 2, max: 2 };
	}
	if (deleting) {
		return { min: 1, max: 1 };
	}
	if (squeezing) {
		return { min: 1, max: 2 };
	}
	return { min: 2, max: 2 };
}

export const trCommand: CommandDefinition = {
	name: "tr",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("tr", args, "ds");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const deleting = parsed.flags.has("d");
		const squeezing = parsed.flags.has("s");
		const sets = parsed.operands;
		const { min, max } = setCountRange(deleting, squeezing);

		if (sets.length === 0) {
			return { ok: false, lines: missingOperand("tr", "兩組字元，例如 cat 檔名 | tr a-z A-Z") };
		}
		if (sets.length > max) {
			const flags = [...parsed.flags].join("");
			const example = ["tr", ...(flags === "" ? [] : [`-${flags}`]), ...sets.slice(0, max).map(quoteForExample)];
			return { ok: false, lines: trExtraOperand(sets[max], example.join(" ")) };
		}
		if (sets.length < min) {
			return { ok: false, lines: trNeedsTwoSets(sets[0]) };
		}

		const expandedSets: string[][] = [];
		for (const set of sets) {
			const expanded = expandSet(set);
			if (!expanded.ok) {
				return { ok: false, lines: expanded.lines };
			}
			expandedSets.push(expanded.chars);
		}
		const [first, second] = expandedSets;
		const translating = !deleting && second !== undefined;
		if (translating && second.length === 0) {
			return { ok: false, lines: trEmptySet2() };
		}

		if (context.stdin === null) {
			return { ok: false, lines: trNeedsPipe() };
		}

		let chars = Array.from(joinContentLines(context.stdin));
		if (deleting) {
			const removed = new Set(first);
			chars = chars.filter((char) => !removed.has(char));
		} else if (translating) {
			const table = buildTranslation(first, second);
			chars = chars.map((char) => table.get(char) ?? char);
		}
		if (squeezing) {
			chars = squeeze(chars, new Set(second ?? first));
		}

		return { ok: true, lines: splitContentLines(chars.join("")) };
	},
};
