/**
 * `grep`：從檔案或管線輸入裡挑出含有某個字串的行。
 *
 * 用法 `grep [-i] [-n] [-c] [-v] [-r] 字串 [檔案...]`：
 * - `-i` 不分大小寫，`-n` 行首加行號，`-c` 只印符合的行數，`-v` 反向（印不符合的行）
 * - `-r` 遞迴搜尋目錄，隱藏檔也搜，同一層依名稱排序、深度優先
 *
 * 字串一律是**字面比對**，不是正規表示式：新手打 `grep v3.1` 時 `.` 就是句點，不會意外配到別的字。
 * 多個檔案或 `-r` 時每行前面加 `檔案路徑:`，路徑用玩家的寫法接相對子路徑（例如 `logs/2028/a.log:`），跟真的 grep 一樣。
 *
 * 沒有任何符合不算錯誤（`ok: true`、沒有輸出），避免懲罰探索；只有讀不到檔案、用法錯誤才算錯誤。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { canRead, FsError } from "../types";
import { directoryNeedsRecursive, fsError, missingOperand, noInput, unknownOption } from "../messages";
import { splitContentLines } from "./cat";

// ---------------------------------------------------------------------------
// 選項解析
// ---------------------------------------------------------------------------

/** `grep` 支援的選項。 */
export interface GrepOptions {
	/** `-i`：不分大小寫。 */
	ignoreCase: boolean;
	/** `-n`：行首加行號。 */
	lineNumber: boolean;
	/** `-c`：只印符合的行數。 */
	count: boolean;
	/** `-v`：反向比對。 */
	invert: boolean;
	/** `-r`：遞迴搜尋目錄。 */
	recursive: boolean;
}

/** 選項解析結果：成功時帶選項、搜尋字串與檔名，失敗時帶要印出的錯誤訊息。 */
export type GrepParseResult =
	| { ok: true; options: GrepOptions; pattern: string; paths: string[] }
	| { ok: false; lines: string[] };

/** 可以接受的選項字母。 */
const SUPPORTED_FLAGS = new Set(["i", "n", "c", "v", "r"]);

/** 搜尋目前目錄時的特殊路徑標記：子項前綴不加任何東西（GNU grep `-r` 不給路徑時的行為）。 */
const CURRENT_DIR_IMPLICIT = "";

/** 把一個旗標字母套進選項。 */
function applyFlag(options: GrepOptions, flag: string): void {
	if (flag === "i") {
		options.ignoreCase = true;
	} else if (flag === "n") {
		options.lineNumber = true;
	} else if (flag === "c") {
		options.count = true;
	} else if (flag === "v") {
		options.invert = true;
	} else {
		options.recursive = true;
	}
}

/**
 * 解析 `grep` 的參數，風格同 `ls`：合併旗標、`--` 結束選項、未知選項回 `unknownOption`。
 * 第一個非選項參數是搜尋字串，其餘是檔名；選項可以放在任何位置。
 */
export function parseGrepArgs(args: string[]): GrepParseResult {
	const options: GrepOptions = { ignoreCase: false, lineNumber: false, count: false, invert: false, recursive: false };
	const operands: string[] = [];
	let optionsEnded = false;

	for (const arg of args) {
		if (optionsEnded || !arg.startsWith("-") || arg === "-") {
			operands.push(arg);
			continue;
		}

		if (arg === "--") {
			optionsEnded = true;
			continue;
		}

		if (arg.startsWith("--")) {
			return { ok: false, lines: unknownOption("grep", arg) };
		}

		for (const flag of arg.slice(1)) {
			if (!SUPPORTED_FLAGS.has(flag)) {
				return { ok: false, lines: unknownOption("grep", `-${flag}`) };
			}

			applyFlag(options, flag);
		}
	}

	if (operands.length === 0) {
		return { ok: false, lines: missingOperand("grep", "一個要搜尋的字串，例如 grep ERROR system.log") };
	}

	const [pattern, ...paths] = operands;
	return { ok: true, options, pattern, paths };
}

// ---------------------------------------------------------------------------
// 比對與格式化
// ---------------------------------------------------------------------------

/** 判斷一行是否該輸出：字面比對，`-i` 時兩邊都轉小寫，`-v` 時結果反過來。 */
function isSelected(line: string, pattern: string, options: GrepOptions): boolean {
	let found: boolean;

	if (options.ignoreCase) {
		found = line.toLowerCase().includes(pattern.toLowerCase());
	} else {
		found = line.includes(pattern);
	}

	if (options.invert) {
		return !found;
	}

	return found;
}

/**
 * 對一組行做比對並格式化。
 * `label` 不是 null 時每行（或 `-c` 的計數）前面加 `label:`。
 */
function matchLines(lines: string[], pattern: string, options: GrepOptions, label: string | null): string[] {
	let prefix = "";

	if (label !== null) {
		prefix = `${label}:`;
	}

	const output: string[] = [];
	let matched = 0;

	lines.forEach((line, index) => {
		if (!isSelected(line, pattern, options)) {
			return;
		}

		matched += 1;

		if (options.count) {
			return;
		}

		if (options.lineNumber) {
			output.push(`${prefix}${index + 1}:${line}`);
		} else {
			output.push(`${prefix}${line}`);
		}
	});

	if (options.count) {
		return [`${prefix}${matched}`];
	}

	return output;
}

// ---------------------------------------------------------------------------
// 檔案與目錄搜尋
// ---------------------------------------------------------------------------

/** 搜尋過程的累積結果。 */
interface SearchOutput {
	ok: boolean;
	lines: string[];
}

/** 搜尋需要的共用參數。 */
interface SearchSettings {
	context: CommandContext;
	pattern: string;
	options: GrepOptions;
	/** 是否在每行前加檔案路徑。 */
	showLabel: boolean;
}

/** 子項的顯示路徑：玩家寫法接上子項名稱，結尾已有 `/` 時不重複；隱含的目前目錄直接用名稱。 */
function joinDisplayPath(parent: string, name: string): string {
	if (parent === CURRENT_DIR_IMPLICIT) {
		return name;
	}

	if (parent.endsWith("/")) {
		return `${parent}${name}`;
	}

	return `${parent}/${name}`;
}

/** 把 `FsError` 換成錯誤訊息放進輸出；其他錯誤照常往外丟。 */
function recordFsError(output: SearchOutput, error: unknown): void {
	if (!(error instanceof FsError)) {
		throw error;
	}

	output.ok = false;
	output.lines.push(...fsError(error.code, error.path));
}

/** 搜尋一個檔案。`path` 同時是讀檔路徑與顯示路徑。 */
function searchFile(settings: SearchSettings, path: string, output: SearchOutput): void {
	const { context, pattern, options, showLabel } = settings;
	let content: string;

	try {
		content = context.fs.readFile(context.cwd, path);
	} catch (error) {
		// 沒加 -r 卻給了目錄：提示要加 -r，比單純說「是目錄」更有用
		if (error instanceof FsError && error.code === "EISDIR" && !options.recursive) {
			output.ok = false;
			output.lines.push(...directoryNeedsRecursive("grep", path));
			return;
		}

		recordFsError(output, error);
		return;
	}

	let label: string | null = null;

	if (showLabel) {
		label = path;
	}

	output.lines.push(...matchLines(splitContentLines(content), pattern, options, label));
}

/** 遞迴搜尋一個路徑：檔案直接搜，目錄依名稱排序逐一往下（隱藏檔也搜）。 */
function searchRecursive(settings: SearchSettings, path: string, output: SearchOutput): void {
	const { context } = settings;
	const fsPath = path === CURRENT_DIR_IMPLICIT ? "." : path;

	try {
		const node = context.fs.getNode(context.cwd, fsPath);

		if (node.type === "file") {
			searchFile(settings, fsPath, output);
			return;
		}

		// 讀不到的目錄不往下搜；`list` 本身不檢查權限，所以這裡要自己擋
		if (!canRead(node)) {
			throw new FsError("EACCES", fsPath);
		}

		const children = context.fs.list(context.cwd, fsPath, { includeHidden: true });

		for (const child of children) {
			searchRecursive(settings, joinDisplayPath(path, child.name), output);
		}
	} catch (error) {
		recordFsError(output, error);
	}
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

export const grepCommand: CommandDefinition = {
	name: "grep",
	run(args, context): CommandResult {
		const parsed = parseGrepArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { options, pattern } = parsed;
		let paths = parsed.paths;

		// 沒給檔名：有 stdin 就讀 stdin；-r 時搜目前目錄（GNU grep 的行為）；否則沒東西可讀
		if (paths.length === 0) {
			if (context.stdin !== null) {
				return { ok: true, lines: matchLines(context.stdin, pattern, options, null) };
			}

			if (!options.recursive) {
				return { ok: false, lines: noInput("grep", "grep ERROR evac_2028-06-02.log") };
			}

			paths = [CURRENT_DIR_IMPLICIT];
		}

		const settings: SearchSettings = {
			context,
			pattern,
			options,
			showLabel: options.recursive || paths.length > 1,
		};
		const output: SearchOutput = { ok: true, lines: [] };

		for (const path of paths) {
			if (options.recursive) {
				searchRecursive(settings, path, output);
			} else {
				searchFile(settings, path, output);
			}
		}

		return output;
	},
};
