import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stepIndex, useMenuNavigation, type UseMenuNavigationOptions } from "./useMenuNavigation";

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
});

function press(key: string, init: KeyboardEventInit = {}) {
	fireEvent.keyDown(window, { key, ...init });
}

function setup(options: Partial<UseMenuNavigationOptions> = {}) {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	const onAdjust = vi.fn();
	const hook = renderHook((props: Partial<UseMenuNavigationOptions>) =>
		useMenuNavigation({ itemCount: 3, onConfirm, onCancel, onAdjust, ...props }),
	{ initialProps: options });
	return { ...hook, onConfirm, onCancel, onAdjust };
}

describe("stepIndex", () => {
	it("loop 時走到頭會繞回另一端", () => {
		expect(stepIndex(2, 1, 3, true)).toBe(0);
		expect(stepIndex(0, -1, 3, true)).toBe(2);
	});

	it("不 loop 時停在兩端", () => {
		expect(stepIndex(2, 1, 3, false)).toBe(2);
		expect(stepIndex(0, -1, 3, false)).toBe(0);
	});
});

describe("useMenuNavigation", () => {
	it("預設選第 0 項，可指定初始索引", () => {
		expect(setup().result.current.selectedIndex).toBe(0);
		cleanup();
		expect(setup({ initialIndex: 2 }).result.current.selectedIndex).toBe(2);
	});

	it("垂直選單 ↑↓ 移動並繞回，Enter 以目前索引呼叫 onConfirm", () => {
		const { result, onConfirm } = setup();
		press("ArrowDown");
		press("ArrowDown");
		expect(result.current.selectedIndex).toBe(2);
		press("ArrowDown");
		expect(result.current.selectedIndex).toBe(0);
		press("ArrowUp");
		press("Enter");
		expect(onConfirm).toHaveBeenCalledWith(2);
	});

	it("垂直選單的 ←→ 呼叫 onAdjust，不移動選取", () => {
		const { result, onAdjust } = setup();
		press("ArrowDown");
		press("ArrowRight");
		press("ArrowLeft");
		expect(result.current.selectedIndex).toBe(1);
		expect(onAdjust).toHaveBeenNthCalledWith(1, 1, 1);
		expect(onAdjust).toHaveBeenNthCalledWith(2, 1, -1);
	});

	it("水平選單用 ←→ 移動", () => {
		const { result } = setup({ orientation: "horizontal" });
		press("ArrowRight");
		expect(result.current.selectedIndex).toBe(1);
		press("ArrowDown");
		expect(result.current.selectedIndex).toBe(1);
	});

	it("Esc 呼叫 onCancel", () => {
		const { onCancel } = setup();
		press("Escape");
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("長按 Enter 的重複事件不會連發", () => {
		const { onConfirm } = setup();
		press("Enter");
		press("Enter", { repeat: true });
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("enabled 為 false 時不處理任何按鍵", () => {
		const { result, onConfirm, onCancel } = setup({ enabled: false });
		press("ArrowDown");
		press("Enter");
		press("Escape");
		expect(result.current.selectedIndex).toBe(0);
		expect(onConfirm).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("setSelectedIndex 可由滑鼠設定選取，選項變少時會夾回範圍內", () => {
		const { result, rerender } = setup();
		act(() => {
			result.current.setSelectedIndex(2);
		});
		expect(result.current.selectedIndex).toBe(2);
		rerender({ itemCount: 2 });
		expect(result.current.selectedIndex).toBe(1);
	});
});
