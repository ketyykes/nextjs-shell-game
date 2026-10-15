import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorRequest, EditorWriteResult } from "@/game/shell/types";
import { Editor, type EditorHandle } from "./Editor";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

const REQUEST: EditorRequest = {
	fileName: "notes.txt",
	content: "door open\nLOCK B3\n",
	notice: "[ 已讀取 2 行 ]",
	cwd: "/home/tech",
};

/** 假的寫檔：成功時回報行數，檔名含 locked 時失敗。 */
function fakeWrite(fileName: string, content: string): EditorWriteResult {
	if (fileName.includes("locked")) {
		return { ok: false, status: `[ 無法寫入 ${fileName}：沒有寫入權限 ]` };
	}
	const lineCount = content.replace(/\n$/, "").split("\n").length;
	return { ok: true, write: { fileName, path: `/home/tech/${fileName}`, lineCount }, status: `[ 已寫入 ${lineCount} 行 ]` };
}

function setup(request: EditorRequest = REQUEST) {
	const onWrite = vi.fn(fakeWrite);
	const onExit = vi.fn();
	const ref = createRef<EditorHandle>();
	render(<Editor ref={ref} request={request} onWrite={onWrite} onExit={onExit} />);
	return { onWrite, onExit, ref };
}

function getEditor(): HTMLElement {
	return screen.getByRole("region", { name: "nano 編輯器" });
}

function getText(): HTMLTextAreaElement {
	return screen.getByRole("textbox", { name: "編輯內容" }) as HTMLTextAreaElement;
}

function getStatus(): HTMLElement {
	return within(getEditor()).getByRole("status");
}

/** 模擬打字、輸入法或貼上：整段文字一次換掉。 */
function type(text: string): void {
	fireEvent.change(getText(), { target: { value: text } });
}

/** 在文字區按 Ctrl+字母，回傳事件有沒有被攔（fireEvent 回傳 false 代表 preventDefault）。 */
function pressCtrl(letter: string): boolean {
	return !fireEvent.keyDown(getText(), { key: letter, ctrlKey: true });
}

function getPrompt(name: string): HTMLInputElement {
	return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

describe("Editor 畫面", () => {
	it("掛載時焦點在文字區、游標在最前面；頂列有 GNU nano 與檔名，狀態列是打開時的訊息", () => {
		setup();

		const text = getText();
		expect(document.activeElement).toBe(text);
		expect(text.value).toBe("door open\nLOCK B3\n");
		expect(text.selectionStart).toBe(0);
		expect(within(getEditor()).getByText(/GNU nano/)).toBeDefined();
		expect(within(getEditor()).getByText("notes.txt")).toBeDefined();
		expect(getStatus().textContent).toBe("[ 已讀取 2 行 ]");
	});

	it("底部兩列按鍵提示：^G 說明、^O 寫入、^X 離開、^W 搜尋", () => {
		setup();

		const hints = screen.getByTestId("editor-key-hints").textContent ?? "";
		for (const text of ["^G", "說明", "^O", "寫入", "^X", "離開", "^W", "搜尋"]) {
			expect(hints).toContain(text);
		}
	});

	it("打字後頂列標「已修改」，狀態列的訊息清掉", () => {
		setup();
		expect(within(getEditor()).queryByText("已修改")).toBeNull();

		type("door open\nLOCK B3\n修好了");

		expect(within(getEditor()).getByText("已修改")).toBeDefined();
		expect(getStatus().textContent).toBe("");
	});

	it("沒有檔名時頂列寫「新緩衝區」", () => {
		setup({ ...REQUEST, fileName: null, content: "" });

		expect(within(getEditor()).getByText("新緩衝區")).toBeDefined();
	});
});

describe("Editor 寫入（^O）", () => {
	it("^O 攔下瀏覽器的開檔，狀態列換成檔名輸入框（預設原檔名）並取得焦點；Enter 寫入", () => {
		const { onWrite, onExit } = setup();
		type("修好了");

		expect(pressCtrl("o")).toBe(true);
		const prompt = getPrompt("要寫入的檔名");
		expect(prompt.value).toBe("notes.txt");
		expect(document.activeElement).toBe(prompt);

		fireEvent.keyDown(prompt, { key: "Enter" });

		expect(onWrite).toHaveBeenCalledWith("notes.txt", "修好了");
		expect(getStatus().textContent).toBe("[ 已寫入 1 行 ]");
		expect(within(getEditor()).queryByText("已修改")).toBeNull();
		expect(document.activeElement).toBe(getText());
		expect(onExit).not.toHaveBeenCalled();
	});

	it("在檔名輸入框改名再存：頂列換成新檔名", () => {
		const { onWrite } = setup();
		pressCtrl("o");
		const prompt = getPrompt("要寫入的檔名");
		fireEvent.change(prompt, { target: { value: "copy.txt" } });
		fireEvent.keyDown(prompt, { key: "Enter" });

		expect(onWrite).toHaveBeenCalledWith("copy.txt", REQUEST.content);
		expect(within(getEditor()).getByText("copy.txt")).toBeDefined();
	});

	it("寫不進去時狀態列說原因，內容還在、仍標已修改", () => {
		setup();
		type("改過");
		pressCtrl("o");
		const prompt = getPrompt("要寫入的檔名");
		fireEvent.change(prompt, { target: { value: "locked.txt" } });
		fireEvent.keyDown(prompt, { key: "Enter" });

		expect(getStatus().textContent).toBe("[ 無法寫入 locked.txt：沒有寫入權限 ]");
		expect(getText().value).toBe("改過");
		expect(within(getEditor()).getByText("已修改")).toBeDefined();
	});

	it("檔名輸入框的 Esc 只取消提示列，不離開編輯器", () => {
		const { onWrite, onExit } = setup();
		pressCtrl("o");
		fireEvent.keyDown(getPrompt("要寫入的檔名"), { key: "Escape" });

		expect(onWrite).not.toHaveBeenCalled();
		expect(onExit).not.toHaveBeenCalled();
		expect(screen.queryByRole("textbox", { name: "要寫入的檔名" })).toBeNull();
		expect(document.activeElement).toBe(getText());
	});
});

describe("Editor 離開（^X）", () => {
	it("沒有修改：^X 直接離開，沒有寫入", () => {
		const { onExit } = setup();

		expect(pressCtrl("x")).toBe(true);

		expect(onExit).toHaveBeenCalledWith([]);
	});

	it("有修改：先問要不要存；N 不存直接離開", () => {
		const { onExit, onWrite } = setup();
		type("改過");
		pressCtrl("x");

		expect(getStatus().textContent).toBe("儲存修改過的緩衝區？");
		const hints = screen.getByTestId("editor-key-hints").textContent ?? "";
		expect(hints).toContain("Y");
		expect(hints).toContain("N");
		expect(hints).toContain("^C");
		expect(onExit).not.toHaveBeenCalled();

		fireEvent.keyDown(getText(), { key: "n" });

		expect(onWrite).not.toHaveBeenCalled();
		expect(onExit).toHaveBeenCalledWith([]);
	});

	it("有修改：Y 接著問檔名，Enter 寫入後離開，帶出這次的寫入", () => {
		const { onExit, onWrite } = setup();
		type("改過");
		pressCtrl("x");
		fireEvent.keyDown(getText(), { key: "y" });
		fireEvent.keyDown(getPrompt("要寫入的檔名"), { key: "Enter" });

		expect(onWrite).toHaveBeenCalledWith("notes.txt", "改過");
		expect(onExit).toHaveBeenCalledWith([{ fileName: "notes.txt", path: "/home/tech/notes.txt", lineCount: 1 }]);
	});

	it("離開確認時文字區唯讀（Y、N 不會打進內容），^C 取消回到編輯", () => {
		const { onExit } = setup();
		type("改過");
		pressCtrl("x");

		expect(getText().readOnly).toBe(true);
		expect(pressCtrl("c")).toBe(true);

		expect(onExit).not.toHaveBeenCalled();
		expect(getText().readOnly).toBe(false);
		expect(getStatus().textContent).toBe("[ 已取消 ]");
	});

	it("Esc 等同 ^X，而且不冒泡到 window（不會順便打開暫停選單）", () => {
		const { onExit } = setup();
		const windowListener = vi.fn();
		window.addEventListener("keydown", windowListener);

		fireEvent.keyDown(getText(), { key: "Escape" });

		window.removeEventListener("keydown", windowListener);
		expect(onExit).toHaveBeenCalledWith([]);
		expect(windowListener).not.toHaveBeenCalled();
	});

	it("終端機的關閉鈕走同一個流程：有修改先問", () => {
		const { onExit, ref } = setup();
		type("改過");

		act(() => {
			ref.current?.requestExit();
		});

		expect(onExit).not.toHaveBeenCalled();
		expect(screen.getByRole("status").textContent).toBe("儲存修改過的緩衝區？");
	});
});

describe("Editor 搜尋（^W）與說明（^G）", () => {
	it("^W 攔下瀏覽器的關分頁，輸入要找的字按 Enter：文字區選取找到的地方", () => {
		setup();

		expect(pressCtrl("w")).toBe(true);
		const prompt = getPrompt("搜尋內容");
		fireEvent.change(prompt, { target: { value: "lock" } });
		fireEvent.keyDown(prompt, { key: "Enter" });

		const text = getText();
		expect(document.activeElement).toBe(text);
		expect(text.selectionStart).toBe(10);
		expect(text.selectionEnd).toBe(14);
	});

	it("找不到時狀態列說找不到", () => {
		setup();
		pressCtrl("w");
		const prompt = getPrompt("搜尋內容");
		fireEvent.change(prompt, { target: { value: "NOVA" } });
		fireEvent.keyDown(prompt, { key: "Enter" });

		expect(getStatus().textContent).toBe("[ 找不到「NOVA」 ]");
	});

	it("^G 打開說明頁並攔下瀏覽器的預設行為，Esc 回到文字區", () => {
		setup();

		expect(pressCtrl("g")).toBe(true);
		const help = screen.getByRole("region", { name: "nano 說明" });
		expect(within(help).getByText("nano 說明")).toBeDefined();
		expect(document.activeElement).toBe(help);

		fireEvent.keyDown(help, { key: "Escape" });

		expect(screen.queryByRole("region", { name: "nano 說明" })).toBeNull();
		expect(document.activeElement).toBe(getText());
	});
});

describe("Editor 其他按鍵", () => {
	it("Tab 插入定位字元，焦點留在文字區", () => {
		setup({ ...REQUEST, content: "" });

		expect(fireEvent.keyDown(getText(), { key: "Tab" })).toBe(false);

		expect(getText().value).toBe("\t");
		expect(document.activeElement).toBe(getText());
	});

	it("輸入法組字中的按鍵交給輸入法", () => {
		const { onExit } = setup();

		fireEvent.keyDown(getText(), { key: "Escape", isComposing: true });

		expect(onExit).not.toHaveBeenCalled();
	});

	it("一般字與 ^C 不攔，交給瀏覽器", () => {
		setup();

		expect(fireEvent.keyDown(getText(), { key: "a" })).toBe(true);
		expect(pressCtrl("c")).toBe(false);
	});

	it("有沒存的修改時，關分頁或重新整理會先跳瀏覽器的確認", () => {
		setup();
		const before = new Event("beforeunload", { cancelable: true });
		window.dispatchEvent(before);
		expect(before.defaultPrevented).toBe(false);

		type("改過");
		const after = new Event("beforeunload", { cancelable: true });
		window.dispatchEvent(after);
		expect(after.defaultPrevented).toBe(true);
	});
});
