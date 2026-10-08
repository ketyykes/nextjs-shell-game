/**
 * `diff`：逐行比較兩個檔案（M13-3，只開放使用，不在劇本裡）。
 *
 * 預設輸出 GNU diff 的 normal 格式：每段差異一個標頭（`2c2` 改、`4d3` 刪、`5a5,6` 加），
 * 左邊檔案的行前面是 `< `、右邊是 `> `，改的兩邊用 `---` 隔開；兩個檔案一樣時沒有輸出。
 * `-u` 是 unified 格式（`---`／`+++` 標頭加修改時間、`@@ -1,5 +1,6 @@` 區塊、前後各三行上下文），
 * `-q` 只印 `Files a and b differ`。結尾少了換行也算不同，並標出 `\ No newline at end of file`。
 *
 * 差異用最長共同子序列（LCS）算，兩種選法一樣長時先刪後加，跟 GNU diff 在常見情況的結果一致。
 * 有差異時真的 diff 回傳 1，這裡跟 `grep` 沒符合一樣**不算錯誤**（決策 #28），避免懲罰探索。
 *
 * 其中一個參數是目錄時比對目錄裡同名的檔案（GNU 行為）；兩個都是目錄不支援（GNU 會比整個目錄）。
 * `-` 代表管線輸入。不支援 `-r`、`-y`、`-i`、`-w`、`-U 行數` 等其他選項。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { diffDirectories, extraOperand, fsError, missingOperand } from "../messages";
import { parseFlagArgs } from "./fileArgs";

/** 一行內容；`noNewline` 是檔案最後一行而且後面沒有換行。 */
interface DiffLine {
	text: string;
	noNewline: boolean;
}

/** 讀好的一邊：顯示用的名稱、修改時間（`-u` 標頭用）與內容。 */
interface DiffSide {
	label: string;
	mtime: Date;
	lines: DiffLine[];
}

/** 編輯步驟：`equal` 兩邊都有、`delete` 只有左邊、`insert` 只有右邊。`aIndex`、`bIndex` 是步驟開始時兩邊的位置（從 0 起算）。 */
interface DiffOp {
	type: "equal" | "delete" | "insert";
	aIndex: number;
	bIndex: number;
}

/** 一段連續的差異：在 `ops` 裡的範圍 `[opStart, opEnd)`。 */
interface ChangeBlock {
	opStart: number;
	opEnd: number;
}

type SideResult = { ok: true; side: DiffSide } | { ok: false; lines: string[] };

/** unified 格式每段差異前後帶幾行上下文，跟 GNU diff 的預設一樣。 */
const UNIFIED_CONTEXT = 3;

/** 結尾少換行的標記，GNU diff 的原文。 */
const NO_NEWLINE_MARKER = "\\ No newline at end of file";

const USAGE = "diff [-u] [-q] 檔案1 檔案2";

/** 把檔案內容切成行，記下最後一行有沒有換行。 */
function toDiffLines(content: string): DiffLine[] {
	if (content === "") {
		return [];
	}
	const texts = content.split("\n");
	if (texts[texts.length - 1] === "") {
		texts.pop();
		return texts.map((text) => ({ text, noNewline: false }));
	}
	return texts.map((text, index) => ({ text, noNewline: index === texts.length - 1 }));
}

/** 兩行是否相同：內容一樣，而且結尾有沒有換行也一樣。 */
function sameLine(a: DiffLine, b: DiffLine): boolean {
	return a.text === b.text && a.noNewline === b.noNewline;
}

/** 路徑是不是目錄；`-`（管線輸入）不是。不存在時回傳錯誤訊息。 */
function checkIsDir(context: CommandContext, path: string): { ok: true; isDir: boolean } | { ok: false; lines: string[] } {
	if (path === "-") {
		return { ok: true, isDir: false };
	}
	try {
		return { ok: true, isDir: context.fs.getNode(context.cwd, path).type === "dir" };
	} catch (error) {
		if (!(error instanceof FsError)) {
			throw error;
		}
		return { ok: false, lines: fsError(error.code, error.path) };
	}
}

/** 讀一個檔案；`-` 讀管線輸入。 */
function readSide(context: CommandContext, path: string): SideResult {
	if (path === "-") {
		const stdin = context.stdin ?? [];
		return {
			ok: true,
			side: { label: "-", mtime: new Date(), lines: stdin.map((text) => ({ text, noNewline: false })) },
		};
	}

	try {
		const content = context.fs.readFile(context.cwd, path);
		const node = context.fs.getNode(context.cwd, path);
		return { ok: true, side: { label: path, mtime: new Date(node.mtime), lines: toDiffLines(content) } };
	} catch (error) {
		if (!(error instanceof FsError)) {
			throw error;
		}
		return { ok: false, lines: fsError(error.code, error.path) };
	}
}

/** 路徑最後一段的名稱。 */
function baseName(path: string): string {
	const parts = path.split("/").filter((part) => part !== "");
	return parts[parts.length - 1] ?? path;
}

/** 目錄路徑接上檔名。 */
function joinPath(dir: string, name: string): string {
	if (dir.endsWith("/")) {
		return `${dir}${name}`;
	}
	return `${dir}/${name}`;
}

/**
 * 決定實際要比的兩個路徑：一邊是目錄時換成目錄裡跟另一邊同名的檔案；兩邊都是目錄時回傳錯誤。
 * 不存在的路徑在這裡就回報。
 */
function resolvePaths(
	context: CommandContext,
	first: string,
	second: string,
): { ok: true; first: string; second: string } | { ok: false; lines: string[] } {
	const firstCheck = checkIsDir(context, first);
	if (!firstCheck.ok) {
		return firstCheck;
	}
	const secondCheck = checkIsDir(context, second);
	if (!secondCheck.ok) {
		return secondCheck;
	}

	if (firstCheck.isDir && secondCheck.isDir) {
		return { ok: false, lines: diffDirectories(first, second) };
	}
	if (firstCheck.isDir) {
		return { ok: true, first: joinPath(first, baseName(second)), second };
	}
	if (secondCheck.isDir) {
		return { ok: true, first, second: joinPath(second, baseName(first)) };
	}
	return { ok: true, first, second };
}

/**
 * 用 LCS 算出編輯步驟。`suffix[i][j]` 是 `a[i:]` 與 `b[j:]` 的 LCS 長度；
 * 從頭往後走，相同就配對，否則看哪一邊拿掉後 LCS 比較長，一樣長時先刪左邊的行。
 *
 * 結果一定是最少的增刪，但 LCS 有好幾種一樣長的選法時（例如一串重複的行刪掉其中一行），
 * 選哪一行不保證跟 GNU diff 一樣：GNU 用 Myers 演算法加上邊界滑動。用 GNU diff 3.8 對照 300 組隨機的
 *「改一到三行」檔案（normal 與 -u 共 600 份輸出），有 7 份不同，都是這種一樣長的等價選法。
 */
function computeOps(a: DiffLine[], b: DiffLine[]): DiffOp[] {
	const suffix: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			if (sameLine(a[i], b[j])) {
				suffix[i][j] = suffix[i + 1][j + 1] + 1;
			} else {
				suffix[i][j] = Math.max(suffix[i + 1][j], suffix[i][j + 1]);
			}
		}
	}

	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && sameLine(a[i], b[j])) {
			ops.push({ type: "equal", aIndex: i, bIndex: j });
			i += 1;
			j += 1;
		} else if (j >= b.length || (i < a.length && suffix[i + 1][j] >= suffix[i][j + 1])) {
			ops.push({ type: "delete", aIndex: i, bIndex: j });
			i += 1;
		} else {
			ops.push({ type: "insert", aIndex: i, bIndex: j });
			j += 1;
		}
	}
	return ops;
}

/** 找出連續的差異區段。 */
function findBlocks(ops: DiffOp[]): ChangeBlock[] {
	const blocks: ChangeBlock[] = [];
	let index = 0;
	while (index < ops.length) {
		if (ops[index].type === "equal") {
			index += 1;
			continue;
		}
		const opStart = index;
		while (index < ops.length && ops[index].type !== "equal") {
			index += 1;
		}
		blocks.push({ opStart, opEnd: index });
	}
	return blocks;
}

/** 一個區段裡刪掉與加入的行數。 */
function countBlock(ops: DiffOp[], block: ChangeBlock): { deleted: number; inserted: number } {
	let deleted = 0;
	let inserted = 0;
	for (let index = block.opStart; index < block.opEnd; index += 1) {
		if (ops[index].type === "delete") {
			deleted += 1;
		} else {
			inserted += 1;
		}
	}
	return { deleted, inserted };
}

/** 一行加上前綴，最後一行沒換行時多接一行標記。 */
function emitLine(prefix: string, line: DiffLine): string[] {
	if (line.noNewline) {
		return [`${prefix}${line.text}`, NO_NEWLINE_MARKER];
	}
	return [`${prefix}${line.text}`];
}

/** normal 格式的範圍：一行是 `3`，多行是 `3,5`。 */
function normalRange(start: number, count: number): string {
	if (count === 1) {
		return `${start}`;
	}
	return `${start},${start + count - 1}`;
}

/** GNU normal 格式。 */
function formatNormal(a: DiffLine[], b: DiffLine[], ops: DiffOp[], blocks: ChangeBlock[]): string[] {
	const output: string[] = [];

	for (const block of blocks) {
		const first = ops[block.opStart];
		const { deleted, inserted } = countBlock(ops, block);

		if (deleted > 0 && inserted > 0) {
			output.push(`${normalRange(first.aIndex + 1, deleted)}c${normalRange(first.bIndex + 1, inserted)}`);
		} else if (deleted > 0) {
			output.push(`${normalRange(first.aIndex + 1, deleted)}d${first.bIndex}`);
		} else {
			output.push(`${first.aIndex}a${normalRange(first.bIndex + 1, inserted)}`);
		}

		for (let offset = 0; offset < deleted; offset += 1) {
			output.push(...emitLine("< ", a[first.aIndex + offset]));
		}
		if (deleted > 0 && inserted > 0) {
			output.push("---");
		}
		for (let offset = 0; offset < inserted; offset += 1) {
			output.push(...emitLine("> ", b[first.bIndex + offset]));
		}
	}

	return output;
}

/** 兩位數補零。 */
function pad(value: number, width = 2): string {
	return String(value).padStart(width, "0");
}

/** `-u` 標頭的時間，照 GNU diff 的格式，用 UTC（跟 `ls -l` 一樣）。 */
function formatTimestamp(date: Date): string {
	const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
	const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
	return `${day} ${time}.${pad(date.getUTCMilliseconds(), 3)}000000 +0000`;
}

/** unified 格式的範圍：一行省略長度，零行時起點是前一行。 */
function unifiedRange(position: number, count: number): string {
	if (count === 0) {
		return `${position},0`;
	}
	if (count === 1) {
		return `${position + 1}`;
	}
	return `${position + 1},${count}`;
}

/** 把差異區段分組：中間相同的行不超過兩倍上下文就併成同一塊，跟 GNU 一樣。 */
function groupBlocks(blocks: ChangeBlock[]): ChangeBlock[][] {
	const groups: ChangeBlock[][] = [];
	for (const block of blocks) {
		const current = groups[groups.length - 1];
		if (current !== undefined && block.opStart - current[current.length - 1].opEnd <= UNIFIED_CONTEXT * 2) {
			current.push(block);
		} else {
			groups.push([block]);
		}
	}
	return groups;
}

/** GNU unified 格式（`-u`）。 */
function formatUnified(left: DiffSide, right: DiffSide, ops: DiffOp[], blocks: ChangeBlock[]): string[] {
	const output = [
		`--- ${left.label}\t${formatTimestamp(left.mtime)}`,
		`+++ ${right.label}\t${formatTimestamp(right.mtime)}`,
	];

	for (const group of groupBlocks(blocks)) {
		const from = Math.max(0, group[0].opStart - UNIFIED_CONTEXT);
		const to = Math.min(ops.length, group[group.length - 1].opEnd + UNIFIED_CONTEXT);
		const body: string[] = [];
		let aCount = 0;
		let bCount = 0;
		let index = from;

		while (index < to) {
			const op = ops[index];
			if (op.type === "equal") {
				body.push(...emitLine(" ", left.lines[op.aIndex]));
				aCount += 1;
				bCount += 1;
				index += 1;
				continue;
			}

			// 一段差異裡先印全部刪掉的行，再印全部加入的行
			const deletedLines: string[] = [];
			const insertedLines: string[] = [];
			while (index < to && ops[index].type !== "equal") {
				const change = ops[index];
				if (change.type === "delete") {
					deletedLines.push(...emitLine("-", left.lines[change.aIndex]));
					aCount += 1;
				} else {
					insertedLines.push(...emitLine("+", right.lines[change.bIndex]));
					bCount += 1;
				}
				index += 1;
			}
			body.push(...deletedLines, ...insertedLines);
		}

		const start = ops[from];
		output.push(`@@ -${unifiedRange(start.aIndex, aCount)} +${unifiedRange(start.bIndex, bCount)} @@`, ...body);
	}

	return output;
}

export const diffCommand: CommandDefinition = {
	name: "diff",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("diff", args, "uq");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { flags, operands } = parsed;
		if (operands.length < 2) {
			return { ok: false, lines: missingOperand("diff", "兩個要比較的檔案，例如 diff core.cfg backup/core.cfg") };
		}
		if (operands.length > 2) {
			return { ok: false, lines: extraOperand("diff", operands[2], USAGE) };
		}

		const paths = resolvePaths(context, operands[0], operands[1]);
		if (!paths.ok) {
			return { ok: false, lines: paths.lines };
		}

		const left = readSide(context, paths.first);
		if (!left.ok) {
			return { ok: false, lines: left.lines };
		}
		const right = readSide(context, paths.second);
		if (!right.ok) {
			return { ok: false, lines: right.lines };
		}

		const ops = computeOps(left.side.lines, right.side.lines);
		const blocks = findBlocks(ops);
		if (blocks.length === 0) {
			return { ok: true, lines: [] };
		}

		// 有差異不算錯誤（決策 #28 的延伸：跟 grep 沒符合一樣，避免懲罰探索）
		if (flags.has("q")) {
			return { ok: true, lines: [`Files ${left.side.label} and ${right.side.label} differ`] };
		}
		if (flags.has("u")) {
			return { ok: true, lines: formatUnified(left.side, right.side, ops, blocks) };
		}
		return { ok: true, lines: formatNormal(left.side.lines, right.side.lines, ops, blocks) };
	},
};
