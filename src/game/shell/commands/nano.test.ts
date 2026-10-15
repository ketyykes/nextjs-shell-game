// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	editorNewBuffer,
	editorNewFile,
	editorReadLines,
	editorReadPipe,
	fsError,
	nanoTooManyFiles,
	unknownOption,
} from "../messages";
import { HOME_DIR } from "../types";
import { nanoCommand } from "./nano";
import { createContext, WAKE_UP_CONTENT } from "./testFixtures";

const WAKE_UP_LINES = ["喚醒排程：三年後", "原始設定：永不", "修改者："];

describe("nano 編輯請求", () => {
	it("指令名稱是 nano", () => {
		expect(nanoCommand.name).toBe("nano");
	});

	it("既有檔案：要求開編輯器，lines 是不在終端機時的輸出（檔案內容，同 less）", () => {
		expect(nanoCommand.run(["wake_up.txt"], createContext())).toEqual({
			ok: true,
			lines: WAKE_UP_LINES,
			editor: { fileName: "wake_up.txt", content: WAKE_UP_CONTENT, notice: editorReadLines(3).join(""), cwd: HOME_DIR },
		});
	});

	it("不存在的檔案開空白緩衝區，還不建立檔案", () => {
		const context = createContext();
		const result = nanoCommand.run(["todo.txt"], context);

		expect(result).toEqual({
			ok: true,
			lines: [],
			editor: { fileName: "todo.txt", content: "", notice: editorNewFile().join(""), cwd: HOME_DIR },
		});
		expect(context.fs.exists(HOME_DIR, "todo.txt")).toBe(false);
	});

	it("沒給檔名：空白緩衝區、沒有檔名；- 也一樣", () => {
		const expected = {
			ok: true,
			lines: [],
			editor: { fileName: null, content: "", notice: editorNewBuffer().join(""), cwd: HOME_DIR },
		};

		expect(nanoCommand.run([], createContext())).toEqual(expected);
		expect(nanoCommand.run(["-"], createContext())).toEqual(expected);
	});

	it("接在管線右邊：左邊的輸出放進緩衝區", () => {
		expect(nanoCommand.run([], createContext({ stdin: ["a", "b"] }))).toEqual({
			ok: true,
			lines: ["a", "b"],
			editor: { fileName: null, content: "a\nb\n", notice: editorReadPipe(2).join(""), cwd: HOME_DIR },
		});
	});
});

describe("nano 錯誤", () => {
	it("一次給兩個檔名", () => {
		expect(nanoCommand.run(["a.txt", "b.txt"], createContext())).toEqual({ ok: false, lines: nanoTooManyFiles() });
	});

	it("不支援選項", () => {
		expect(nanoCommand.run(["-l", "wake_up.txt"], createContext())).toEqual({
			ok: false,
			lines: unknownOption("nano", "-l"),
		});
	});

	it("目錄不能編輯", () => {
		expect(nanoCommand.run(["pod_01"], createContext())).toEqual({ ok: false, lines: fsError("EISDIR", "pod_01") });
	});
});
