/**
 * `uniq`：把**相鄰**的重複行合併成一行。
 *
 * 只看相鄰，所以通常先 `sort` 再接 `uniq`，例如 `sort relay.log | uniq -c`。
 * 支援 `-c`（前綴出現次數，靠右對齊 7 格加一個空格，跟真的 uniq 一樣）
 * 與 `-d`（只印重複過的行）。
 *
 * 參數照真的 `uniq [輸入檔 [輸出檔]]`：
 * - 沒給輸入檔、或輸入檔寫 `-` 時讀管線的 `stdin`
 * - 第二個參數是輸出檔：結果寫進虛擬檔案系統（等同 `> 輸出檔`，已存在就覆寫），畫面上沒有輸出；
 *   先讀輸入再寫輸出，輸入讀不到時不會建立輸出檔（跟真的 uniq 一樣）
 * - 超過兩個參數回 `extraOperand`
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { extraOperand, fsError } from "../messages";
import { parseFlagArgs } from "./options";
import { joinContentLines } from "./cat";
import { captureFsError } from "./fileArgs";
import { readInputLines } from "./sort";
import type { InputReadResult } from "./sort";

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

const SUPPORTED_FLAGS = "cd";

/** 次數欄寬度，跟 GNU uniq 一樣。 */
const COUNT_WIDTH = 7;

/** 完整用法，參數太多時印給玩家看。 */
const USAGE = "uniq [-c] [-d] [輸入檔 [輸出檔]]";

/** 代表「讀管線輸入」的輸入檔名。 */
const STDIN_PATH = "-";

/** 解析 `uniq` 的參數，規則同 `ls`。 */
export function parseUniqArgs(args: string[]): UniqParseResult {
	const parsed = parseFlagArgs("uniq", args, SUPPORTED_FLAGS);
	if (!parsed.ok) {
		return parsed;
	}

	const options: UniqOptions = { count: parsed.flags.has("c"), duplicatesOnly: parsed.flags.has("d") };
	return { ok: true, options, paths: parsed.operands };
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

/** 讀輸入：沒給或給 `-` 時讀 `stdin`，否則讀那個檔案。 */
function readUniqInput(inputPath: string | undefined, context: CommandContext): InputReadResult {
	const paths = inputPath === undefined || inputPath === STDIN_PATH ? [] : [inputPath];
	return readInputLines("uniq", paths, context, "sort relay.log | uniq");
}

export const uniqCommand: CommandDefinition = {
	name: "uniq",
	run(args, context): CommandResult {
		const parsed = parseUniqArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const [inputPath, outputPath, extra] = parsed.paths;

		if (extra !== undefined) {
			return { ok: false, lines: extraOperand("uniq", extra, USAGE) };
		}

		const input = readUniqInput(inputPath, context);

		if (!input.ok) {
			return { ok: false, lines: input.lines };
		}

		const lines = uniqLines(input.lines, parsed.options);

		if (outputPath === undefined) {
			return { ok: true, lines };
		}

		const error = captureFsError(() => {
			context.fs.writeFile(context.cwd, outputPath, joinContentLines(lines));
		});

		if (error !== null) {
			return { ok: false, lines: fsError(error.code, error.path) };
		}

		return { ok: true, lines: [] };
	},
};
