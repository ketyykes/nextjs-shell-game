import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TitleScreen, type TitleScreenProps } from "./TitleScreen";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

function renderTitle(overrides: Partial<TitleScreenProps> = {}) {
	const props = {
		hasSave: false,
		onContinue: vi.fn(),
		onNewGame: vi.fn(),
		onOpenSettings: vi.fn(),
		...overrides,
	};
	render(<TitleScreen {...props} />);
	return props;
}

describe("TitleScreen", () => {
	it("顯示 KEPLER-9 標題與鍵盤說明", () => {
		renderTitle();
		expect(screen.getByRole("heading", { name: "KEPLER-9" })).toBeDefined();
		expect(screen.getByText("鍵盤操作：↑↓ 選擇 · Enter 確認")).toBeDefined();
	});

	it("無存檔時沒有「繼續」", () => {
		renderTitle({ hasSave: false });
		expect(screen.queryByRole("button", { name: "繼續" })).toBeNull();
		expect(screen.getByRole("button", { name: "新遊戲" })).toBeDefined();
	});

	it("有存檔時有「繼續」，預設選取它，Enter 呼叫 onContinue", () => {
		const props = renderTitle({ hasSave: true });
		expect(screen.getByRole("button", { name: "繼續" })).toBeDefined();
		press("Enter");
		expect(props.onContinue).toHaveBeenCalledTimes(1);
	});

	it("有存檔時 ↓ Enter 選新遊戲會出現覆蓋確認，取消不呼叫 onNewGame", () => {
		const props = renderTitle({ hasSave: true });
		press("ArrowDown");
		press("Enter");
		expect(screen.getByText("已有存檔，開始新遊戲會覆蓋它。")).toBeDefined();
		expect(props.onNewGame).not.toHaveBeenCalled();

		// 確認面板預設選「取消」
		press("Enter");
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onNewGame).not.toHaveBeenCalled();
	});

	it("有存檔時在確認面板選「覆蓋」才呼叫 onNewGame", () => {
		const props = renderTitle({ hasSave: true });
		press("ArrowDown");
		press("Enter");
		press("ArrowLeft");
		press("Enter");
		expect(props.onNewGame).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
	});

	it("確認面板中按 Esc 等同取消，也可用滑鼠點「覆蓋」", () => {
		const props = renderTitle({ hasSave: true });
		fireEvent.click(screen.getByRole("button", { name: "新遊戲" }));
		press("Escape");
		expect(screen.queryByTestId("confirm-panel")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "新遊戲" }));
		fireEvent.click(screen.getByRole("button", { name: "覆蓋" }));
		expect(props.onNewGame).toHaveBeenCalledTimes(1);
	});

	it("無存檔時新遊戲直接呼叫 onNewGame", () => {
		const props = renderTitle({ hasSave: false });
		press("Enter");
		expect(props.onNewGame).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
	});

	it("「設定」呼叫 onOpenSettings（鍵盤與滑鼠）", () => {
		const props = renderTitle({ hasSave: true });
		press("ArrowUp");
		press("Enter");
		expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "設定" }));
		expect(props.onOpenSettings).toHaveBeenCalledTimes(2);
	});

	it("keyboardEnabled 為 false 時不處理鍵盤", () => {
		const props = renderTitle({ keyboardEnabled: false });
		press("Enter");
		expect(props.onNewGame).not.toHaveBeenCalled();
	});

	it("CRT 效果預設全開，可由 props 關閉", () => {
		renderTitle();
		expect(screen.getByTestId("crt-scanlines")).toBeDefined();
		cleanup();
		renderTitle({ crt: { scanlines: false, vignette: false, flicker: false } });
		expect(screen.queryByTestId("crt-overlay")).toBeNull();
	});
});
