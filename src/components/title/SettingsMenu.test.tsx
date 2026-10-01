import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type SettingsState } from "@/game/store/types";
import { roundVolume, SettingsMenu, stepTextSpeed, stepVolume } from "./SettingsMenu";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

function renderMenu(settings: Partial<SettingsState> = {}) {
	const onChange = vi.fn();
	const onClose = vi.fn();
	render(
		<SettingsMenu settings={{ ...DEFAULT_SETTINGS, ...settings }} onChange={onChange} onClose={onClose} />,
	);
	return { onChange, onClose };
}

/** 項目順序：文字速度、閃爍、掃描線、暗角、音量、靜音、返回。 */
function moveDown(times: number) {
	for (let index = 0; index < times; index += 1) {
		press("ArrowDown");
	}
}

describe("SettingsMenu 純函式", () => {
	it("stepVolume 加減 0.1 並處理浮點、夾在 0 到 1", () => {
		expect(stepVolume(0.8, 1)).toBe(0.9);
		expect(stepVolume(0.7, 1)).toBe(0.8);
		expect(stepVolume(1, 1)).toBe(1);
		expect(stepVolume(0, -1)).toBe(0);
		expect(roundVolume(0.30000000000000004)).toBe(0.3);
	});

	it("stepTextSpeed 到頭停住", () => {
		expect(stepTextSpeed("normal", 1)).toBe("fast");
		expect(stepTextSpeed("instant", 1)).toBe("instant");
		expect(stepTextSpeed("slow", -1)).toBe("slow");
	});
});

describe("SettingsMenu", () => {
	it("是有標題的對話框，顯示目前值與光敏說明", () => {
		renderMenu();
		const dialog = screen.getByRole("dialog", { name: "設定" });
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(screen.getByTestId("settings-value-textSpeed").textContent).toBe("普通");
		expect(screen.getByTestId("settings-value-volume").textContent).toBe("80");
		expect(screen.getByText("光敏體質請關閉")).toBeDefined();
	});

	it("→ 改文字速度呼叫 onChange({ textSpeed: \"fast\" })", () => {
		const { onChange } = renderMenu();
		press("ArrowRight");
		expect(onChange).toHaveBeenCalledWith({ textSpeed: "fast" });
	});

	it("← 改文字速度往慢一段", () => {
		const { onChange } = renderMenu();
		press("ArrowLeft");
		expect(onChange).toHaveBeenCalledWith({ textSpeed: "slow" });
	});

	it("↓ 到閃爍按 → 呼叫 onChange({ flickerEnabled: false })", () => {
		const { onChange } = renderMenu();
		moveDown(1);
		press("ArrowRight");
		expect(onChange).toHaveBeenCalledWith({ flickerEnabled: false });
	});

	it("掃描線、暗角、靜音可用 Enter 切換", () => {
		const { onChange } = renderMenu();
		moveDown(2);
		press("Enter");
		expect(onChange).toHaveBeenLastCalledWith({ scanlinesEnabled: false });
		moveDown(1);
		press("Enter");
		expect(onChange).toHaveBeenLastCalledWith({ vignetteEnabled: false });
		moveDown(2);
		press("Enter");
		expect(onChange).toHaveBeenLastCalledWith({ muted: true });
	});

	it("音量 → 加 0.1、← 減 0.1", () => {
		const { onChange } = renderMenu({ volume: 0.8 });
		moveDown(4);
		press("ArrowRight");
		expect(onChange).toHaveBeenLastCalledWith({ volume: 0.9 });
		press("ArrowLeft");
		expect(onChange).toHaveBeenLastCalledWith({ volume: 0.7 });
	});

	it("音量已滿時 → 不呼叫 onChange", () => {
		const { onChange } = renderMenu({ volume: 1 });
		moveDown(4);
		press("ArrowRight");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("Esc 呼叫 onClose", () => {
		const { onClose } = renderMenu();
		press("Escape");
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("「返回」按鈕與在「返回」上按 Enter 都呼叫 onClose", () => {
		const { onClose } = renderMenu();
		fireEvent.click(screen.getByRole("button", { name: /返回/ }));
		expect(onClose).toHaveBeenCalledTimes(1);
		press("ArrowUp");
		press("Enter");
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it("滑鼠點開關與增減按鈕", () => {
		const { onChange } = renderMenu();
		fireEvent.click(screen.getByRole("button", { name: "靜音：關" }));
		expect(onChange).toHaveBeenLastCalledWith({ muted: true });
		fireEvent.click(screen.getByRole("button", { name: "音量減少" }));
		expect(onChange).toHaveBeenLastCalledWith({ volume: 0.7 });
	});
});
