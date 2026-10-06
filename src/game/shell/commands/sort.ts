/**
 * `sort`：把輸入的行排序後印出。
 *
 * 支援 `-r`（反向）、`-n`（依行首數字）、`-u`（去重）與任意組合。
 * `-u` 跟 GNU sort 一樣依「排序比較結果相等」去重：沒有 `-n` 時整行相同才算重複，
 * 有 `-n` 時行首數值相等就算重複（`1 b` 與 `01 a` 只留一行），同值留排序後的第一行，也就是最先出現的那行。
 * 可以接多個檔案，內容接起來一起排；沒給檔名時讀管線的 `stdin`。
 *
 * 字串比較用 code unit（`a < b`），不用 `localeCompare`，
 * 不同瀏覽器與語系結果才會一樣。排序一律穩定，同值維持原順序。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { fsError, noInput, unknownOption } from "../messages";
import { splitContentLines } from "./cat";

// ---------------------------------------------------------------------------
// 共用：讀輸入（`uniq` 也用）
// ---------------------------------------------------------------------------

/** 讀輸入的結果：成功時帶所有行，失敗時帶要印出的錯誤訊息。 */
export type InputReadResult = { ok: true; lines: string[] } | { ok: false; lines: string[] };

/**
 * 讀取指令的輸入行。
 * - 有檔名：依序讀每個檔案，內容接起來；任何一個讀不到就整體失敗，只回錯誤訊息（跟真的 sort 一樣）。
 * - 沒檔名但在管線中：讀 `context.stdin`。
 * - 都沒有：回 `noInput(command, example)`。
 */
export function readInputLines(
	command: string,
	paths: string[],
	context: CommandContext,
	example: string,
): InputReadResult {
	if (paths.length === 0) {
		if (context.stdin === null) {
			return { ok: false, lines: noInput(command, example) };
		}

		return { ok: true, lines: [...context.stdin] };
	}

	const lines: string[] = [];
	const errors: string[] = [];

	for (const path of paths) {
		try {
			lines.push(...splitContentLines(context.fs.readFile(context.cwd, path)));
		} catch (error) {
			if (!(error instanceof FsError)) {
				throw error;
			}

			errors.push(...fsError(error.code, error.path));
		}
	}

	if (errors.length > 0) {
		return { ok: false, lines: errors };
	}

	return { ok: true, lines };
}

// ---------------------------------------------------------------------------
// 選項解析
// ---------------------------------------------------------------------------

/** `sort` 支援的選項。 */
export interface SortOptions {
	/** `-r`：反向。 */
	reverse: boolean;
	/** `-n`：依行首數字排序。 */
	numeric: boolean;
	/** `-u`：排序比較結果相等的行只留第一個（`-n` 時數值相等就算重複）。 */
	unique: boolean;
}

export type SortParseResult =
	| { ok: true; options: SortOptions; paths: string[] }
	| { ok: false; lines: string[] };

const SUPPORTED_FLAGS = new Set(["r", "n", "u"]);

/**
 * 解析 `sort` 的參數，規則同 `ls`：
 * 單字母選項可合併（`-nr`），`--` 之後全部當檔名，單獨的 `-` 當檔名，長選項不支援。
 */
export function parseSortArgs(args: string[]): SortParseResult {
	const options: SortOptions = { reverse: false, numeric: false, unique: false };
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
			return { ok: false, lines: unknownOption("sort", arg) };
		}

		for (const flag of arg.slice(1)) {
			if (!SUPPORTED_FLAGS.has(flag)) {
				return { ok: false, lines: unknownOption("sort", `-${flag}`) };
			}

			if (flag === "r") {
				options.reverse = true;
			} else if (flag === "n") {
				options.numeric = true;
			} else {
				options.unique = true;
			}
		}
	}

	return { ok: true, options, paths };
}

// ---------------------------------------------------------------------------
// 排序
// ---------------------------------------------------------------------------

/** 行首數字：可有前導空白、負號與小數，例如 `-3`、`2.5`、`.5`。 */
const LEADING_NUMBER = /^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/;

/** 取出行首數字，沒有數字當 0（跟真的 `sort -n` 一樣）。 */
export function leadingNumber(line: string): number {
	const match = LEADING_NUMBER.exec(line);

	if (match === null) {
		return 0;
	}

	return Number(match[1]);
}

/** code unit 字串比較，回傳負數、0 或正數。 */
function compareStrings(a: string, b: string): number {
	if (a < b) {
		return -1;
	}

	if (a > b) {
		return 1;
	}

	return 0;
}

/**
 * 依選項排序，回傳新陣列。`Array.prototype.sort` 在 ES2019 之後保證穩定。
 * `-u` 時排序後相鄰而且比較結果相等（`compare` 回 0）的行只留第一行。
 */
export function sortLines(lines: string[], options: SortOptions): string[] {
	const direction = options.reverse ? -1 : 1;

	const compare = (a: string, b: string): number => {
		if (options.numeric) {
			return (leadingNumber(a) - leadingNumber(b)) * direction;
		}

		return compareStrings(a, b) * direction;
	};

	const sorted = [...lines].sort(compare);

	if (!options.unique) {
		return sorted;
	}

	const unique: string[] = [];

	for (const line of sorted) {
		const kept = unique[unique.length - 1];

		if (kept === undefined || compare(kept, line) !== 0) {
			unique.push(line);
		}
	}

	return unique;
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

export const sortCommand: CommandDefinition = {
	name: "sort",
	run(args, context): CommandResult {
		const parsed = parseSortArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const input = readInputLines("sort", parsed.paths, context, "sort fragments/part_01.txt");

		if (!input.ok) {
			return { ok: false, lines: input.lines };
		}

		return { ok: true, lines: sortLines(input.lines, parsed.options) };
	},
};
