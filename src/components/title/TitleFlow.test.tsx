import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { DEFAULT_PROGRESS, SAVE_STORAGE_KEY, SAVE_VERSION } from "@/game/store/types";
import type { SaveData } from "@/game/store/types";
import { TitleFlow } from "./TitleFlow";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// 預取 Phaser 與插圖跟這組測試無關
vi.mock("./usePlayPrefetch", () => ({ usePlayPrefetch: () => {} }));

/** 寫一份目前版本的存檔再讀進來。 */
async function renderWithSave(save: SaveData) {
	localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify({ state: save, version: SAVE_VERSION }));
	await useGameStore.persist.rehydrate();
	render(<TitleFlow />);
}

function finishedSave(): SaveData {
	return {
		...createInitialSaveData(),
		progress: {
			...DEFAULT_PROGRESS,
			chapter: 6,
			furthestChapter: 6,
			character: "a",
			savedAt: "2031-03-12T08:15:00.000Z",
			clearedAt: "2031-03-12T08:15:00.000Z",
		},
		storyFlags: { "ch6.outroShown": true },
		stats: { "6": { playTimeMs: 600_000, errors: 4, hints: 2 } },
	};
}

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
	localStorage.clear();
});

afterEach(() => {
	cleanup();
});

describe("TitleFlow 的通關狀態（M14-1）", () => {
	it("片尾播完回標題：副標是「已逃離 Kepler-9」，沒有「繼續」，有「通關紀錄」", async () => {
		await renderWithSave(finishedSave());

		expect(screen.getByTestId("title-subtitle").textContent).toBe("已逃離 Kepler-9");
		expect(screen.queryByRole("button", { name: "繼續" })).toBeNull();
		expect(screen.getByRole("button", { name: "通關紀錄" })).toBeDefined();
	});

	it("通關後選章重玩第三章：副標回到章節名，「繼續」與「通關紀錄」都在", async () => {
		const save = finishedSave();
		await renderWithSave({ ...save, progress: { ...save.progress, chapter: 3 }, storyFlags: {} });

		expect(screen.getByTestId("title-subtitle").textContent).toBe("工程艙 · 第三章");
		expect(screen.getByRole("button", { name: "繼續" })).toBeDefined();
		expect(screen.getByRole("button", { name: "通關紀錄" })).toBeDefined();
	});

	it("還沒通關：沒有「通關紀錄」", async () => {
		const save = finishedSave();
		await renderWithSave({ ...save, progress: { ...save.progress, clearedAt: null }, storyFlags: {} });

		expect(screen.getByTestId("title-subtitle").textContent).toBe("NOVA 核心 · 第六章");
		expect(screen.queryByRole("button", { name: "通關紀錄" })).toBeNull();
	});
});
