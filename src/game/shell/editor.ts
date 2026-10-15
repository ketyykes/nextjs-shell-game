/**
 * nano 編輯器（第十九場，設計文件 4.22）在 shell 這一側的邏輯：開檔、寫檔、寫入權限、離開時的摘要。
 *
 * 流程：`nano` 指令用 `openEditorFile`／`openEditorBuffer` 組出編輯請求（`EditorRequest`），
 * shell 在管線最後、沒有重導向時把它交給 UI；UI 的編輯器（`src/components/terminal/Editor.tsx`）
 * 每次存檔呼叫 `Shell.writeEditorFile`（這裡的 `writeEditorFile`），離開時有存過才呼叫 `Shell.finishEditor`
 * 拿一次執行結果（這裡的 `editorWriteSummary` 組輸出行）交給目標判定。
 *
 * 跟真的 nano 對照：
 * - 讀不到的檔案、目錄直接報錯不開（真的 nano 會開一個空白緩衝區並在狀態列報錯）；上層目錄不存在也直接報錯，
 *   不讓玩家打了半天才發現存不了。
 * - 沒有寫入權限的檔案照樣打開（狀態列提醒），存檔時才失敗，可以改存別的檔名。
 *   寫入權限只看檔案本身的 `w` 碼；目錄的寫入權限不檢查，跟 `>`、`touch`、`mkdir` 一致。
 * - 存檔時內容結尾沒有換行就補一個（nano 預設會補）。
 *
 * 這個檔案跟 shell 引擎一樣不 import React 或 Phaser。
 */

import { joinContentLines, splitContentLines } from "./commands/cat";
import { dirname } from "./fs/path";
import {
	editorNewBuffer,
	editorNewFile,
	editorReadLines,
	editorReadPipe,
	editorUnwritable,
	editorWriteFailed,
	editorWrote,
	editorWroteFile,
	fsError,
	nanoParentMissing,
} from "./messages";
import type { EditorRequest, EditorWrite, EditorWriteResult, FsNode, ShellExecution, VirtualFs } from "./types";
import { canRead, FsError, PLAYER_USER } from "./types";

/**
 * 判斷玩家對某個節點有沒有寫入權限，規則跟 `canRead` 一樣：擁有者是玩家看第二碼，否則看「其他人」的第二碼（第八碼）。
 * 目前只有 nano 存檔時檢查；`>`、`>>` 不檢查（4.22 已知限制）。
 */
export function canWrite(node: FsNode, user: string = PLAYER_USER): boolean {
	const mode = node.mode.padEnd(9, "-");
	if (node.owner === user) {
		return mode[1] === "w";
	}
	return mode[7] === "w";
}

/** 開檔的結果：成功時帶編輯請求，失敗時帶要印的錯誤訊息（算一次錯誤）。 */
export type EditorOpenResult = { ok: true; request: EditorRequest } | { ok: false; lines: string[] };

/**
 * 檔案不存在時檢查上層目錄：存在就是可以建立的新檔案（回傳 null），不存在或中間有一段是檔案時回傳錯誤代碼。
 */
function missingParentError(fs: VirtualFs, cwd: string, fileName: string): "ENOENT" | "ENOTDIR" | null {
	const parent = dirname(fs.resolvePath(cwd, fileName));
	try {
		fs.getDir("/", parent);
		return null;
	} catch (error) {
		if (error instanceof FsError) {
			if (error.code === "ENOTDIR") {
				return "ENOTDIR";
			}
			return "ENOENT";
		}
		throw error;
	}
}

/** `nano 檔名`：讀得到的檔案放進緩衝區，不存在的開空白緩衝區（存檔時才建立）。 */
export function openEditorFile(fs: VirtualFs, cwd: string, fileName: string): EditorOpenResult {
	if (!fs.exists(cwd, fileName)) {
		const parentError = missingParentError(fs, cwd, fileName);
		if (parentError === "ENOENT") {
			return { ok: false, lines: nanoParentMissing(fileName) };
		}
		if (parentError === "ENOTDIR") {
			return { ok: false, lines: fsError("ENOTDIR", fileName) };
		}
		return { ok: true, request: { fileName, content: "", notice: editorNewFile().join(""), cwd } };
	}

	const node = fs.getNode(cwd, fileName);
	if (node.type === "dir") {
		return { ok: false, lines: fsError("EISDIR", fileName) };
	}
	if (!canRead(node)) {
		return { ok: false, lines: fsError("EACCES", fileName) };
	}

	let notice = editorReadLines(splitContentLines(node.content).length).join("");
	if (!canWrite(node)) {
		notice = editorUnwritable(fileName).join("");
	}
	return { ok: true, request: { fileName, content: node.content, notice, cwd } };
}

/** `nano` 沒給檔名：空白緩衝區；接在管線右邊時放左邊指令的輸出。存檔時再問檔名。 */
export function openEditorBuffer(cwd: string, stdin: string[] | null): EditorRequest {
	if (stdin === null) {
		return { fileName: null, content: "", notice: editorNewBuffer().join(""), cwd };
	}
	return { fileName: null, content: joinContentLines(stdin), notice: editorReadPipe(stdin.length).join(""), cwd };
}

/** 要寫進檔案的內容：有內容但結尾沒有換行時補一個（nano 預設），空的維持空的。 */
export function editorFileContent(text: string): string {
	if (text === "" || text.endsWith("\n")) {
		return text;
	}
	return `${text}\n`;
}

/** 寫入失敗的結果。 */
function writeFailed(fileName: string, code: Parameters<typeof editorWriteFailed>[1]): EditorWriteResult {
	return { ok: false, status: editorWriteFailed(fileName, code).join("") };
}

/**
 * 把緩衝區寫進檔案（^O、^S、離開時存檔）。`cwd` 是開啟編輯器當下的工作目錄。
 * 目標是目錄、沒有寫入權限、上層目錄不存在時不寫，回傳原因；成功時回報寫了幾行。
 */
export function writeEditorFile(fs: VirtualFs, cwd: string, fileName: string, text: string): EditorWriteResult {
	if (fs.exists(cwd, fileName)) {
		const node = fs.getNode(cwd, fileName);
		if (node.type === "dir") {
			return writeFailed(fileName, "EISDIR");
		}
		if (!canWrite(node)) {
			return writeFailed(fileName, "EACCES");
		}
	}

	const content = editorFileContent(text);
	try {
		fs.writeFile(cwd, fileName, content);
	} catch (error) {
		if (error instanceof FsError) {
			return writeFailed(fileName, error.code);
		}
		throw error;
	}

	const lineCount = splitContentLines(content).length;
	const write: EditorWrite = { fileName, path: fs.resolvePath(cwd, fileName), lineCount };
	return { ok: true, write, status: editorWrote(lineCount).join("") };
}

/**
 * 離開編輯器後印在輸出區的摘要：每個寫過的檔案一行，順序照第一次寫入；
 * 同一個檔案寫了好幾次（^O 存了又改）只列最後一次的檔名寫法與行數。
 */
export function editorWriteSummary(writes: EditorWrite[]): string[] {
	const latest = new Map<string, EditorWrite>();
	for (const write of writes) {
		latest.set(write.path, write);
	}
	return [...latest.values()].flatMap((write) => editorWroteFile(write.fileName, write.lineCount));
}

/**
 * 這次執行打開的編輯器裡玩家看得到的內容，一行一個元素；沒有開編輯器是空陣列。
 * 跟 `less` 的分頁內容一樣算「這次看得到的輸出」（目標判定的 `visibleOutputLines`、阿彬留言）。
 */
export function editorVisibleLines(execution: ShellExecution): string[] {
	if (execution.editor === undefined) {
		return [];
	}
	return splitContentLines(execution.editor.content);
}
