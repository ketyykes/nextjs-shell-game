import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatShortcut, isAppleUserAgent, useSidePanelShortcuts } from "./useSidePanelShortcuts";

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(cleanup);

/** 在 target 上發一個會冒泡的 keydown，回傳事件好檢查 defaultPrevented。 */
function pressKey(init: KeyboardEventInit, target: EventTarget = window): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
}

describe("useSidePanelShortcuts", () => {
	it("Alt+L 切換對話紀錄，並擋掉預設行為", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		const event = pressKey({ key: "l", code: "KeyL", altKey: true });
		expect(onToggle).toHaveBeenCalledWith("log");
		expect(event.defaultPrevented).toBe(true);
	});

	it("Mac 的 Option+L 打出的是 ¬，照實體鍵位一樣認得", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		pressKey({ key: "¬", code: "KeyL", altKey: true });
		expect(onToggle).toHaveBeenCalledWith("log");
	});

	it("沒按 Alt 的 l 是一般打字，不切換也不擋", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		const event = pressKey({ key: "l", code: "KeyL" });
		expect(onToggle).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("Ctrl+Alt（AltGr 打特殊字元）、Cmd、Shift 組合都不算", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		pressKey({ key: "ł", code: "KeyL", altKey: true, ctrlKey: true });
		pressKey({ key: "l", code: "KeyL", altKey: true, metaKey: true });
		pressKey({ key: "L", code: "KeyL", altKey: true, shiftKey: true });
		expect(onToggle).not.toHaveBeenCalled();
	});

	it("按住不放的重複事件不再切換，但仍擋掉預設行為（Mac 才不會一直打出 ¬）", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		const event = pressKey({ key: "¬", code: "KeyL", altKey: true, repeat: true });
		expect(onToggle).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	it("輸入法組字中不處理", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		pressKey({ key: "l", code: "KeyL", altKey: true, isComposing: true });
		expect(onToggle).not.toHaveBeenCalled();
	});

	it("從輸入框冒泡上來的按鍵也認得", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		const input = document.createElement("input");
		document.body.append(input);
		pressKey({ key: "l", code: "KeyL", altKey: true }, input);
		input.remove();
		expect(onToggle).toHaveBeenCalledWith("log");
	});

	it("enabled 為 false 時不處理也不擋", () => {
		const onToggle = vi.fn();
		renderHook(() => useSidePanelShortcuts({ enabled: false, onToggle }));
		const event = pressKey({ key: "l", code: "KeyL", altKey: true });
		expect(onToggle).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("卸載後不再監聽", () => {
		const onToggle = vi.fn();
		const { unmount } = renderHook(() => useSidePanelShortcuts({ enabled: true, onToggle }));
		unmount();
		pressKey({ key: "l", code: "KeyL", altKey: true });
		expect(onToggle).not.toHaveBeenCalled();
	});
});

describe("formatShortcut", () => {
	it("一般鍵盤顯示 Alt+字母，Apple 鍵盤顯示 ⌥字母", () => {
		expect(formatShortcut("log", false)).toBe("Alt+L");
		expect(formatShortcut("log", true)).toBe("⌥L");
	});
});

describe("isAppleUserAgent", () => {
	it("Mac 與 iPad 算 Apple 鍵盤，Windows 不算", () => {
		expect(
			isAppleUserAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
			),
		).toBe(true);
		expect(isAppleUserAgent("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15")).toBe(true);
		expect(
			isAppleUserAgent(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
			),
		).toBe(false);
	});
});
