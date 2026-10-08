/**
 * `wc`：計算檔案或管線輸入的行數、字數與位元組數（word count）。
 *
 * 支援 `-l`（行數）、`-w`（字數）、`-c`（位元組數）與任意組合（例如 `-lw`）。
 * 沒有選項時三個數字都印；有選項只印選到的，順序固定是行、字、位元組，跟真的 wc 一樣。
 *
 * 輸出格式：每個數字靠右對齊到該欄最大寬度，欄位間一個空格，最後接檔名；
 * 讀 stdin 時不接檔名。多個檔案時最後多一行 `total`。
 * 位元組用 UTF-8 計算，中文字一個 3 位元組，玩家可以藉此發現「字數」與「大小」不一樣。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { fsError, noInput } from "../messages";
import { parseFlagArgs } from "./options";
import { splitContentLines } from "./cat";

// ---------------------------------------------------------------------------
// 選項解析
// ---------------------------------------------------------------------------

/** `wc` 要印哪些欄位。 */
export interface WcOptions {
	lines: boolean;
	words: boolean;
	bytes: boolean;
}

/** 選項解析結果：成功時帶選項與檔名，失敗時帶要印出的錯誤訊息。 */
export type WcParseResult = { ok: true; options: WcOptions; paths: string[] } | { ok: false; lines: string[] };

/** 可以接受的選項字母。 */
const SUPPORTED_FLAGS = "lwc";

/**
 * 解析 `wc` 的參數，風格同 `ls`：合併旗標、`--` 結束選項、未知選項回 `unknownOption`。
 * 一個選項都沒給時三個欄位全開。
 */
export function parseWcArgs(args: string[]): WcParseResult {
	const parsed = parseFlagArgs("wc", args, SUPPORTED_FLAGS);
	if (!parsed.ok) {
		return parsed;
	}

	const options: WcOptions = {
		lines: parsed.flags.has("l"),
		words: parsed.flags.has("w"),
		bytes: parsed.flags.has("c"),
	};

	if (!options.lines && !options.words && !options.bytes) {
		options.lines = true;
		options.words = true;
		options.bytes = true;
	}

	return { ok: true, options, paths: parsed.operands };
}

// ---------------------------------------------------------------------------
// 計數
// ---------------------------------------------------------------------------

/** 一份輸入的三種計數。 */
export interface WcCounts {
	lines: number;
	words: number;
	bytes: number;
}

const encoder = new TextEncoder();

/** 字數：用空白（含換行、tab）切開後非空的段數。 */
function countWords(text: string): number {
	return text.split(/\s+/).filter((word) => word !== "").length;
}

/** 計算檔案內容。行數用 `splitContentLines` 切出的行數，位元組數是內容的 UTF-8 長度。 */
export function countContent(content: string): WcCounts {
	return {
		lines: splitContentLines(content).length,
		words: countWords(content),
		bytes: encoder.encode(content).length,
	};
}

/** 計算 stdin。每一行在管線裡都帶一個換行，所以位元組數每行多算 1。 */
export function countStdinLines(lines: string[]): WcCounts {
	let words = 0;
	let bytes = 0;

	for (const line of lines) {
		words += countWords(line);
		bytes += encoder.encode(line).length + 1;
	}

	return { lines: lines.length, words, bytes };
}

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------

/** 一列計數，`label` 是檔名或 `total`；stdin 時為 null。 */
interface CountRow {
	kind: "counts";
	counts: WcCounts;
	label: string | null;
}

/** 讀檔失敗時放在對應位置的錯誤訊息。 */
interface ErrorRow {
	kind: "error";
	lines: string[];
}

type OutputRow = CountRow | ErrorRow;

/** 依選項挑出要印的數字，順序固定是行、字、位元組。 */
function selectColumns(counts: WcCounts, options: WcOptions): number[] {
	const columns: number[] = [];

	if (options.lines) {
		columns.push(counts.lines);
	}

	if (options.words) {
		columns.push(counts.words);
	}

	if (options.bytes) {
		columns.push(counts.bytes);
	}

	return columns;
}

/** 把所有列格式化成輸出行，每欄寬度取該欄所有計數列的最大位數（最小 1）。 */
function formatRows(rows: OutputRow[], options: WcOptions): string[] {
	const countRows = rows.filter((row): row is CountRow => row.kind === "counts");
	const columnCount = selectColumns({ lines: 0, words: 0, bytes: 0 }, options).length;
	const widths: number[] = new Array<number>(columnCount).fill(1);

	for (const row of countRows) {
		selectColumns(row.counts, options).forEach((value, column) => {
			widths[column] = Math.max(widths[column], String(value).length);
		});
	}

	const output: string[] = [];

	for (const row of rows) {
		if (row.kind === "error") {
			output.push(...row.lines);
			continue;
		}

		const cells = selectColumns(row.counts, options).map((value, column) => String(value).padStart(widths[column], " "));

		if (row.label !== null) {
			cells.push(row.label);
		}

		output.push(cells.join(" "));
	}

	return output;
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

export const wcCommand: CommandDefinition = {
	name: "wc",
	run(args, context): CommandResult {
		const parsed = parseWcArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { options, paths } = parsed;

		if (paths.length === 0) {
			if (context.stdin === null) {
				return { ok: false, lines: noInput("wc", "wc -l door_events.log") };
			}

			const row: CountRow = { kind: "counts", counts: countStdinLines(context.stdin), label: null };
			return { ok: true, lines: formatRows([row], options) };
		}

		const rows: OutputRow[] = [];
		const total: WcCounts = { lines: 0, words: 0, bytes: 0 };
		let ok = true;

		// 跟 cat 一樣：某個檔案失敗不中斷，錯誤訊息放在對應位置
		for (const path of paths) {
			try {
				const counts = countContent(context.fs.readFile(context.cwd, path));
				rows.push({ kind: "counts", counts, label: path });
				total.lines += counts.lines;
				total.words += counts.words;
				total.bytes += counts.bytes;
			} catch (error) {
				if (!(error instanceof FsError)) {
					throw error;
				}

				ok = false;
				rows.push({ kind: "error", lines: fsError(error.code, error.path) });
			}
		}

		if (paths.length > 1) {
			rows.push({ kind: "counts", counts: total, label: "total" });
		}

		return { ok, lines: formatRows(rows, options) };
	},
};
