/**
 * `head`：印出檔案或管線輸入的前幾行，預設 10 行。
 *
 * 支援 `-n 5`、`-n5` 與 `-5` 三種寫法指定行數，行數必須是正整數。
 * 沒給檔名時讀管線前一個指令的輸出（`context.stdin`）；
 * 多個檔案時每個檔案前面加一行 `==> 檔名 <==`，檔案之間空一行，跟真的 head 一樣。
 *
 * `tail` 的規則完全相同，只差在取最後幾行，所以選項解析與多檔案輸出都放在這裡共用。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { fsError, invalidNumber, missingOperand, noInput, unknownOption } from "../messages";
import { splitContentLines } from "./cat";
import { splitOptionsAndOperands } from "./options";

/** 沒有指定 `-n` 時的預設行數。 */
export const DEFAULT_LINE_COUNT = 10;

// ---------------------------------------------------------------------------
// 選項解析
// ---------------------------------------------------------------------------

/** 選項解析結果：成功時帶行數與檔名，失敗時帶要印出的錯誤訊息。 */
export type LineCountParseResult =
	| { ok: true; count: number; paths: string[] }
	| { ok: false; lines: string[] };

/** 行數字串是否為正整數（只允許數字，而且不能是 0）。 */
function parsePositiveInteger(value: string): number | null {
	if (!/^\d+$/.test(value)) {
		return null;
	}

	const count = Number(value);

	if (count <= 0) {
		return null;
	}

	return count;
}

/**
 * 解析 `head`／`tail` 的參數。
 * - `-n 5`、`-n5`、`-5` 都可以，數字不是正整數回傳 `invalidNumber`
 * - `-n` 後面沒有東西回傳 `missingOperand`
 * - 其他選項回傳 `unknownOption`；`--` 之後全部當成檔名
 * - 不以 `-` 開頭的參數是檔名，選項可以放在檔名前後
 */
export function parseLineCountArgs(command: string, args: string[]): LineCountParseResult {
	let count = DEFAULT_LINE_COUNT;
	// `-n 5` 的 5 由切分函式緊接著 `-n` 放進 options
	const { options, operands } = splitOptionsAndOperands(args, { valueOptions: ["-n"] });
	let index = 0;

	while (index < options.length) {
		const arg = options[index];
		index += 1;

		// `-n` 的值：黏在後面（`-n5`）或是下一個參數（`-n 5`）
		// `-5` 這種純數字簡寫也走同一套驗證，`-0` 才會得到「0 不是數字」的提示
		let value: string | null = null;

		if (arg === "-n") {
			if (index >= options.length) {
				return {
					ok: false,
					lines: missingOperand(command, `在 -n 後面接要顯示的行數，例如 ${command} -n 5 door_events.log`),
				};
			}

			value = options[index];
			index += 1;
		} else if (arg.startsWith("-n") && !arg.startsWith("--")) {
			value = arg.slice(2);
		} else if (/^-\d+$/.test(arg)) {
			value = arg.slice(1);
		}

		if (value === null) {
			if (arg.startsWith("--")) {
				return { ok: false, lines: unknownOption(command, arg) };
			}

			return { ok: false, lines: unknownOption(command, `-${arg[1]}`) };
		}

		const parsed = parsePositiveInteger(value);

		if (parsed === null) {
			return { ok: false, lines: invalidNumber(command, value) };
		}

		count = parsed;
	}

	return { ok: true, count, paths: operands };
}

// ---------------------------------------------------------------------------
// 共用執行流程
// ---------------------------------------------------------------------------

/** 從一份內容（一組行）挑出要印的行，`head` 取前面、`tail` 取後面。 */
export type LineSelector = (lines: string[], count: number) => string[];

/**
 * `head`／`tail` 共用的執行流程。
 * - 沒給檔名：讀 stdin，stdin 是 null 時回 `noInput`
 * - 一個檔名：直接輸出，不加標題
 * - 多個檔名：每個檔案前加 `==> 檔名 <==`，從第二個標題起前面空一行；
 *   讀檔失敗的檔案不加標題，錯誤訊息放在對應位置，整體 `ok: false`
 */
export function runLineSlicer(
	command: string,
	args: string[],
	context: CommandContext,
	select: LineSelector,
): CommandResult {
	const parsed = parseLineCountArgs(command, args);

	if (!parsed.ok) {
		return { ok: false, lines: parsed.lines };
	}

	const { count, paths } = parsed;

	if (paths.length === 0) {
		if (context.stdin === null) {
			return { ok: false, lines: noInput(command, `${command} -n 5 door_events.log`) };
		}

		return { ok: true, lines: select(context.stdin, count) };
	}

	const showHeaders = paths.length > 1;
	const lines: string[] = [];
	let ok = true;
	let headerPrinted = false;

	for (const path of paths) {
		let content: string;

		try {
			content = context.fs.readFile(context.cwd, path);
		} catch (error) {
			if (!(error instanceof FsError)) {
				throw error;
			}

			ok = false;
			lines.push(...fsError(error.code, error.path));
			continue;
		}

		if (showHeaders) {
			if (headerPrinted) {
				lines.push("");
			}

			lines.push(`==> ${path} <==`);
			headerPrinted = true;
		}

		lines.push(...select(splitContentLines(content), count));
	}

	return { ok, lines };
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

/** 取前 `count` 行。 */
function selectFirstLines(lines: string[], count: number): string[] {
	return lines.slice(0, count);
}

export const headCommand: CommandDefinition = {
	name: "head",
	run(args, context): CommandResult {
		return runLineSlicer("head", args, context, selectFirstLines);
	},
};
