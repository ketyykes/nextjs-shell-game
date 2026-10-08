import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, emitGameEvent } from "@/game/phaser/EventBus";
import { AssetLoadErrorNotice } from "./AssetLoadErrorNotice";

afterEach(() => {
	cleanup();
	EventBus.removeAllListeners();
});

describe("AssetLoadErrorNotice", () => {
	it("沒有收到 assets:error 時不渲染", () => {
		const { container } = render(<AssetLoadErrorNotice />);
		expect(container.firstChild).toBeNull();
	});

	it("關鍵素材載不到：顯示遊戲沒辦法開始的提示、檔案清單與重新載入按鈕", () => {
		const onReload = vi.fn();
		render(<AssetLoadErrorNotice onReload={onReload} />);

		act(() => {
			emitGameEvent("assets:error", { files: ["/maps/deck1.json"], fatal: true });
		});

		const dialog = screen.getByRole("alertdialog", { name: "素材載入失敗" });
		expect(dialog.textContent).toContain("沒辦法開始");
		expect(dialog.textContent).toContain("/maps/deck1.json");
		expect(screen.queryByRole("button", { name: "先不用" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
		expect(onReload).toHaveBeenCalledTimes(1);
	});

	it("只有音效載不到：提示可以照常玩，按「先不用」收起來", () => {
		render(<AssetLoadErrorNotice onReload={vi.fn()} />);

		act(() => {
			emitGameEvent("assets:error", { files: ["/audio/door.ogg"], fatal: false });
		});

		const notice = screen.getByRole("alert");
		expect(notice.textContent).toContain("照常");
		expect(screen.getByRole("button", { name: "重新載入" })).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "先不用" }));
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("卸載後取消訂閱 EventBus", () => {
		const { unmount } = render(<AssetLoadErrorNotice />);
		expect(EventBus.listenerCount("assets:error")).toBe(1);

		unmount();
		expect(EventBus.listenerCount("assets:error")).toBe(0);
	});
});
