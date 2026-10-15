// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { EditorRequest, EditorWriteResult } from "@/game/shell/types";
import {
	createEditorState,
	EDITOR_MESSAGES,
	editorCommandForKey,
	editorFileLabel,
	editorKeyHints,
	editorPromptLabel,
	findInContent,
	isModified,
	runEditorCommand,
	setPromptInput,
} from "./editorModel";
import type { EditorCommandEnv, EditorKeyInput, EditorState } from "./editorModel";

const REQUEST: EditorRequest = { fileName: "notes.txt", content: "第一行\n", notice: "[ 已讀取 1 行 ]", cwd: "/home/tech" };

function key(value: string, overrides: Partial<EditorKeyInput> = {}): EditorKeyInput {
	return { key: value, ctrlKey: false, metaKey: false, altKey: false, ...overrides };
}

function ctrl(letter: string, overrides: Partial<EditorKeyInput> = {}): EditorKeyInput {
	return key(letter, { ctrlKey: true, ...overrides });
}

/** 假的寫檔：成功時照 shell 的格式回報，檔名含 `locked` 時失敗。 */
function fakeWrite(fileName: string, content: string): EditorWriteResult {
	if (fileName.includes("locked")) {
		return { ok: false, status: `[ 無法寫入 ${fileName} ]` };
	}
	const lineCount = content === "" ? 0 : content.replace(/\n$/, "").split("\n").length;
	return {
		ok: true,
		write: { fileName, path: `/home/tech/${fileName}`, lineCount },
		status: `[ 已寫入 ${lineCount} 行 ]`,
	};
}

function env(content: string, overrides: Partial<EditorCommandEnv> = {}): EditorCommandEnv {
	return { content, selection: { start: 0, end: 0 }, write: fakeWrite, ...overrides };
}

describe("editorCommandForKey", () => {
	it("編輯中：^O／F3 寫入、^S 存檔、^X／Esc／F2 離開、^W／F6 搜尋、^G／F1 說明、Tab 插入定位字元", () => {
		expect(editorCommandForKey("edit", ctrl("o"))).toBe("write");
		expect(editorCommandForKey("edit", key("F3"))).toBe("write");
		expect(editorCommandForKey("edit", ctrl("s"))).toBe("save");
		expect(editorCommandForKey("edit", ctrl("x"))).toBe("exit");
		expect(editorCommandForKey("edit", key("Escape"))).toBe("exit");
		expect(editorCommandForKey("edit", key("F2"))).toBe("exit");
		expect(editorCommandForKey("edit", ctrl("w"))).toBe("search");
		expect(editorCommandForKey("edit", key("F6"))).toBe("search");
		expect(editorCommandForKey("edit", ctrl("g"))).toBe("help");
		expect(editorCommandForKey("edit", key("F1"))).toBe("help");
		expect(editorCommandForKey("edit", key("Tab"))).toBe("insertTab");
	});

	it("編輯中：一般字、^C（複製）、Mac 的 command 與 Alt 組合都交給瀏覽器", () => {
		expect(editorCommandForKey("edit", key("o"))).toBeNull();
		expect(editorCommandForKey("edit", key("Enter"))).toBeNull();
		expect(editorCommandForKey("edit", ctrl("c"))).toBeNull();
		expect(editorCommandForKey("edit", ctrl("v"))).toBeNull();
		expect(editorCommandForKey("edit", key("o", { metaKey: true }))).toBeNull();
		expect(editorCommandForKey("edit", key("x", { altKey: true }))).toBeNull();
	});

	it("大寫（按著 Shift）與非英文鍵盤配置照實體鍵位認", () => {
		expect(editorCommandForKey("edit", ctrl("O"))).toBe("write");
		expect(editorCommandForKey("edit", ctrl("щ", { code: "KeyO" }))).toBe("write");
	});

	it("離開確認：Y 是、N 否、^C 或 Esc 取消，其他鍵不認", () => {
		expect(editorCommandForKey("confirmExit", key("y"))).toBe("yes");
		expect(editorCommandForKey("confirmExit", key("Y"))).toBe("yes");
		expect(editorCommandForKey("confirmExit", key("n"))).toBe("no");
		expect(editorCommandForKey("confirmExit", ctrl("c"))).toBe("cancel");
		expect(editorCommandForKey("confirmExit", key("Escape"))).toBe("cancel");
		expect(editorCommandForKey("confirmExit", key("x"))).toBeNull();
	});

	it("檔名與搜尋提示列：Enter 送出、^C 或 Esc 取消，打字交給輸入框", () => {
		for (const mode of ["write", "search"] as const) {
			expect(editorCommandForKey(mode, key("Enter"))).toBe("submit");
			expect(editorCommandForKey(mode, key("Escape"))).toBe("cancel");
			expect(editorCommandForKey(mode, ctrl("c"))).toBe("cancel");
			expect(editorCommandForKey(mode, key("a"))).toBeNull();
		}
	});

	it("說明頁：Esc、Enter、q、^X、^G、F1 回到編輯", () => {
		for (const input of [key("Escape"), key("Enter"), key("q"), ctrl("x"), ctrl("g"), key("F1")]) {
			expect(editorCommandForKey("help", input)).toBe("closeHelp");
		}
		expect(editorCommandForKey("help", key("a"))).toBeNull();
	});
});

describe("createEditorState 與 isModified", () => {
	it("打開時在編輯模式，狀態列是 shell 給的訊息，內容跟檔案一樣算沒修改", () => {
		const state = createEditorState(REQUEST);

		expect(state).toMatchObject({ mode: "edit", fileName: "notes.txt", message: "[ 已讀取 1 行 ]", writes: [] });
		expect(isModified(state, "第一行\n")).toBe(false);
		expect(isModified(state, "第一行\n第二行")).toBe(true);
	});

	it("沒有檔名的緩衝區（例如管線輸入）有內容就算修改過，離開前會問要不要存（同 nano）", () => {
		const state = createEditorState({ ...REQUEST, fileName: null, content: "a\nb\n" });

		expect(isModified(state, "a\nb\n")).toBe(true);
		expect(isModified(state, "")).toBe(false);
	});
});

describe("runEditorCommand：寫入", () => {
	it("^O 進檔名提示列，預設是目前的檔名；沒有檔名時是空的", () => {
		expect(runEditorCommand(createEditorState(REQUEST), "write", env("x")).state).toMatchObject({
			mode: "write",
			promptInput: "notes.txt",
		});
		const unnamed = createEditorState({ ...REQUEST, fileName: null, content: "" });
		expect(runEditorCommand(unnamed, "write", env("x")).state).toMatchObject({ mode: "write", promptInput: "" });
	});

	it("Enter 寫入：狀態列換成寫入結果，記下這次寫入，之後的內容跟它比較是否修改", () => {
		const prompt = runEditorCommand(createEditorState(REQUEST), "write", env("新內容")).state;
		const result = runEditorCommand(prompt, "submit", env("新內容"));

		expect(result.exit).toBe(false);
		expect(result.state).toMatchObject({ mode: "edit", fileName: "notes.txt", message: "[ 已寫入 1 行 ]" });
		expect(result.state.writes).toEqual([{ fileName: "notes.txt", path: "/home/tech/notes.txt", lineCount: 1 }]);
		expect(isModified(result.state, "新內容")).toBe(false);
	});

	it("改了檔名再寫：緩衝區改叫新的檔名（同 nano），前後空白去掉", () => {
		const prompt = setPromptInput(runEditorCommand(createEditorState(REQUEST), "write", env("x")).state, "  copy.txt ");
		const write = vi.fn(fakeWrite);

		const result = runEditorCommand(prompt, "submit", env("x", { write }));

		expect(write).toHaveBeenCalledWith("copy.txt", "x");
		expect(result.state.fileName).toBe("copy.txt");
	});

	it("寫不進去：留在編輯器、狀態列說原因，內容仍算修改過", () => {
		const prompt = setPromptInput(runEditorCommand(createEditorState(REQUEST), "write", env("x")).state, "locked.txt");
		const result = runEditorCommand(prompt, "submit", env("x"));

		expect(result.exit).toBe(false);
		expect(result.state).toMatchObject({ mode: "edit", fileName: "notes.txt", message: "[ 無法寫入 locked.txt ]", writes: [] });
		expect(isModified(result.state, "x")).toBe(true);
	});

	it("檔名清空再 Enter 等於取消，不寫檔", () => {
		const prompt = setPromptInput(runEditorCommand(createEditorState(REQUEST), "write", env("x")).state, "  ");
		const write = vi.fn(fakeWrite);

		const result = runEditorCommand(prompt, "submit", env("x", { write }));

		expect(write).not.toHaveBeenCalled();
		expect(result.state).toMatchObject({ mode: "edit", message: EDITOR_MESSAGES.cancelled });
	});

	it("^C 取消提示列", () => {
		const prompt = runEditorCommand(createEditorState(REQUEST), "write", env("x")).state;

		expect(runEditorCommand(prompt, "cancel", env("x")).state).toMatchObject({ mode: "edit", message: EDITOR_MESSAGES.cancelled });
	});

	it("^S 有檔名時直接寫入，沒有檔名時跟 ^O 一樣先問", () => {
		const saved = runEditorCommand(createEditorState(REQUEST), "save", env("y"));
		expect(saved.state).toMatchObject({ mode: "edit", writes: [{ fileName: "notes.txt" }] });

		const unnamed = createEditorState({ ...REQUEST, fileName: null, content: "" });
		expect(runEditorCommand(unnamed, "save", env("y")).state.mode).toBe("write");
	});
});

describe("runEditorCommand：離開", () => {
	it("沒有修改直接離開", () => {
		const result = runEditorCommand(createEditorState(REQUEST), "exit", env("第一行\n"));

		expect(result.exit).toBe(true);
		expect(result.state.writes).toEqual([]);
	});

	it("有修改先問；N 不存直接離開，之前用 ^O 存過的照樣帶出去", () => {
		const saved = runEditorCommand(createEditorState(REQUEST), "save", env("存過")).state;
		const asking = runEditorCommand(saved, "exit", env("存過又改"));

		expect(asking.exit).toBe(false);
		expect(asking.state.mode).toBe("confirmExit");

		const result = runEditorCommand(asking.state, "no", env("存過又改"));
		expect(result.exit).toBe(true);
		expect(result.state.writes).toHaveLength(1);
	});

	it("Y 接著問檔名，Enter 寫入成功就離開", () => {
		const asking = runEditorCommand(createEditorState(REQUEST), "exit", env("改過")).state;
		const prompt = runEditorCommand(asking, "yes", env("改過")).state;

		expect(prompt).toMatchObject({ mode: "write", promptInput: "notes.txt" });

		const result = runEditorCommand(prompt, "submit", env("改過"));
		expect(result.exit).toBe(true);
		expect(result.state.writes).toEqual([{ fileName: "notes.txt", path: "/home/tech/notes.txt", lineCount: 1 }]);
	});

	it("Y 之後寫入失敗：不離開，內容還在", () => {
		const asking = runEditorCommand(createEditorState(REQUEST), "exit", env("改過")).state;
		const prompt = setPromptInput(runEditorCommand(asking, "yes", env("改過")).state, "locked.txt");

		const result = runEditorCommand(prompt, "submit", env("改過"));

		expect(result.exit).toBe(false);
		expect(result.state.mode).toBe("edit");
		// 再 ^O 是一般的寫入，成功後不會自己離開
		const again = runEditorCommand(runEditorCommand(result.state, "write", env("改過")).state, "submit", env("改過"));
		expect(again.exit).toBe(false);
	});

	it("^C 取消離開，回到編輯", () => {
		const asking = runEditorCommand(createEditorState(REQUEST), "exit", env("改過")).state;

		expect(runEditorCommand(asking, "cancel", env("改過"))).toMatchObject({
			exit: false,
			state: { mode: "edit", message: EDITOR_MESSAGES.cancelled },
		});
	});

	it("在提示列或說明頁時要求離開（終端機的關閉鈕）：放棄提示列，照一般離開的規則", () => {
		const prompt = runEditorCommand(createEditorState(REQUEST), "write", env("改過")).state;
		expect(runEditorCommand(prompt, "exit", env("改過")).state.mode).toBe("confirmExit");

		const help = runEditorCommand(createEditorState(REQUEST), "help", env("第一行\n")).state;
		expect(runEditorCommand(help, "exit", env("第一行\n")).exit).toBe(true);
	});
});

describe("runEditorCommand：搜尋", () => {
	const CONTENT = "door open\nLOCK B3\ndoor lock\n";

	it("^W 進搜尋提示列，Enter 從游標往後找，選取找到的字", () => {
		const prompt = setPromptInput(runEditorCommand(createEditorState(REQUEST), "search", env(CONTENT)).state, "lock");
		const result = runEditorCommand(prompt, "submit", env(CONTENT));

		expect(result.selection).toEqual({ start: 10, end: 14 });
		expect(result.state).toMatchObject({ mode: "edit", lastSearch: "lock", message: null });
	});

	it("直接 Enter 沿用上一次的字，從目前選取的結尾接著找；到結尾從頭繞回", () => {
		const prompt = setPromptInput(runEditorCommand(createEditorState(REQUEST), "search", env(CONTENT)).state, "lock");
		const first = runEditorCommand(prompt, "submit", env(CONTENT));
		const secondPrompt = runEditorCommand(first.state, "search", env(CONTENT)).state;

		expect(editorPromptLabel(secondPrompt)).toBe("搜尋 [lock]：");

		const second = runEditorCommand(secondPrompt, "submit", env(CONTENT, { selection: { start: 10, end: 14 } }));
		expect(second.selection).toEqual({ start: 23, end: 27 });

		const thirdPrompt = runEditorCommand(second.state, "search", env(CONTENT)).state;
		const third = runEditorCommand(thirdPrompt, "submit", env(CONTENT, { selection: { start: 23, end: 27 } }));
		expect(third.selection).toEqual({ start: 10, end: 14 });
		expect(third.state.message).toBe(EDITOR_MESSAGES.searchWrapped);
	});

	it("找不到時狀態列說找不到，選取不動", () => {
		const prompt = setPromptInput(runEditorCommand(createEditorState(REQUEST), "search", env(CONTENT)).state, "NOVA");
		const result = runEditorCommand(prompt, "submit", env(CONTENT));

		expect(result.selection).toBeNull();
		expect(result.state.message).toBe(EDITOR_MESSAGES.notFound("NOVA"));
	});

	it("還沒搜尋過又直接 Enter 等於取消", () => {
		const prompt = runEditorCommand(createEditorState(REQUEST), "search", env(CONTENT)).state;

		expect(runEditorCommand(prompt, "submit", env(CONTENT)).state.message).toBe(EDITOR_MESSAGES.cancelled);
	});
});

describe("runEditorCommand：說明頁", () => {
	it("^G 打開、closeHelp 回到編輯", () => {
		const help = runEditorCommand(createEditorState(REQUEST), "help", env("x")).state;

		expect(help.mode).toBe("help");
		expect(runEditorCommand(help, "closeHelp", env("x")).state.mode).toBe("edit");
	});
});

describe("findInContent", () => {
	it("不分大小寫、字面比對，從指定位置往後找，找不到就從頭繞回", () => {
		expect(findInContent("Abc abc", "ABC", 0)).toEqual({ start: 0, end: 3, wrapped: false });
		expect(findInContent("Abc abc", "abc", 1)).toEqual({ start: 4, end: 7, wrapped: false });
		expect(findInContent("Abc abc", "abc", 5)).toEqual({ start: 0, end: 3, wrapped: true });
		expect(findInContent("a.c abc", "a.c", 1)).toEqual({ start: 0, end: 3, wrapped: true });
		expect(findInContent("門禁鎖定", "鎖定", 0)).toEqual({ start: 2, end: 4, wrapped: false });
	});

	it("找不到或搜尋字是空的回傳 null", () => {
		expect(findInContent("abc", "x", 0)).toBeNull();
		expect(findInContent("abc", "", 0)).toBeNull();
	});
});

describe("畫面文字", () => {
	it("標題列的檔名：沒有檔名時是「新緩衝區」", () => {
		expect(editorFileLabel(createEditorState(REQUEST))).toBe("notes.txt");
		expect(editorFileLabel(createEditorState({ ...REQUEST, fileName: null }))).toBe("新緩衝區");
	});

	it("提示列的標籤", () => {
		const write = runEditorCommand(createEditorState(REQUEST), "write", env("x")).state;
		const search = runEditorCommand(createEditorState(REQUEST), "search", env("x")).state;

		expect(editorPromptLabel(write)).toBe("要寫入的檔名：");
		expect(editorPromptLabel(search)).toBe("搜尋：");
	});

	it("編輯中底部兩列是 ^G 說明、^O 寫入、^X 離開、^W 搜尋；離開確認時換成 Y、N、^C", () => {
		const text = (state: EditorState) =>
			editorKeyHints(state.mode).map((row) => row.map((hint) => `${hint.key} ${hint.label}`).join("  "));

		expect(editorKeyHints("edit")).toHaveLength(2);
		expect(text(createEditorState(REQUEST)).join("\n")).toMatch(/\^G 說明[\s\S]*\^O 寫入[\s\S]*\^X 離開[\s\S]*\^W 搜尋/);

		const asking = runEditorCommand(createEditorState(REQUEST), "exit", env("改過")).state;
		expect(text(asking).join("  ")).toContain("Y 是");
		expect(text(asking).join("  ")).toContain("N 否");
		expect(text(asking).join("  ")).toContain("^C 取消");
	});
});
