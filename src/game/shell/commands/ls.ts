/**
 * `ls`：列出目錄內容。
 *
 * 支援 `-a`（含隱藏檔與 `./`、`../`）、`-l`（詳細格式）與兩者任意組合，
 * 可以接多個路徑，路徑也可以是檔案。
 *
 * 輸出一律一個項目一行，不做多欄排列，因為終端機寬度未知；
 * 目錄名稱結尾加 `/`，讓新手一眼看出哪些是目錄。
 */

import type { CommandContext, CommandDefinition, CommandResult, FsDirNode, FsNode } from "../types";
import { FsError } from "../types";
import { getNodeSize } from "../fs";
import { fsError, unknownOption } from "../messages";

// ---------------------------------------------------------------------------
// 選項解析
// ---------------------------------------------------------------------------

/** `ls` 支援的選項。 */
export interface LsOptions {
	/** `-a`：包含隱藏檔，並在最前面列出 `./` 與 `../`。 */
	all: boolean;
	/** `-l`：詳細格式。 */
	long: boolean;
}

/** 選項解析結果：成功時帶選項與路徑，失敗時帶要印出的錯誤訊息。 */
export type LsParseResult =
	| { ok: true; options: LsOptions; paths: string[] }
	| { ok: false; lines: string[] };

/** 可以接受的選項字母。 */
const SUPPORTED_FLAGS = new Set(["a", "l"]);

/**
 * 解析 `ls` 的參數。
 * - `-a`、`-l`、`-la`、`-al`、`-a -l` 等組合都可以
 * - 其他字母或 `--xxx` 長選項回傳 `unknownOption`
 * - `--` 之後全部當成路徑
 * - 不以 `-` 開頭的參數是路徑；單獨的 `-` 也當成路徑（跟 bash 一樣）
 */
export function parseLsArgs(args: string[]): LsParseResult {
	const options: LsOptions = { all: false, long: false };
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
			return { ok: false, lines: unknownOption("ls", arg) };
		}

		for (const flag of arg.slice(1)) {
			if (!SUPPORTED_FLAGS.has(flag)) {
				return { ok: false, lines: unknownOption("ls", `-${flag}`) };
			}

			if (flag === "a") {
				options.all = true;
			} else {
				options.long = true;
			}
		}
	}

	return { ok: true, options, paths };
}

// ---------------------------------------------------------------------------
// 格式化單一節點
// ---------------------------------------------------------------------------

/** `-l` 格式中需要對齊的欄位寬度。 */
export interface LongLineWidths {
	/** 擁有者欄位寬度，靠左對齊，右邊補空白。 */
	owner: number;
	/** 大小欄位寬度，靠右對齊，左邊補空白。 */
	size: number;
}

/** 補零到兩位數。 */
function padTwoDigits(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * 把 ISO 8601 的 mtime 轉成 `YYYY-MM-DD HH:MM`。
 * 一律用 UTC，不用本機時區，玩家在哪裡看到的日期都一樣，測試也才穩定。
 * 無法解析的字串原樣回傳，避免劇本寫錯時整個 `ls -l` 壞掉。
 */
export function formatMtime(iso: string): string {
	const date = new Date(iso);

	if (Number.isNaN(date.getTime())) {
		return iso;
	}

	const year = String(date.getUTCFullYear()).padStart(4, "0");
	const month = padTwoDigits(date.getUTCMonth() + 1);
	const day = padTwoDigits(date.getUTCDate());
	const hours = padTwoDigits(date.getUTCHours());
	const minutes = padTwoDigits(date.getUTCMinutes());

	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/** 顯示用名稱：目錄結尾加 `/`，檔案原樣。 */
export function formatDisplayName(node: FsNode, name: string): string {
	if (node.type === "dir") {
		return `${name}/`;
	}

	return name;
}

/** 類型字元加九碼權限，例如 `drwxr-xr-x`、`-rw-r--r--`。 */
function formatModeColumn(node: FsNode): string {
	if (node.type === "dir") {
		return `d${node.mode}`;
	}

	return `-${node.mode}`;
}

/**
 * 產生 `-l` 格式的一行：
 * `<類型+權限>  <擁有者>  <大小>  <日期>  <名稱>`，欄位間兩個空格。
 *
 * 例如 `-rw-r--r--  tech  42  2031-03-12 08:15  wake_up.txt`。
 * `name` 傳原始名稱，目錄會自動加 `/`；`widths` 不給時不補空白。
 */
export function formatLongLine(node: FsNode, name: string, widths?: Partial<LongLineWidths>): string {
	const ownerWidth = widths?.owner ?? 0;
	const sizeWidth = widths?.size ?? 0;
	const columns = [
		formatModeColumn(node),
		node.owner.padEnd(ownerWidth, " "),
		String(getNodeSize(node)).padStart(sizeWidth, " "),
		formatMtime(node.mtime),
		formatDisplayName(node, name),
	];

	return columns.join("  ");
}

// ---------------------------------------------------------------------------
// 列一個目錄或檔案
// ---------------------------------------------------------------------------

/** 準備輸出的一個項目：節點與要顯示的名稱（`./`、`../` 的名稱跟節點本身的 name 不同）。 */
interface ListEntry {
	node: FsNode;
	name: string;
}

/** 計算一組項目在 `-l` 格式下的對齊寬度。 */
function computeWidths(entries: ListEntry[]): LongLineWidths {
	const widths: LongLineWidths = { owner: 0, size: 0 };

	for (const entry of entries) {
		widths.owner = Math.max(widths.owner, entry.node.owner.length);
		widths.size = Math.max(widths.size, String(getNodeSize(entry.node)).length);
	}

	return widths;
}

/** 把一組項目格式化成輸出行，簡潔模式一行一個名稱，`-l` 模式一行一筆詳細資料。 */
function formatEntries(entries: ListEntry[], long: boolean): string[] {
	if (!long) {
		return entries.map((entry) => formatDisplayName(entry.node, entry.name));
	}

	const widths = computeWidths(entries);
	return entries.map((entry) => formatLongLine(entry.node, entry.name, widths));
}

/**
 * 列出一個目錄的內容。
 * `-a` 時最前面加 `./`（目錄自己）與 `../`（父目錄，根目錄的父目錄就是自己）。
 * `-l` 時第一行是 `total <項目數>`，項目數包含 `./` 與 `../`。
 */
function listDirectory(context: CommandContext, path: string, dir: FsDirNode, options: LsOptions): string[] {
	const entries: ListEntry[] = [];

	if (options.all) {
		const absolutePath = context.fs.resolvePath(context.cwd, path);
		const parent = context.fs.getDir(absolutePath, "..");
		entries.push({ node: dir, name: "." });
		entries.push({ node: parent, name: ".." });
	}

	const children = context.fs.list(context.cwd, path, { includeHidden: options.all });

	for (const child of children) {
		entries.push({ node: child, name: child.name });
	}

	const lines = formatEntries(entries, options.long);

	if (options.long) {
		return [`total ${entries.length}`, ...lines];
	}

	return lines;
}

/** 單一路徑的處理結果。 */
interface PathListing {
	ok: boolean;
	lines: string[];
}

/**
 * 列出一個路徑：目錄列內容，檔案只印它自己（名稱用玩家輸入的原字串，跟 bash 一樣）。
 * 路徑不存在或中間不是目錄時回傳錯誤訊息。
 */
function listPath(context: CommandContext, path: string, options: LsOptions): PathListing {
	try {
		const node = context.fs.getNode(context.cwd, path);

		if (node.type === "file") {
			return { ok: true, lines: formatEntries([{ node, name: path }], options.long) };
		}

		return { ok: true, lines: listDirectory(context, path, node, options) };
	} catch (error) {
		if (error instanceof FsError) {
			return { ok: false, lines: fsError(error.code, error.path) };
		}

		throw error;
	}
}

// ---------------------------------------------------------------------------
// 指令本體
// ---------------------------------------------------------------------------

export const lsCommand: CommandDefinition = {
	name: "ls",
	run(args, context): CommandResult {
		const parsed = parseLsArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { options } = parsed;
		let paths = parsed.paths;

		if (paths.length === 0) {
			paths = ["."];
		}

		// 只有一個路徑時不加標題，直接輸出
		if (paths.length === 1) {
			return listPath(context, paths[0], options);
		}

		// 多個路徑：每個路徑一個區塊，第一行是 `<路徑>:`，區塊之間空一行
		const lines: string[] = [];
		let ok = true;

		paths.forEach((path, index) => {
			if (index > 0) {
				lines.push("");
			}

			const listing = listPath(context, path, options);

			if (!listing.ok) {
				ok = false;
			}

			lines.push(`${path}:`, ...listing.lines);
		});

		return { ok, lines };
	},
};
