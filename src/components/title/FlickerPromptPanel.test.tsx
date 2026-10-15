import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlickerPromptPanel } from "./FlickerPromptPanel";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

describe("FlickerPromptPanel", () => {
	it("說明有閃爍效果、建議光敏體質的人關閉、之後在設定選單可以改，兩個選項預設選「關閉」", () => {
		render(<FlickerPromptPanel reducedMotion={false} onChoose={vi.fn()} />);

		const dialog = screen.getByRole("alertdialog", { name: "光敏提醒" });
		expect(dialog.textContent).toContain("本遊戲有燈光閃爍與畫面閃動的效果");
		expect(dialog.textContent).toContain("光敏體質、或曾因閃光感到不適的人，建議關閉閃爍效果");
		expect(dialog.textContent).toContain("之後在設定選單隨時可以改");
		expect(screen.getByRole("button", { name: "關閉閃爍效果" }).getAttribute("data-selected")).toBe("true");
		expect(screen.getByRole("button", { name: "保留閃爍效果" }).getAttribute("data-selected")).toBe("false");
	});

	it("系統設定了減少動態效果時多一句說明，沒設定時不說", () => {
		const { rerender } = render(<FlickerPromptPanel reducedMotion={false} onChoose={vi.fn()} />);
		expect(screen.queryByText(/偵測到你的系統設定了減少動態效果/)).toBeNull();

		rerender(<FlickerPromptPanel reducedMotion onChoose={vi.fn()} />);
		expect(screen.getByText(/偵測到你的系統設定了減少動態效果/)).toBeDefined();
	});

	it("直接按 Enter 是關閉閃爍效果", () => {
		const onChoose = vi.fn();
		render(<FlickerPromptPanel reducedMotion={false} onChoose={onChoose} />);

		fireEvent.keyDown(window, { key: "Enter" });

		expect(onChoose).toHaveBeenCalledTimes(1);
		expect(onChoose).toHaveBeenCalledWith(false);
	});

	it.each(["ArrowRight", "ArrowDown"])("按 %s 換到「保留」再 Enter 是保留閃爍效果", (key) => {
		const onChoose = vi.fn();
		render(<FlickerPromptPanel reducedMotion={false} onChoose={onChoose} />);

		fireEvent.keyDown(window, { key });
		expect(screen.getByRole("button", { name: "保留閃爍效果" }).getAttribute("data-selected")).toBe("true");
		fireEvent.keyDown(window, { key: "Enter" });

		expect(onChoose).toHaveBeenCalledWith(true);
	});

	it("←／↑ 換回「關閉」，到頭不繞回", () => {
		const onChoose = vi.fn();
		render(<FlickerPromptPanel reducedMotion={false} onChoose={onChoose} />);

		fireEvent.keyDown(window, { key: "ArrowRight" });
		fireEvent.keyDown(window, { key: "ArrowRight" });
		fireEvent.keyDown(window, { key: "ArrowLeft" });
		expect(screen.getByRole("button", { name: "關閉閃爍效果" }).getAttribute("data-selected")).toBe("true");
		fireEvent.keyDown(window, { key: "ArrowUp" });
		fireEvent.keyDown(window, { key: "Enter" });

		expect(onChoose).toHaveBeenCalledWith(false);
	});

	it("Esc 不會關掉面板，一定要選一個", () => {
		const onChoose = vi.fn();
		render(<FlickerPromptPanel reducedMotion={false} onChoose={onChoose} />);

		fireEvent.keyDown(window, { key: "Escape" });

		expect(onChoose).not.toHaveBeenCalled();
		expect(screen.getByRole("alertdialog", { name: "光敏提醒" })).toBeDefined();
	});

	it("滑鼠點哪一個就是哪一個", () => {
		const onChoose = vi.fn();
		render(<FlickerPromptPanel reducedMotion={false} onChoose={onChoose} />);

		fireEvent.click(screen.getByRole("button", { name: "保留閃爍效果" }));
		fireEvent.click(screen.getByRole("button", { name: "關閉閃爍效果" }));

		expect(onChoose.mock.calls).toEqual([[true], [false]]);
	});
});
