import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TouchWarningPanel } from "./TouchWarningPanel";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

describe("TouchWarningPanel", () => {
	it("說明需要實體鍵盤，並提供「仍要繼續」", () => {
		render(<TouchWarningPanel onDismiss={vi.fn()} />);
		const dialog = screen.getByRole("alertdialog", { name: "本遊戲需要實體鍵盤" });
		expect(dialog.textContent).toContain("觸控");
		expect(dialog.textContent).toContain("平板接上實體鍵盤就能玩");
		expect(screen.getByRole("button", { name: "仍要繼續" })).toBeDefined();
	});

	it("點「仍要繼續」略過提示", () => {
		const onDismiss = vi.fn();
		render(<TouchWarningPanel onDismiss={onDismiss} />);
		fireEvent.click(screen.getByRole("button", { name: "仍要繼續" }));
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it("接了實體鍵盤的平板按 Enter 或 Esc 也能略過", () => {
		const onDismiss = vi.fn();
		render(<TouchWarningPanel onDismiss={onDismiss} />);
		fireEvent.keyDown(window, { key: "Enter" });
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onDismiss).toHaveBeenCalledTimes(2);
	});
});
