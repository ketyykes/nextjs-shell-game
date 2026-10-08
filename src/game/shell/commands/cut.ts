/**
 * `cut`：從每一行切出指定的欄位或字元（M13-3，只開放使用，不在劇本裡）。
 *
 * - `-f 清單`：依分隔字元切欄位，分隔字元用 `-d` 指定（預設 Tab），輸出時用同一個分隔字元接回去；
 *   沒有分隔字元的行整行照印，加 `-s` 就不印。欄位不夠時略過，跟 GNU cut 一樣。
 * - `-c 清單`：依字元位置切。中文一個字算一個字元（GNU cut 的 `-c` 實際上是位元組，會把中文切壞；
 *   這裡照 POSIX 的本意與 BSD cut 處理多位元組字元）。
 * - 清單寫法：`2`、`1,3`、`2-4`、`3-`（到最後）、`-2`（從頭），可以用逗號混用；
 *   輸出照行內原本的順序，重複的位置只印一次（`3,1` 等於 `1,3`）。
 *
 * 選項可以黏著值（`-d,`、`-f1,3`、`-c1-5`），也可以放在檔名後面；沒給檔名時讀管線輸入。
 * 不支援 `-b`、`--complement`、`--output-delimiter`。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import {
	cutConflictingLists,
	cutDelimiterNeedsFields,
	cutInvalidDelimiter,
	cutInvalidList,
	cutMissingList,
	cutSuppressNeedsFields,
	fsError,
	missingOperand,
	noInput,
	unknownOption,
} from "../messages";
import { splitContentLines } from "./cat";

/** 一段位置範圍，`end` 是 `Infinity` 代表到最後。位置從 1 開始。 */
interface PositionRange {
	start: number;
	end: number;
}

/** 解析好的 `cut` 選項。 */
interface CutOptions {
	mode: "fields" | "chars";
	ranges: PositionRange[];
	delimiter: string;
	onlyDelimited: boolean;
}

type CutParseResult = { ok: true; options: CutOptions; paths: string[] } | { ok: false; lines: string[] };

type ListParseResult = { ok: true; ranges: PositionRange[] } | { ok: false; lines: string[] };

/** 沒給 `-d` 時的分隔字元，跟 GNU cut 一樣是 Tab。 */
const DEFAULT_DELIMITER = "\t";

/** 每個需要值的選項在值缺少時的提示。 */
const MISSING_VALUE_HINTS: Record<string, string> = {
	d: "在 -d 後面接分隔字元，例如 cut -d , -f 2 crew.csv",
	f: "在 -f 後面接要取的欄位，例如 cut -d , -f 2 crew.csv",
	c: "在 -c 後面接要取的字元位置，例如 cut -c 1-5 door.log",
};

/** 解析位置清單，例如 `1,3`、`2-4`、`3-`、`-2`。 */
function parseList(list: string): ListParseResult {
	const ranges: PositionRange[] = [];

	for (const item of list.split(",")) {
		const single = /^(\d+)$/.exec(item);
		const span = /^(\d*)-(\d*)$/.exec(item);
		let start: number;
		let end: number;

		if (single !== null) {
			start = Number(single[1]);
			end = start;
		} else if (span !== null && (span[1] !== "" || span[2] !== "")) {
			start = 1;
			if (span[1] !== "") {
				start = Number(span[1]);
			}
			end = Infinity;
			if (span[2] !== "") {
				end = Number(span[2]);
			}
		} else {
			return { ok: false, lines: cutInvalidList(list, "invalid") };
		}

		if (start === 0 || end === 0) {
			return { ok: false, lines: cutInvalidList(list, "zero") };
		}
		if (start > end) {
			return { ok: false, lines: cutInvalidList(list, "decreasing") };
		}
		ranges.push({ start, end });
	}

	return { ok: true, ranges };
}

/** 解析 `cut` 的參數。 */
function parseCutArgs(args: string[]): CutParseResult {
	let mode: CutOptions["mode"] | null = null;
	let ranges: PositionRange[] = [];
	let delimiter: string | null = null;
	let onlyDelimited = false;
	const paths: string[] = [];
	let optionsEnded = false;
	let index = 0;

	while (index < args.length) {
		const arg = args[index];
		index += 1;

		if (optionsEnded || !arg.startsWith("-") || arg === "-") {
			paths.push(arg);
			continue;
		}
		if (arg === "--") {
			optionsEnded = true;
			continue;
		}
		if (arg.startsWith("--")) {
			return { ok: false, lines: unknownOption("cut", arg) };
		}

		const letters = arg.slice(1);
		for (let position = 0; position < letters.length; position += 1) {
			const letter = letters[position];
			if (letter === "s") {
				onlyDelimited = true;
				continue;
			}
			if (letter !== "d" && letter !== "f" && letter !== "c") {
				return { ok: false, lines: unknownOption("cut", `-${letter}`) };
			}

			// 值黏在後面（`-d,`）或是下一個參數（`-d ,`）；下一個參數可以是空字串（`-d ""`）
			let value = letters.slice(position + 1);
			if (value === "") {
				if (index >= args.length) {
					return { ok: false, lines: missingOperand("cut", MISSING_VALUE_HINTS[letter]) };
				}
				value = args[index];
				index += 1;
			}

			if (letter === "d") {
				if (Array.from(value).length !== 1) {
					return { ok: false, lines: cutInvalidDelimiter(value) };
				}
				delimiter = value;
				break;
			}

			if (mode !== null) {
				return { ok: false, lines: cutConflictingLists() };
			}
			const list = parseList(value);
			if (!list.ok) {
				return { ok: false, lines: list.lines };
			}
			mode = letter === "f" ? "fields" : "chars";
			ranges = list.ranges;
			break;
		}
	}

	if (mode === null) {
		return { ok: false, lines: cutMissingList() };
	}
	if (mode === "chars" && delimiter !== null) {
		return { ok: false, lines: cutDelimiterNeedsFields() };
	}
	if (mode === "chars" && onlyDelimited) {
		return { ok: false, lines: cutSuppressNeedsFields() };
	}

	return {
		ok: true,
		options: { mode, ranges, delimiter: delimiter ?? DEFAULT_DELIMITER, onlyDelimited },
		paths,
	};
}

/** 第 `position` 個（從 1 起算）有沒有被選到。 */
function isSelected(ranges: PositionRange[], position: number): boolean {
	return ranges.some((range) => position >= range.start && position <= range.end);
}

/** 依原本的順序留下被選到的項目。 */
function pickSelected(items: string[], ranges: PositionRange[]): string[] {
	return items.filter((_, itemIndex) => isSelected(ranges, itemIndex + 1));
}

/** 切一行；回傳 null 代表這一行不印（`-s` 且沒有分隔字元）。 */
function cutLine(line: string, options: CutOptions): string | null {
	if (options.mode === "chars") {
		return pickSelected(Array.from(line), options.ranges).join("");
	}

	if (!line.includes(options.delimiter)) {
		if (options.onlyDelimited) {
			return null;
		}
		return line;
	}

	return pickSelected(line.split(options.delimiter), options.ranges).join(options.delimiter);
}

/** 切整份輸入的每一行。 */
function cutLines(lines: string[], options: CutOptions): string[] {
	const output: string[] = [];
	for (const line of lines) {
		const cut = cutLine(line, options);
		if (cut !== null) {
			output.push(cut);
		}
	}
	return output;
}

/** 讀一個檔案切成行；失敗時回傳錯誤訊息。 */
function readLines(context: CommandContext, path: string): { ok: true; lines: string[] } | { ok: false; lines: string[] } {
	try {
		return { ok: true, lines: splitContentLines(context.fs.readFile(context.cwd, path)) };
	} catch (error) {
		if (!(error instanceof FsError)) {
			throw error;
		}
		return { ok: false, lines: fsError(error.code, error.path) };
	}
}

export const cutCommand: CommandDefinition = {
	name: "cut",
	run(args, context): CommandResult {
		const parsed = parseCutArgs(args);
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { options, paths } = parsed;
		if (paths.length === 0) {
			if (context.stdin === null) {
				return { ok: false, lines: noInput("cut", "cut -d , -f 2 crew.csv") };
			}
			return { ok: true, lines: cutLines(context.stdin, options) };
		}

		// 跟真的 cut 一樣：某個檔案失敗不中斷，錯誤訊息放在對應位置
		const lines: string[] = [];
		let ok = true;
		for (const path of paths) {
			const read = readLines(context, path);
			if (!read.ok) {
				ok = false;
				lines.push(...read.lines);
				continue;
			}
			lines.push(...cutLines(read.lines, options));
		}

		return { ok, lines };
	},
};
