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

	it("/ 搜尋：狀態列變輸入列，Enter 跳到符合的行並標亮", () => {
		render(<Pager request={createRequest()} onQuit={() => {}} />);
		for (const key of ["/", "L", "O", "C", "K"]) {
			press(key);
		}
		expect(getStatus().textContent).toBe("/LOCK");

		press("Enter");
		expect(within(getPager()).queryByText("event 1")).toBeNull();
		const mark = within(getPager()).getByText("LOCK", { selector: "mark" });
		expect(mark).toBeDefined();
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
