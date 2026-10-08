/**
 * `grep`：從檔案或管線輸入裡挑出符合樣式的行。
 *
 * 用法 `grep [-i] [-n] [-c] [-v] [-r] [-w] [-o] [-E | -F] 樣式 [檔案...]`：
 * - 樣式預設是基本正規表示式（BRE），`-E` 是延伸正規表示式（ERE），`-F` 是照字面比對，
 *   三種語法的細節見 `grepPattern.ts`；`-E` 與 `-F` 同時給回 `conflictingMatchers`（跟 GNU grep 一樣）
 * - `-i` 不分大小寫，`-n` 行首加行號，`-c` 只印符合的行數，`-v` 反向（印不符合的行）
 * - `-r` 遞迴搜尋目錄，隱藏檔也搜，同一層依名稱排序、深度優先
 * - `-w` 只算整個單字的符合（前後是行首行尾或非文字字元，中文字算文字字元）
 * - `-o` 只印符合的片段，每個片段一行（`-n`、檔名前綴照樣加）；空字串的符合不印，
 *   `-c` 優先（照樣算行數），`-v` 時沒有片段可印（跟 GNU grep 一樣）
 *
 * 樣式不合法時回 `invalidPattern`，一個檔案都不讀。
 * 多個檔案或 `-r` 時每行前面加 `檔案路徑:`，路徑用玩家的寫法接相對子路徑（例如 `logs/2028/a.log:`），跟真的 grep 一樣。
 *
 * 沒有任何符合不算錯誤（`ok: true`、沒有輸出），避免懲罰探索；只有讀不到檔案、用法錯誤、樣式不合法才算錯誤。
 * 不過結束碼照 GNU grep 是 1（一行都沒選到，`-c` 印 0 也一樣），所以 `grep X f && echo 找到了` 不會印「找到了」。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { canRead, FsError } from "../types";
import {
	conflictingMatchers,
	directoryNeedsRecursive,
	fsError,
	invalidPattern,
	missingOperand,
	noInput,
} from "../messages";
import { parseFlagArgs } from "./options";
import { splitContentLines } from "./cat";
import { compileGrepPattern } from "./grepPattern";
import type { CompiledGrepPattern, GrepSyntax } from "./grepPattern";

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
	/** `-w`：只算整個單字的符合。 */
	wordRegexp: boolean;
	/** `-o`：只印符合的片段。 */
	onlyMatching: boolean;
	/** 樣式語法：預設 `basic`，`-E` 是 `extended`，`-F` 是 `fixed`。 */
	syntax: GrepSyntax;
}

/** 選項解析結果：成功時帶選項、搜尋字串與檔名，失敗時帶要印出的錯誤訊息。 */
export type GrepParseResult =
	| { ok: true; options: GrepOptions; pattern: string; paths: string[] }
	| { ok: false; lines: string[] };

/** 可以接受的選項字母。 */
const SUPPORTED_FLAGS = "incvrwoEF";

/** 搜尋目前目錄時的特殊路徑標記：子項前綴不加任何東西（GNU grep `-r` 不給路徑時的行為）。 */
const CURRENT_DIR_IMPLICIT = "";

/**
 * 把一個旗標字母套進選項。`-E` 與 `-F` 衝突時回傳 false（同一個重複給沒關係）。
 */
function applyFlag(options: GrepOptions, flag: string): boolean {
	if (flag === "E" || flag === "F") {
		const syntax: GrepSyntax = flag === "E" ? "extended" : "fixed";

		if (options.syntax !== "basic" && options.syntax !== syntax) {
			return false;
		}

		options.syntax = syntax;
	} else if (flag === "i") {
		options.ignoreCase = true;
	} else if (flag === "n") {
		options.lineNumber = true;
	} else if (flag === "c") {
		options.count = true;
	} else if (flag === "v") {
		options.invert = true;
	} else if (flag === "w") {
		options.wordRegexp = true;
	} else if (flag === "o") {
		options.onlyMatching = true;
	} else {
		options.recursive = true;
	}

	return true;
}

/**
 * 解析 `grep` 的參數，風格同 `ls`：合併旗標、`--` 結束選項、未知選項回 `unknownOption`。
 * 第一個非選項參數是搜尋字串，其餘是檔名；選項可以放在任何位置。
 */
export function parseGrepArgs(args: string[]): GrepParseResult {
	const options: GrepOptions = {
		ignoreCase: false,
		lineNumber: false,
		count: false,
		invert: false,
		recursive: false,
		wordRegexp: false,
		onlyMatching: false,
		syntax: "basic",
	};
	const parsed = parseFlagArgs("grep", args, SUPPORTED_FLAGS, (flag) =>
		applyFlag(options, flag) ? null : conflictingMatchers("grep"),
	);
	if (!parsed.ok) {
		return parsed;
	}

	const { operands } = parsed;
	if (operands.length === 0) {
		return { ok: false, lines: missingOperand("grep", "一個要搜尋的字串，例如 grep ERROR system.log") };
	}

	const [pattern, ...paths] = operands;
	return { ok: true, options, pattern, paths };
}

// ---------------------------------------------------------------------------
// 比對與格式化
// ---------------------------------------------------------------------------

/** `compileGrepPattern` 編好的樣式：判斷整行與挑出片段。 */
type LineTester = Pick<CompiledGrepPattern, "test" | "matches">;

/** 判斷一行是否該輸出：`-v` 時結果反過來。 */
function isSelected(line: string, tester: LineTester, options: GrepOptions): boolean {
	const found = tester.test(line);

	if (options.invert) {
		return !found;
	}

	return found;
}

/** 一組行比對完的結果：要印的行與選到幾行（決定結束碼）。 */
interface MatchResult {
	lines: string[];
	selected: number;
}

/**
 * 對一組行做比對並格式化。
 * `label` 不是 null 時每行（或 `-c` 的計數）前面加 `label:`。
 */
function matchLines(lines: string[], tester: LineTester, options: GrepOptions, label: string | null): MatchResult {
	let prefix = "";

	if (label !== null) {
		prefix = `${label}:`;
	}

	const output: string[] = [];
	let matched = 0;

	lines.forEach((line, index) => {
		if (!isSelected(line, tester, options)) {
			return;
		}

		matched += 1;

		if (options.count) {
			return;
		}

		let linePrefix = prefix;

		if (options.lineNumber) {
			linePrefix = `${prefix}${index + 1}:`;
		}

		// -v 選到的是不符合的行，沒有片段可印
		if (options.onlyMatching) {
			if (!options.invert) {
				output.push(...tester.matches(line).map((text) => `${linePrefix}${text}`));
			}
			return;
		}

		output.push(`${linePrefix}${line}`);
	});

	if (options.count) {
		return { lines: [`${prefix}${matched}`], selected: matched };
	}

	return { lines: output, selected: matched };
}

// ---------------------------------------------------------------------------
// 檔案與目錄搜尋
// ---------------------------------------------------------------------------

/** 搜尋過程的累積結果。 */
interface SearchOutput {
	ok: boolean;
	lines: string[];
	/** 所有檔案加起來選到幾行，0 時結束碼是 1。 */
	selected: number;
}

/** 搜尋需要的共用參數。 */
interface SearchSettings {
	context: CommandContext;
	tester: LineTester;
	options: GrepOptions;
	/** 玩家輸入的搜尋樣式原文，組「加上 -r」的示範指令時要帶著。 */
	pattern: string;
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
	const { context, tester, options, showLabel } = settings;
	let content: string;

	try {
		content = context.fs.readFile(context.cwd, path);
	} catch (error) {
		// 沒加 -r 卻給了目錄：提示要加 -r，比單純說「是目錄」更有用
		if (error instanceof FsError && error.code === "EISDIR" && !options.recursive) {
			output.ok = false;
			output.lines.push(...directoryNeedsRecursive("grep", path, `grep -r ${settings.pattern} ${path}`));
			return;
		}

		recordFsError(output, error);
		return;
	}

	let label: string | null = null;

	if (showLabel) {
		label = path;
	}

	const matched = matchLines(splitContentLines(content), tester, options, label);
	output.lines.push(...matched.lines);
	output.selected += matched.selected;
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

/** 搜尋結果轉成指令結果：成功但一行都沒選到時結束碼 1（不算錯誤）。 */
function toResult(output: SearchOutput): CommandResult {
	if (output.ok && output.selected === 0) {
		return { ok: true, lines: output.lines, exitStatus: 1 };
	}
	return { ok: output.ok, lines: output.lines };
}

export const grepCommand: CommandDefinition = {
	name: "grep",
	run(args, context): CommandResult {
		const parsed = parseGrepArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { options, pattern } = parsed;
		const compiled = compileGrepPattern(pattern, options.syntax, options.ignoreCase, options.wordRegexp);

		// 樣式不合法就整個停下來，一個檔案都不讀（跟 GNU grep 一樣）
		if (!compiled.ok) {
			return { ok: false, lines: invalidPattern("grep", pattern, compiled.error) };
		}

		const tester = compiled;
		let paths = parsed.paths;

		// 沒給檔名：有 stdin 就讀 stdin；-r 時搜目前目錄（GNU grep 的行為）；否則沒東西可讀
		if (paths.length === 0) {
			if (context.stdin !== null) {
				const matched = matchLines(context.stdin, tester, options, null);
				return toResult({ ok: true, lines: matched.lines, selected: matched.selected });
			}

			if (!options.recursive) {
				return { ok: false, lines: noInput("grep", "grep ERROR evac_2028-06-02.log") };
			}

			paths = [CURRENT_DIR_IMPLICIT];
		}

		const settings: SearchSettings = {
			context,
			tester,
			options,
			pattern,
			showLabel: options.recursive || paths.length > 1,
		};
		const output: SearchOutput = { ok: true, lines: [], selected: 0 };

		for (const path of paths) {
			if (options.recursive) {
				searchRecursive(settings, path, output);
			} else {
				searchFile(settings, path, output);
			}
		}

		return toResult(output);
	},
};
