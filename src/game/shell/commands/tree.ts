/**
 * `tree`：把目錄畫成樹狀圖（M13-3，只開放使用，不在劇本裡）。
 *
 * 輸出格式照 tree 2.x（UTF-8 語系）：第一行是玩家給的路徑（沒給是 `.`），
 * 每個項目前面接 `├── ` 或 `└── `（最後一個），往下一層縮排 `│   ` 或四個空白；
 * 最後空一行接統計 `N directories, M files`（單數用 directory、file，`-d` 時只有目錄數）。
 * 跟 tree 2.x 一樣，根目錄只要有列出任何項目就算進目錄數。
 *
 * 跟真的 tree 不一樣的地方：
 * - 目錄名稱結尾一律加 `/`（等同 `tree -F`），跟遊戲的 `ls` 一致；終端機沒有顏色，新手才分得出檔案與目錄。根照玩家打的字顯示。
 * - 路徑是檔案時只印檔名並算一個檔案（tree 2.x 會在後面標 `[error opening dir]`）。
 * - 路徑不存在印遊戲的繁中錯誤訊息；讀不到的子目錄照列但不往下畫，後面接繁中標記，兩者都算失敗。
 *
 * 支援 `-a`（含隱藏檔）、`-d`（只列目錄）、`-L 層數`（最多往下畫幾層，也可寫成 `-L2`），
 * 單一字母選項可以合併（`-ad`），選項可以放在路徑前後，`--` 之後全部當路徑。
 */

import type { CommandContext, CommandDefinition, CommandResult, FsNode } from "../types";
import { canRead, FsError } from "../types";
import { fsError, invalidTreeLevel, missingOperand, treeUnreadableMark, unknownOption } from "../messages";
import { splitOptionsAndOperands } from "./options";

/** `tree` 的選項。 */
interface TreeOptions {
	/** `-a`：包含隱藏檔。 */
	all: boolean;
	/** `-d`：只列目錄。 */
	dirsOnly: boolean;
	/** `-L`：最多往下畫幾層，null 代表不限。 */
	maxDepth: number | null;
}

type TreeParseResult = { ok: true; options: TreeOptions; paths: string[] } | { ok: false; lines: string[] };

/** 畫的過程累積的輸出與統計。 */
interface TreeOutput {
	lines: string[];
	directories: number;
	files: number;
	ok: boolean;
}

/** 解析 `-L` 的值，必須是正整數。 */
function parseLevel(value: string): number | null {
	if (!/^\d+$/.test(value)) {
		return null;
	}
	const level = Number(value);
	if (level <= 0) {
		return null;
	}
	return level;
}

/** 解析 `tree` 的參數。 */
function parseTreeArgs(args: string[]): TreeParseResult {
	const options: TreeOptions = { all: false, dirsOnly: false, maxDepth: null };
	// 合併旗標以 L 結尾（`-L`、`-dL`）時，下一個參數是層數
	const { options: flagArgs, operands: paths } = splitOptionsAndOperands(args, {
		takesValue: (option) => /^-[ad]*L$/.test(option),
	});
	let index = 0;

	while (index < flagArgs.length) {
		const arg = flagArgs[index];
		index += 1;

		if (arg.startsWith("--")) {
			return { ok: false, lines: unknownOption("tree", arg) };
		}

		const letters = arg.slice(1);
		for (let position = 0; position < letters.length; position += 1) {
			const letter = letters[position];
			if (letter === "a") {
				options.all = true;
				continue;
			}
			if (letter === "d") {
				options.dirsOnly = true;
				continue;
			}
			if (letter !== "L") {
				return { ok: false, lines: unknownOption("tree", `-${letter}`) };
			}

			// `-L` 的值：黏在後面（`-L2`）或是下一個參數（`-L 2`）
			let value = letters.slice(position + 1);
			if (value === "") {
				if (index >= flagArgs.length) {
					return { ok: false, lines: missingOperand("tree", "在 -L 後面接要往下畫幾層，例如 tree -L 2") };
				}
				value = flagArgs[index];
				index += 1;
			}
			const level = parseLevel(value);
			if (level === null) {
				return { ok: false, lines: invalidTreeLevel(value) };
			}
			options.maxDepth = level;
			break;
		}
	}

	return { ok: true, options, paths };
}

/** 依選項挑出要畫的子項：預設不含隱藏檔，`-d` 只留目錄。順序沿用 `fs.list` 的名稱排序。 */
function visibleChildren(context: CommandContext, path: string, options: TreeOptions): FsNode[] {
	const children = context.fs.list(context.cwd, path, { includeHidden: options.all });
	if (!options.dirsOnly) {
		return children;
	}
	return children.filter((child) => child.type === "dir");
}

/** 把路徑跟子項名稱接起來，根是 `/` 時不要變成 `//`。 */
function joinPath(parent: string, name: string): string {
	if (parent.endsWith("/")) {
		return `${parent}${name}`;
	}
	return `${parent}/${name}`;
}

/** 遞迴畫出 `path` 底下的子項。`prefix` 是這一層每行前面的縮排，`depth` 是子項所在的層數（從 1 起算）。 */
function drawChildren(
	context: CommandContext,
	path: string,
	prefix: string,
	depth: number,
	options: TreeOptions,
	output: TreeOutput,
): void {
	const children = visibleChildren(context, path, options);

	children.forEach((child, childIndex) => {
		const isLast = childIndex === children.length - 1;
		let branch = "├── ";
		let nextPrefix = `${prefix}│   `;
		if (isLast) {
			branch = "└── ";
			nextPrefix = `${prefix}    `;
		}

		if (child.type === "file") {
			output.files += 1;
			output.lines.push(`${prefix}${branch}${child.name}`);
			return;
		}

		output.directories += 1;
		if (!canRead(child)) {
			output.ok = false;
			output.lines.push(`${prefix}${branch}${child.name}/  ${treeUnreadableMark()}`);
			return;
		}

		output.lines.push(`${prefix}${branch}${child.name}/`);
		if (options.maxDepth === null || depth < options.maxDepth) {
			drawChildren(context, joinPath(path, child.name), nextPrefix, depth + 1, options, output);
		}
	});
}

/** 畫一個玩家給的路徑：檔案只印名稱，目錄印根再往下畫。 */
function drawRoot(context: CommandContext, path: string, options: TreeOptions, output: TreeOutput): void {
	let node: FsNode;
	try {
		node = context.fs.getNode(context.cwd, path);
	} catch (error) {
		if (!(error instanceof FsError)) {
			throw error;
		}
		output.ok = false;
		output.lines.push(...fsError(error.code, error.path));
		return;
	}

	if (node.type === "file") {
		output.files += 1;
		output.lines.push(path);
		return;
	}

	if (!canRead(node)) {
		output.ok = false;
		output.lines.push(`${path}  ${treeUnreadableMark()}`);
		return;
	}

	output.lines.push(path);
	// tree 2.x：根目錄有列出項目才算進目錄數，空目錄當根是 0 directories
	if (visibleChildren(context, path, options).length > 0) {
		output.directories += 1;
	}
	drawChildren(context, path, "", 1, options, output);
}

/** 統計行：`3 directories, 6 files`，數量是 1 時用單數；`-d` 只有目錄數。 */
function formatSummary(output: TreeOutput, dirsOnly: boolean): string {
	let directoryWord = "directories";
	if (output.directories === 1) {
		directoryWord = "directory";
	}
	const directoryPart = `${output.directories} ${directoryWord}`;
	if (dirsOnly) {
		return directoryPart;
	}

	let fileWord = "files";
	if (output.files === 1) {
		fileWord = "file";
	}
	return `${directoryPart}, ${output.files} ${fileWord}`;
}

export const treeCommand: CommandDefinition = {
	name: "tree",
	run(args, context): CommandResult {
		const parsed = parseTreeArgs(args);
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { options } = parsed;
		let paths = parsed.paths;
		if (paths.length === 0) {
			paths = ["."];
		}

		const output: TreeOutput = { lines: [], directories: 0, files: 0, ok: true };
		for (const path of paths) {
			drawRoot(context, path, options, output);
		}

		return { ok: output.ok, lines: [...output.lines, "", formatSummary(output, options.dirsOnly)] };
	},
};
