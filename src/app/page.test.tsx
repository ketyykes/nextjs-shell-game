import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const push = vi.fn();

// next/navigation 的 useRouter 在測試環境沒有 App Router context，用假的頂替
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push, prefetch: vi.fn() }),
}));

beforeEach(() => {
	localStorage.clear();
	push.mockClear();
});

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

describe("HomePage", () => {
	it("讀檔完成後顯示 Kepler-9 標題與新遊戲選項", async () => {
		render(<HomePage />);
		await waitFor(() => {
			expect(screen.getByText("KEPLER-9")).toBeDefined();
		});
		expect(screen.getByText("新遊戲")).toBeDefined();
		// 沒有存檔時不顯示「繼續」
		expect(screen.queryByText("繼續")).toBeNull();
	});

	it("沒有存檔也能從「練習模式」進 /sandbox", async () => {
		render(<HomePage />);
		const practice = await screen.findByRole("button", { name: "練習模式" });
		fireEvent.click(practice);
		expect(push).toHaveBeenCalledWith("/sandbox");
	});
});
