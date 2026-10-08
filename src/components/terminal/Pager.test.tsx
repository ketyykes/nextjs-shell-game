import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PagerRequest } from "@/game/shell/types";
import { Pager } from "./Pager";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

/** jsdom 量不到尺寸，分頁器退回每頁 20 列、不折行。 */
const LINES = Array.from({ length: 30 }, (_, index) => `event ${index + 1}${index === 24 ? " LOCK" : ""}`);

function createRequest(overrides: Partial<PagerRequest> = {}): PagerRequest {
	return { files: [{ name: "door_events.log", lines: LINES }], lineNumbers: false, ...overrides };
}

function getPager(): HTMLElement {
	return screen.getByRole("region", { name: "less 分頁器" });
}

function getStatus(): HTMLElement {
	return screen.getByRole("status");
}

function press(key: string, init: Partial<KeyboardEventInit> = {}): void {
	fireEvent.keyDown(getPager(), { key, ...init });
}

/** 中文內容：第 3 行與第 25 行有「鎖定」。 */
const CHINESE_LINES = LINES.map((line, index) => {
	if (index === 2 || index === 24) {
		return `${line} 門禁鎖定`;
	}
	return line;
});

function getSearchInput(): HTMLInputElement {
	return screen.getByRole("textbox", { name: "搜尋內容" }) as HTMLInputElement;
}

/** 模擬輸入法或貼上：整段文字一次送進輸入框。 */
function typeSearch(text: string): void {
	fireEvent.change(getSearchInput(), { target: { value: text } });
}

describe("Pager", () => {
	it("掛載時取得焦點，顯示第一頁與 less -M 格式的狀態列", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);

		expect(document.activeElement).toBe(getPager());
		expect(within(getPager()).getByText("event 1")).toBeDefined();
		expect(within(getPager()).getByText("event 20")).toBeDefined();
		expect(within(getPager()).queryByText("event 21")).toBeNull();
		expect(getStatus().textContent).toBe("door_events.log lines 1-20/30 66%");
	});

	it("底部有給新手看的按鍵提示", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);

		const hint = screen.getByText(/q 離開/);
		expect(hint.textContent).toContain("空白");
		expect(hint.textContent).toContain("/ 搜尋");
	});

	it("空白翻到下一頁，到底顯示 (END)", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		press(" ");

		expect(within(getPager()).getByText("event 30")).toBeDefined();
		expect(within(getPager()).queryByText("event 1")).toBeNull();
		expect(getStatus().textContent).toBe("door_events.log lines 11-30/30 (END)");
	});

	it("q 離開", () => {
		const onQuit = vi.fn();
		render(<Pager request={createRequest()} onQuit={onQuit} />);
		press("q");

		expect(onQuit).toHaveBeenCalledTimes(1);
	});

	it("Esc 離開分頁，而且不冒泡到 window（不會連終端機一起關掉或打開暫停選單）", () => {
		const onQuit = vi.fn();
		const windowListener = vi.fn();
		window.addEventListener("keydown", windowListener);
		render(<Pager request={createRequest()} onQuit={onQuit} />);
		press("Escape");
		window.removeEventListener("keydown", windowListener);

		expect(onQuit).toHaveBeenCalledTimes(1);
		expect(windowListener).not.toHaveBeenCalled();
	});

	it("/ 搜尋：狀態列換成真的輸入框並取得焦點，Enter 跳到符合的行並標亮，焦點回分頁器", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		press("/");
		const input = getSearchInput();
		expect(document.activeElement).toBe(input);
		expect(input.parentElement?.textContent).toContain("/");

		typeSearch("LOCK");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(within(getPager()).queryByText("event 1")).toBeNull();
		const mark = within(getPager()).getByText("LOCK", { selector: "mark" });
		expect(mark).toBeDefined();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(document.activeElement).toBe(getPager());
	});

	it("輸入框接得到輸入法送出的中文，n 接著找下一個", () => {
		render(<Pager request={createRequest({ files: [{ name: "door_events.log", lines: CHINESE_LINES }] })} onQuit={() => {}} />);
		press("/");
		typeSearch("鎖定");
		fireEvent.keyDown(getSearchInput(), { key: "Enter" });

		expect(within(getPager()).queryByText("event 1")).toBeNull();
		expect(within(getPager()).getAllByText("鎖定", { selector: "mark" }).length).toBeGreaterThan(0);
		expect(getStatus().textContent).toBe("door_events.log lines 3-22/30 73%");
		press("n");
		expect(getStatus().textContent).toBe("door_events.log lines 11-30/30 (END)");
	});

	it("輸入法組字中按 Enter 是選字，不送出搜尋", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		press("/");
		typeSearch("鎖");
		fireEvent.keyDown(getSearchInput(), { key: "Enter", isComposing: true });

		expect(getSearchInput()).toBeDefined();
	});

	it("? 反向搜尋也用輸入框，之後的 n 照樣往上找", () => {
		render(<Pager request={createRequest({ files: [{ name: "door_events.log", lines: CHINESE_LINES }] })} onQuit={() => {}} />);
		press("G");
		press("?");
		expect(getSearchInput().parentElement?.textContent).toContain("?");
		typeSearch("鎖定");
		fireEvent.keyDown(getSearchInput(), { key: "Enter" });
		press("n");

		expect(getStatus().textContent).toBe("door_events.log lines 3-22/30 73%");
	});

	it("搜尋中 Esc 只取消搜尋：不離開分頁、不冒泡到 window，焦點回分頁器", () => {
		const onQuit = vi.fn();
		const windowListener = vi.fn();
		window.addEventListener("keydown", windowListener);
		render(<Pager request={createRequest()} onQuit={onQuit} />);
		press("/");
		typeSearch("LOCK");
		fireEvent.keyDown(getSearchInput(), { key: "Escape" });
		window.removeEventListener("keydown", windowListener);

		expect(onQuit).not.toHaveBeenCalled();
		expect(windowListener).not.toHaveBeenCalled();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(document.activeElement).toBe(getPager());
		expect(getStatus().textContent).toBe("door_events.log lines 1-20/30 66%");
	});

	it("搜尋框裡打的字交給輸入框，q 不會離開分頁、也不冒泡到 window", () => {
		const onQuit = vi.fn();
		const windowListener = vi.fn();
		window.addEventListener("keydown", windowListener);
		render(<Pager request={createRequest()} onQuit={onQuit} />);
		press("/");
		const event = new KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true });
		getSearchInput().dispatchEvent(event);
		window.removeEventListener("keydown", windowListener);

		expect(onQuit).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
		expect(windowListener).not.toHaveBeenCalled();
	});

	it("搜尋中點分頁器任何地方（包括輸入框本身），焦點留在輸入框", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		press("/");
		fireEvent.click(getSearchInput());
		expect(document.activeElement).toBe(getSearchInput());
		fireEvent.click(within(getPager()).getByText("event 1"));
		expect(document.activeElement).toBe(getSearchInput());
	});

	it("搜尋框是空的時按 Backspace 回到一般模式，焦點回分頁器", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		press("/");
		fireEvent.keyDown(getSearchInput(), { key: "Backspace" });

		expect(screen.queryByRole("textbox")).toBeNull();
		expect(document.activeElement).toBe(getPager());
	});

	it("-N 在每行前面加行號", () => {
		render(<Pager request={createRequest({ lineNumbers: true })} onQuit={() => {}} />);

		const firstRow = within(getPager()).getByText("event 1").parentElement;
		expect(firstRow?.textContent).toBe("      1 event 1");
	});

	it("q 離開時也不冒泡到 window", () => {
		const windowListener = vi.fn();
		window.addEventListener("keydown", windowListener);
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		press("q");
		window.removeEventListener("keydown", windowListener);

		expect(windowListener).not.toHaveBeenCalled();
	});

	it("不認得的鍵（F5、F11、F12、Tab）交給瀏覽器：不 preventDefault、照常冒泡", () => {
		const windowListener = vi.fn();
		window.addEventListener("keydown", windowListener);
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		const events = ["F5", "F11", "F12", "Tab"].map((name) => {
			const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
			getPager().dispatchEvent(event);
			return event;
		});
		window.removeEventListener("keydown", windowListener);

		expect(events.map((event) => event.defaultPrevented)).toEqual([false, false, false, false]);
		expect(windowListener).toHaveBeenCalledTimes(4);
	});

	it("翻頁鍵有 preventDefault（空白不捲動頁面）", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
		getPager().dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it("Ctrl 加其他鍵交給瀏覽器（例如 Ctrl+R 重新整理），不吃掉", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		const event = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true });
		getPager().dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
	});
});
