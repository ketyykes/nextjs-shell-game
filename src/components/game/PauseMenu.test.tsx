import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PauseMenu, type PauseMenuProps } from "./PauseMenu";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

function renderPause(overrides: Partial<PauseMenuProps> = {}) {
	const props = {
		open: true,
		onResume: vi.fn(),
		onReturnToTitle: vi.fn(),
		onRestartChapter: vi.fn(),
		onOpenSettings: vi.fn(),
		...overrides,
	};
	const view = render(<PauseMenu {...props} />);
	return { props, view };
}

/** 項目順序：繼續、設定、重玩本章、回標題。 */
function moveDown(times: number) {
	for (let index = 0; index < times; index += 1) {
		press("ArrowDown");
	}
}

describe("PauseMenu", () => {
	it("open 為 false 時沒有 DOM，也不收鍵盤", () => {
		const { props, view } = renderPause({ open: false });
		expect(view.container.innerHTML).toBe("");
		press("Escape");
		press("Enter");
		expect(props.onResume).not.toHaveBeenCalled();
	});

	it("open 時是有標題的對話框，列出四個項目", () => {
		renderPause();
		expect(screen.getByRole("dialog", { name: "暫停選單" })).toBeDefined();
		for (const label of ["繼續", "設定", "重玩本章", "回標題"]) {
			expect(screen.getByRole("button", { name: label })).toBeDefined();
		}
	});

	it("Esc 呼叫 onResume", () => {
		const { props } = renderPause();
		press("Escape");
		expect(props.onResume).toHaveBeenCalledTimes(1);
	});

	it("預設選「繼續」，Enter 呼叫 onResume", () => {
		const { props } = renderPause();
		press("Enter");
		expect(props.onResume).toHaveBeenCalledTimes(1);
	});

	it("「設定」呼叫 onOpenSettings", () => {
		const { props } = renderPause();
		moveDown(1);
		press("Enter");
		expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
	});

	it("選「重玩本章」先出現確認，取消不呼叫，確認後才呼叫 onRestartChapter", () => {
		const { props } = renderPause();
		moveDown(2);
		press("Enter");
		expect(screen.getByText("重玩本章？目前章節的進度會清除。")).toBeDefined();
		expect(props.onRestartChapter).not.toHaveBeenCalled();

		// 預設選「取消」
		press("Enter");
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onRestartChapter).not.toHaveBeenCalled();

		// 回到選單後選取位置保持在「重玩本章」
		press("Enter");
		press("ArrowLeft");
		press("Enter");
		expect(props.onRestartChapter).toHaveBeenCalledTimes(1);
	});

	it("確認面板中按 Esc 只關掉面板，不會觸發繼續", () => {
		const { props } = renderPause();
		fireEvent.click(screen.getByRole("button", { name: "重玩本章" }));
		press("Escape");
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onResume).not.toHaveBeenCalled();
	});

	it("「回標題」呼叫 onReturnToTitle（鍵盤與滑鼠）", () => {
		const { props } = renderPause();
		moveDown(3);
		press("Enter");
		expect(props.onReturnToTitle).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "回標題" }));
		expect(props.onReturnToTitle).toHaveBeenCalledTimes(2);
	});

	it("keyboardEnabled 為 false 時不處理鍵盤", () => {
		const { props } = renderPause({ keyboardEnabled: false });
		press("Escape");
		expect(props.onResume).not.toHaveBeenCalled();
	});
});
