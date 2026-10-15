// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	editorNewBuffer,
	editorNewFile,
	editorReadLines,
	editorReadPipe,
	editorUnwritable,
	editorWriteFailed,
	editorWrote,
	editorWroteFile,
	nanoOneEditorPerLine,
	nanoParentMissing,
	nanoTooManyFiles,
} from "./messages";
import type { FsErrorCode } from "./types";

/** nano（4.22）的訊息：編輯器狀態列是一行、用 nano 的 `[ ]` 格式；指令錯誤照一般訊息的規則。 */

describe("nano 編輯器狀態列的訊息", () => {
	const statusLines = [
		editorReadLines(3),
		editorNewFile(),
		editorNewBuffer(),
		editorReadPipe(2),
		editorUnwritable("core.cfg"),
		editorWrote(3),
		editorWriteFailed("core.cfg", "EACCES"),
		editorWroteFile("notes.txt", 3),
	];

	it("都是一行，用 [ ] 包起來", () => {
		for (const lines of statusLines) {
			expect(lines).toHaveLength(1);
			expect(lines[0]).toMatch(/^\[ .+ \]$/);
		}
	});

	it("讀寫的行數與檔名放進句子", () => {
		expect(editorReadLines(3)[0]).toContain("3 行");
		expect(editorWrote(0)[0]).toContain("0 行");
		expect(editorWroteFile("notes.txt", 3)[0]).toContain("notes.txt");
		expect(editorWroteFile("notes.txt", 3)[0]).toContain("3 行");
		expect(editorUnwritable("core.cfg")[0]).toContain("core.cfg");
	});

	it("新檔案與沒有檔名的緩衝區說明存檔時才建立、再問檔名", () => {
		expect(editorNewFile()[0]).toContain("Ctrl+O");
		expect(editorNewBuffer()[0]).toContain("檔名");
		expect(editorReadPipe(2)[0]).toContain("|");
	});

	it("寫入失敗依原因說明，並提示可以換檔名再存", () => {
		const reasons: [FsErrorCode, string][] = [
			["EACCES", "沒有寫入權限"],
			["EISDIR", "目錄"],
			["ENOENT", "上層目錄不存在"],
			["ENOTDIR", "檔案"],
		];
		for (const [code, reason] of reasons) {
			const line = editorWriteFailed("x.txt", code)[0];
			expect(line).toContain("x.txt");
			expect(line).toContain(reason);
			expect(line).toContain("Ctrl+O");
		}
	});
});

describe("nano 指令的錯誤訊息", () => {
	it("每個訊息都有內容，指令名稱或路徑放進句子", () => {
		expect(nanoTooManyFiles().join("")).toContain("一次只能開一個檔案");
		expect(nanoParentMissing("logs/today.txt").join("")).toContain("`logs/today.txt`");
		expect(nanoParentMissing("logs/today.txt").join("")).toContain("mkdir");
		expect(nanoOneEditorPerLine().join("")).toContain("nano");
	});
});
