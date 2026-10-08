/**
 * `find`：從一或多個起點往下找，列出符合條件的檔案與目錄。
 *
 * 用法 `find [路徑...] [-name 樣式] [-iname 樣式] [-type f|d]`：
 * - 路徑預設 `.`；輸出用玩家給的路徑當前綴（`find .` 印 `.`、`./a`；`find /deck2` 印 `/deck2`、`/deck2/x`）
 * - 起點本身也算候選，跟真的 find 一樣
 * - 樣式支援 `*` 與 `?`，比對整個檔名；`-iname` 不分大小寫
 * - 多個條件同時成立才列出（AND）
 * - 深度優先，同一層依名稱排序，隱藏檔也列（真的 find 不會跳過隱藏檔）
 *
 * 跟真的 find 不同的地方：路徑寫在條件後面（`find -name "*.log" /deck2`）也接受，
 * 新手常把順序寫反，不值得為此報錯。`find` 不讀 stdin。
 */

import type { CommandContext, CommandDefinition, CommandResult, FsNode } from "../types";
import { canRead, FsError } from "../types";
import { fsError, missingOperand, unknownOption } from "../messages";
import { splitOptionsAndOperands } from "./options";

// ---------------------------------------------------------------------------
// 樣式比對
// ---------------------------------------------------------------------------

/** 正規表示式的特殊字元，樣式裡除了 `*`、`?` 以外都要跳脫成字面。 */
const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;

/**
 * 判斷檔名是否符合樣式。
 * `*` 配任意長度（含零個字元），`?` 配剛好一個字元，其他字元照字面比對；
 * 樣式要配完整個檔名，不是「包含」。
 */
export function matchNamePattern(pattern: string, name: string, ignoreCase: boolean): boolean {
	const source = pattern.replace(REGEX_SPECIAL, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
	let flags = "su";

	if (ignoreCase) {
		flags += "i";
	}

	return new RegExp(`^${source}$`, flags).test(name);
}

// ---------------------------------------------------------------------------
// 參數解析
// ---------------------------------------------------------------------------

/** 一個名稱條件。 */
interface NameTest {
	pattern: string;
	ignoreCase: boolean;
}

/** `find` 的條件，全部成立才算符合。 */
export interface FindTests {
	names: NameTest[];
	/** `-type`：`f` 只要檔案、`d` 只要目錄；null 代表不限。 */
	type: "f" | "d" | null;
}

/** 解析結果：成功時帶起點與條件，失敗時帶要印出的錯誤訊息。 */
export type FindParseResult = { ok: true; paths: string[]; tests: FindTests } | { ok: false; lines: string[] };

/** 各選項缺值時的說明（接在 `find 需要` 後面）。 */
const MISSING_VALUE_HINTS: Record<string, string> = {
	"-name": "-name 後面要接樣式，例如 find . -name \"*.log\"",
	"-iname": "-iname 後面要接樣式，例如 find . -iname \"*nova*\"",
	"-type": "-type 後面要接 f（檔案）或 d（目錄），例如 find . -type d",
};

/**
 * 解析 `find` 的參數。
 * - `-name`、`-iname`、`-type` 各吃掉下一個參數當值，沒有值回 `missingOperand`
 * - `-type` 的值不是 `f` 或 `d` 回 `unknownOption("find", "-type 值")`
 * - 其他 `-` 開頭的參數回 `unknownOption`；單獨的 `-` 當成路徑
 * - 其餘參數都是起點，沒有起點時用 `.`
 */
export function parseFindArgs(args: string[]): FindParseResult {
	const tests: FindTests = { names: [], type: null };
	// find 沒有 `--` 的語意，`--` 會留在 options 被當成不認得的選項
	const { options, operands: paths } = splitOptionsAndOperands(args, {
		endOfOptions: false,
		valueOptions: Object.keys(MISSING_VALUE_HINTS),
	});
	let index = 0;

	while (index < options.length) {
		const arg = options[index];
		index += 1;

		const hint = MISSING_VALUE_HINTS[arg];

		if (hint === undefined) {
			return { ok: false, lines: unknownOption("find", arg) };
		}

		if (index >= options.length) {
			return { ok: false, lines: missingOperand("find", hint) };
		}

		const value = options[index];
		index += 1;

		if (arg === "-type") {
			if (value !== "f" && value !== "d") {
				return { ok: false, lines: unknownOption("find", `-type ${value}`) };
			}

			tests.type = value;
		} else {
			tests.names.push({ pattern: value, ignoreCase: arg === "-iname" });
		}
	}

	if (paths.length === 0) {
		paths.push(".");
	}

	return { ok: true, paths, tests };
}

// ---------------------------------------------------------------------------
// 走訪
// ---------------------------------------------------------------------------

/** 走訪過程的累積結果。 */
interface FindOutput {
	ok: boolean;
	lines: string[];
}

/** 節點是否符合所有條件。`name` 是比對用的名稱（起點用玩家寫法的最後一段）。 */
function matchesTests(node: FsNode, name: string, tests: FindTests): boolean {
	if (tests.type === "f" && node.type !== "file") {
		return false;
	}

	if (tests.type === "d" && node.type !== "dir") {
		return false;
	}

	return tests.names.every((test) => matchNamePattern(test.pattern, name, test.ignoreCase));
}

/**
 * 起點的比對名稱：玩家寫法去掉結尾斜線後的最後一段，跟 GNU find 一樣
 * （`find .` 的起點名稱是 `.`、`find archive/` 是 `archive`、`find /` 是 `/`）。
 */
function startingPointName(path: string): string {
	const trimmed = path.replace(/\/+$/, "");

	if (trimmed === "") {
		return "/";
	}

	const lastSlash = trimmed.lastIndexOf("/");
	return trimmed.slice(lastSlash + 1);
}

/** 子項的顯示路徑：玩家寫法接上子項名稱，結尾已有 `/` 時不重複。 */
function joinDisplayPath(parent: string, name: string): string {
	if (parent.endsWith("/")) {
		return `${parent}${name}`;
	}

	return `${parent}/${name}`;
}

/** 把 `FsError` 換成錯誤訊息放進輸出；其他錯誤照常往外丟。 */
function recordFsError(output: FindOutput, error: unknown): void {
	if (!(error instanceof FsError)) {
		throw error;
	}

	output.ok = false;
	output.lines.push(...fsError(error.code, error.path));
}

/** 深度優先走訪一個節點：先判斷自己，再依名稱排序往下（隱藏檔也走）。 */
function visit(context: CommandContext, path: string, node: FsNode, name: string, tests: FindTests, output: FindOutput): void {
	if (matchesTests(node, name, tests)) {
		output.lines.push(path);
	}

	if (node.type !== "dir") {
		return;
	}

	// 讀不到的目錄：自己照常列出，但看不到裡面有什麼，跟真的 find 一樣回報沒有權限
	if (!canRead(node)) {
		output.ok = false;
		output.lines.push(...fsError("EACCES", path));
		return;
	}

	let children: FsNode[];

	try {
		children = context.fs.list(context.cwd, path, { includeHidden: true });
	} catch (error) {
		recordFsError(output, error);
		return;
	}

	for (const child of children) {
		visit(context, joinDisplayPath(path, child.name), child, child.name, tests, output);
	}
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

export const findCommand: CommandDefinition = {
	name: "find",
	run(args, context): CommandResult {
		const parsed = parseFindArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const output: FindOutput = { ok: true, lines: [] };

		// 某個起點不存在不中斷，錯誤訊息放在對應位置，繼續處理其他起點
		for (const path of parsed.paths) {
			let node: FsNode;

			try {
				node = context.fs.getNode(context.cwd, path);
			} catch (error) {
				recordFsError(output, error);
				continue;
			}

			visit(context, path, node, startingPointName(path), parsed.tests, output);
		}

		return output;
	},
};
