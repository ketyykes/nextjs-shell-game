/**
 * `uniq`：把**相鄰**的重複行合併成一行。
 *
 * 只看相鄰，所以通常先 `sort` 再接 `uniq`，例如 `sort relay.log | uniq -c`。
 * 支援 `-c`（前綴出現次數，靠右對齊 7 格加一個空格，跟真的 uniq 一樣）
 * 與 `-d`（只印重複過的行）。最多接一個檔案，沒給檔名時讀管線的 `stdin`。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { missingOperand, unknownOption } from "../messages";
import { readInputLines } from "./sort";

// ---------------------------------------------------------------------------
// 選項解析
// ---------------------------------------------------------------------------

/** `uniq` 支援的選項。 */
export interface UniqOptions {
	/** `-c`：每行前綴出現次數。 */
	count: boolean;
	/** `-d`：只印重複過（出現兩次以上）的行。 */
	duplicatesOnly: boolean;
}

export type UniqParseResult =
	| { ok: true; options: UniqOptions; paths: string[] }
	| { ok: false; lines: string[] };

const SUPPORTED_FLAGS = new Set(["c", "d"]);

/** 次數欄寬度，跟 GNU uniq 一樣。 */
const COUNT_WIDTH = 7;

/** 給太多檔案時的用法說明。 */
const TOO_MANY_FILES_HINT =
	"最多一個檔名；要處理多個檔案，先用 sort 把它們接起來再交給 uniq，例如 sort part_01.txt part_02.txt | uniq";

/** 解析 `uniq` 的參數，規則同 `ls`。 */
export function parseUniqArgs(args: string[]): UniqParseResult {
	const options: UniqOptions = { count: false, duplicatesOnly: false };
	const paths: string[] = [];
	let optionsEnded = false;

	for (const arg of args) {
		if (optionsEnded || !arg.startsWith("-") || arg === "-") {
			paths.push(arg);
			continue;
		}

		if (arg === "--") {
			optionsEnded = true;
			continue;
		}

		if (arg.startsWith("--")) {
			return { ok: false, lines: unknownOption("uniq", arg) };
		}

		for (const flag of arg.slice(1)) {
			if (!SUPPORTED_FLAGS.has(flag)) {
				return { ok: false, lines: unknownOption("uniq", `-${flag}`) };
			}

			if (flag === "c") {
				options.count = true;
			} else {
				options.duplicatesOnly = true;
			}
		}
	}

	return { ok: true, options, paths };
}

// ---------------------------------------------------------------------------
// 合併相鄰重複
// ---------------------------------------------------------------------------

/** 一組相鄰相同的行。 */
interface LineGroup {
	line: string;
	count: number;
}

/** 把相鄰相同的行分成一組。 */
function groupAdjacent(lines: string[]): LineGroup[] {
	const groups: LineGroup[] = [];

	for (const line of lines) {
		const last = groups[groups.length - 1];

		if (last !== undefined && last.line === line) {
			last.count += 1;
		} else {
			groups.push({ line, count: 1 });
		}
	}

	return groups;
}

/** 依選項把相鄰重複合併後的結果格式化成輸出行。 */
export function uniqLines(lines: string[], options: UniqOptions): string[] {
	let groups = groupAdjacent(lines);

	if (options.duplicatesOnly) {
		groups = groups.filter((group) => group.count > 1);
	}

	return groups.map((group) => {
		if (options.count) {
			return `${String(group.count).padStart(COUNT_WIDTH, " ")} ${group.line}`;
		}

		return group.line;
	});
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

export const uniqCommand: CommandDefinition = {
	name: "uniq",
	run(args, context): CommandResult {
		const parsed = parseUniqArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		// 真的 uniq 第二個參數是輸出檔，這裡不支援，改提示用 sort 先把多個檔案接起來
		if (parsed.paths.length > 1) {
			return { ok: false, lines: missingOperand("uniq", TOO_MANY_FILES_HINT) };
		}

		const input = readInputLines("uniq", parsed.paths, context, "sort relay.log | uniq");

		if (!input.ok) {
			return { ok: false, lines: input.lines };
		}

		return { ok: true, lines: uniqLines(input.lines, parsed.options) };
	},
};
