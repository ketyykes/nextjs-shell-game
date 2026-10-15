import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { DEFAULT_PROGRESS, SAVE_STORAGE_KEY, SAVE_VERSION, type SaveData } from "@/game/store/types";
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

describe("HomePage 的救援船 ARGO（設計文件 4.23）", () => {
	/** 寫一份目前版本的存檔再讀進來。 */
	async function seedSave(clearedAt: string | null): Promise<void> {
		const save: SaveData = {
			...createInitialSaveData(),
			progress: {
				...DEFAULT_PROGRESS,
				chapter: 6,
				furthestChapter: 6,
				character: "a",
				savedAt: "2031-03-12T08:15:00.000Z",
				clearedAt,
			},
			storyFlags: { "ch6.outroShown": true },
		};
		localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify({ state: save, version: SAVE_VERSION }));
		await useGameStore.persist.rehydrate();
	}

	afterEach(() => {
		useGameStore.setState(createInitialSaveData());
	});

	it("通關過：選單在「通關紀錄」後面多一項「救援船 ARGO」，按下進 /argo", async () => {
		await seedSave("2031-03-12T08:15:00.000Z");
		render(<HomePage />);
		const argo = await screen.findByRole("button", { name: "救援船 ARGO" });
		// 選取中的項目前面有 ▸，比對時拿掉
		const labels = screen.getAllByRole("button").map((button) => button.textContent?.replace("▸", "").trim());
		expect(labels.indexOf("救援船 ARGO")).toBe(labels.indexOf("通關紀錄") + 1);

		fireEvent.click(argo);
		expect(push).toHaveBeenCalledWith("/argo");
	});

	it("還沒通關：沒有「救援船 ARGO」", async () => {
		await seedSave(null);
		render(<HomePage />);
		await screen.findByRole("button", { name: "新遊戲" });
		expect(screen.queryByRole("button", { name: "救援船 ARGO" })).toBeNull();
	});
});
