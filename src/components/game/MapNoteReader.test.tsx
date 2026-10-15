import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapNote } from "@/game/story/mapNotes";
import { MapNoteReader } from "./MapNoteReader";

const NOTE: MapNote = {
	id: "ch2-test-note",
	chapter: 2,
	roomId: "dc_entry",
	tileX: 10,
	tileY: 14,
	objectName: "公告欄",
	lines: ["第一行", "", "第三行"],
};

/** window 上 bubble 階段的 keydown 監聽（暫停選單、Phaser 都掛在這裡），測試完拆掉。 */
const bubbleListeners: ((event: KeyboardEvent) => void)[] = [];

function listenOnWindowBubble() {
	const listener = vi.fn<(event: KeyboardEvent) => void>();
	window.addEventListener("keydown", listener);
	bubbleListeners.push(listener);
	return listener;
}

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	for (const listener of bubbleListeners.splice(0)) {
		window.removeEventListener("keydown", listener);
	}
});

function renderReader() {
	const onClose = vi.fn();
	render(<MapNoteReader note={NOTE} onClose={onClose} />);
	return onClose;
}

describe("MapNoteReader", () => {
	it("標題是物件名、內容逐行、底部有「[Esc] 關閉」", () => {
		renderReader();
		const dialog = screen.getByRole("dialog", { name: "公告欄" });
		expect(screen.getByRole("heading", { name: "公告欄" })).toBeDefined();
		const lines = screen.getAllByTestId("map-note-line").map((line) => line.textContent);
		expect(lines).toEqual(["第一行", " ", "第三行"]);
		expect(dialog.textContent).toContain("[Esc] 關閉");
	});

	it("點「[Esc] 關閉」就關", () => {
		const onClose = renderReader();
		fireEvent.click(screen.getByRole("button", { name: "關閉便條" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Esc 關閉，而且不往下傳：暫停選單與 Phaser 收不到這一下", () => {
		const onClose = renderReader();
		const bubble = listenOnWindowBubble();
		const notPrevented = fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(notPrevented).toBe(false);
		expect(bubble).not.toHaveBeenCalled();
	});

	it("E 也能關閉，同樣不往下傳（不然 Phaser 會把它當成再打開一次）", () => {
		const onClose = renderReader();
		const bubble = listenOnWindowBubble();
		const notPrevented = fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(notPrevented).toBe(false);
		expect(bubble).not.toHaveBeenCalled();
	});

	it("按住不放的重複事件不關", () => {
		const onClose = renderReader();
		fireEvent.keyDown(document.body, { key: "e", code: "KeyE", repeat: true });
		fireEvent.keyDown(document.body, { key: "Escape", code: "Escape", repeat: true });
		expect(onClose).not.toHaveBeenCalled();
	});

	it("面板快捷鍵 Alt+C 與其他按鍵照常往下傳、不關便條", () => {
		const onClose = renderReader();
		const bubble = listenOnWindowBubble();
		fireEvent.keyDown(document.body, { key: "ç", code: "KeyC", altKey: true });
		fireEvent.keyDown(document.body, { key: "´", code: "KeyE", altKey: true });
		fireEvent.keyDown(document.body, { key: "ArrowUp", code: "ArrowUp" });
		expect(onClose).not.toHaveBeenCalled();
		expect(bubble).toHaveBeenCalledTimes(3);
	});

	it("卸載後不再攔鍵盤", () => {
		const onClose = renderReader();
		cleanup();
		const bubble = listenOnWindowBubble();
		fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
		expect(onClose).not.toHaveBeenCalled();
		expect(bubble).toHaveBeenCalledTimes(1);
	});
});
