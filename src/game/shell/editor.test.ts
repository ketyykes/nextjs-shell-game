// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "./fs";
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
import {
	canWrite,
	editorFileContent,
	editorVisibleLines,
	editorWriteSummary,
	openEditorBuffer,
	openEditorFile,
	writeEditorFile,
} from "./editor";
import type { FsFileNode, ShellExecution } from "./types";
import { HOME_DIR } from "./types";

/** 家目錄底下：自己的筆記、唯讀的檔案、別人的檔案、鎖住的檔案、一個子目錄。 */
function createFs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot({
		home: {
			tech: {
				"notes.txt": "第一行\n第二行\n第三行\n",
				"readonly.txt": { $type: "file", content: "不能改\n", mode: "r--r--r--" },
				"nova.cfg": { $type: "file", content: "MODE=core\n", owner: "nova" },
				"locked.txt": { $type: "file", content: "秘密\n", mode: "---------" },
				repair: {},
			},
		},
	});
}

function fileNode(owner: string, mode: string): FsFileNode {
	return { type: "file", name: "x", content: "", mtime: "2031-03-12T08:15:00Z", owner, mode };
}

describe("canWrite", () => {
	it("擁有者是玩家看前三碼的 w，否則看最後三碼", () => {
		expect(canWrite(fileNode("tech", "rw-r--r--"))).toBe(true);
		expect(canWrite(fileNode("tech", "r--rw-rw-"))).toBe(false);
		expect(canWrite(fileNode("nova", "rw-r--r--"))).toBe(false);
		expect(canWrite(fileNode("nova", "r--r--rw-"))).toBe(true);
	});
});

describe("openEditorFile", () => {
	it("讀得到的檔案：內容原樣放進緩衝區，狀態列說讀了幾行，記下開啟當下的工作目錄", () => {
		expect(openEditorFile(createFs(), HOME_DIR, "notes.txt")).toEqual({
			ok: true,
			request: {
				fileName: "notes.txt",
				content: "第一行\n第二行\n第三行\n",
				notice: editorReadLines(3).join(""),
				cwd: HOME_DIR,
			},
		});
	});

	it("沒有寫入權限的檔案照樣打開，狀態列先提醒存不了", () => {
		const own = openEditorFile(createFs(), HOME_DIR, "readonly.txt");
		const others = openEditorFile(createFs(), HOME_DIR, "nova.cfg");

		expect(own).toMatchObject({ ok: true, request: { content: "不能改\n", notice: editorUnwritable("readonly.txt").join("") } });
		expect(others).toMatchObject({ ok: true, request: { notice: editorUnwritable("nova.cfg").join("") } });
	});

	it("不存在的檔案開空白緩衝區，離開存檔時才建立", () => {
		const fs = createFs();
		const result = openEditorFile(fs, HOME_DIR, "repair/todo.txt");

		expect(result).toEqual({
			ok: true,
			request: { fileName: "repair/todo.txt", content: "", notice: editorNewFile().join(""), cwd: HOME_DIR },
		});
		expect(fs.exists(HOME_DIR, "repair/todo.txt")).toBe(false);
	});

	it("目錄、讀不到的檔案照 cat 的訊息報錯", () => {
		expect(openEditorFile(createFs(), HOME_DIR, "repair")).toEqual({ ok: false, lines: fsError("EISDIR", "repair") });
		expect(openEditorFile(createFs(), HOME_DIR, "locked.txt")).toEqual({ ok: false, lines: fsError("EACCES", "locked.txt") });
	});

	it("上層目錄不存在時直接說明，不開一個存不了的緩衝區", () => {
		expect(openEditorFile(createFs(), HOME_DIR, "logs/today.txt")).toEqual({
			ok: false,
			lines: nanoParentMissing("logs/today.txt"),
		});
	});

	it("路徑中間有一段是檔案時照路徑錯誤報", () => {
		expect(openEditorFile(createFs(), HOME_DIR, "notes.txt/x")).toEqual({ ok: false, lines: fsError("ENOTDIR", "notes.txt/x") });
	});
});

describe("openEditorBuffer", () => {
	it("沒給檔名也沒有管線：空白緩衝區，存檔時再問檔名", () => {
		expect(openEditorBuffer("/deck1", null)).toEqual({
			fileName: null,
			content: "",
			notice: editorNewBuffer().join(""),
			cwd: "/deck1",
		});
	});

	it("接在管線右邊：左邊的輸出放進緩衝區", () => {
		expect(openEditorBuffer(HOME_DIR, ["a", "b"])).toEqual({
			fileName: null,
			content: "a\nb\n",
			notice: editorReadPipe(2).join(""),
			cwd: HOME_DIR,
		});
	});
});

describe("editorFileContent", () => {
	it("有內容但結尾沒換行時補一個（nano 預設），空的維持空的", () => {
		expect(editorFileContent("")).toBe("");
		expect(editorFileContent("a")).toBe("a\n");
		expect(editorFileContent("a\n")).toBe("a\n");
		expect(editorFileContent("a\n\nb")).toBe("a\n\nb\n");
	});
});

describe("writeEditorFile", () => {
	it("新檔案：建立、結尾補換行，回報寫了幾行", () => {
		const fs = createFs();
		const result = writeEditorFile(fs, HOME_DIR, "repair/todo.txt", "換濾網\n檢查 B3");

		expect(result).toEqual({
			ok: true,
			write: { fileName: "repair/todo.txt", path: "/home/tech/repair/todo.txt", lineCount: 2 },
			status: editorWrote(2).join(""),
		});
		expect(fs.readFile("/", "/home/tech/repair/todo.txt")).toBe("換濾網\n檢查 B3\n");
	});

	it("相對路徑照開啟編輯器當下的工作目錄解析", () => {
		const fs = createFs();
		writeEditorFile(fs, "/home/tech/repair", "todo.txt", "x");

		expect(fs.readFile("/", "/home/tech/repair/todo.txt")).toBe("x\n");
	});

	it("既有檔案整份覆寫；空的緩衝區寫成空檔、0 行", () => {
		const fs = createFs();
		const result = writeEditorFile(fs, HOME_DIR, "notes.txt", "");

		expect(result).toMatchObject({ ok: true, write: { lineCount: 0 }, status: editorWrote(0).join("") });
		expect(fs.readFile(HOME_DIR, "notes.txt")).toBe("");
	});

	it("沒有寫入權限、目標是目錄、上層目錄不存在都寫不進去，檔案不變", () => {
		const fs = createFs();

		expect(writeEditorFile(fs, HOME_DIR, "readonly.txt", "改")).toEqual({
			ok: false,
			status: editorWriteFailed("readonly.txt", "EACCES").join(""),
		});
		expect(writeEditorFile(fs, HOME_DIR, "nova.cfg", "改")).toEqual({
			ok: false,
			status: editorWriteFailed("nova.cfg", "EACCES").join(""),
		});
		expect(writeEditorFile(fs, HOME_DIR, "repair", "改")).toEqual({
			ok: false,
			status: editorWriteFailed("repair", "EISDIR").join(""),
		});
		expect(writeEditorFile(fs, HOME_DIR, "logs/today.txt", "改")).toEqual({
			ok: false,
			status: editorWriteFailed("logs/today.txt", "ENOENT").join(""),
		});
		expect(fs.readFile(HOME_DIR, "readonly.txt")).toBe("不能改\n");
		expect(fs.readFile(HOME_DIR, "nova.cfg")).toBe("MODE=core\n");
	});
});

describe("editorWriteSummary", () => {
	it("每個寫過的檔案一行；同一個檔案寫好幾次只列最後一次的行數，順序照第一次寫入", () => {
		const lines = editorWriteSummary([
			{ fileName: "a.txt", path: "/home/tech/a.txt", lineCount: 3 },
			{ fileName: "b.txt", path: "/home/tech/b.txt", lineCount: 1 },
			{ fileName: "/home/tech/a.txt", path: "/home/tech/a.txt", lineCount: 5 },
		]);

		expect(lines).toEqual([...editorWroteFile("/home/tech/a.txt", 5), ...editorWroteFile("b.txt", 1)]);
	});
});

describe("editorVisibleLines", () => {
	const base: ShellExecution = {
		input: "nano notes.txt",
		lines: [],
		isError: false,
		clearScreen: false,
		cwd: HOME_DIR,
		env: {},
		processes: [],
		hintUsed: false,
	};

	it("打開編輯器時玩家看得到的內容，一行一個元素", () => {
		const editor = { fileName: "notes.txt", content: "a\nb\n", notice: "", cwd: HOME_DIR };

		expect(editorVisibleLines({ ...base, editor })).toEqual(["a", "b"]);
	});

	it("沒有開編輯器是空陣列", () => {
		expect(editorVisibleLines(base)).toEqual([]);
	});
});
