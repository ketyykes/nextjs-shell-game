import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { DEFAULT_PROGRESS, SAVE_STORAGE_KEY, SAVE_VERSION } from "@/game/store/types";
import type { SaveData } from "@/game/store/types";
import { TitleFlow } from "./TitleFlow";
import { REDUCED_MOTION_QUERY } from "./usePrefersReducedMotion";
import { TOUCH_PRIMARY_QUERY } from "./useTouchWarning";

// push 共用一個，才能檢查選單項目導去哪一頁
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ prefetch: vi.fn(), push, replace: vi.fn() }),
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

/** 問過光敏確認的存檔（其餘照預設），測試其他功能時不讓面板擋在前面。 */
function promptSeenSave(): SaveData {
	const save = createInitialSaveData();
	return { ...save, settings: { ...save.settings, flickerPromptSeen: true } };
}

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
	localStorage.clear();
	push.mockClear();
});

afterEach(() => {
	cleanup();
});

describe("TitleFlow 的製作名單（設計文件 4.20）", () => {
	it("沒有存檔也能從「製作名單」進 /credits", async () => {
		await renderWithSave(promptSeenSave());

		fireEvent.click(screen.getByRole("button", { name: "製作名單" }));

		expect(push).toHaveBeenCalledWith("/credits");
	});
});

describe("TitleFlow 的存檔管理（M14-2）", () => {
	it("沒有存檔也能打開存檔管理；開著時標題選單不收鍵盤，Esc 關掉", async () => {
		// 光敏確認問過了，鍵盤停用的才確定是存檔管理造成的
		await renderWithSave(promptSeenSave());

		fireEvent.click(screen.getByRole("button", { name: "存檔管理" }));
		expect(screen.getByRole("dialog", { name: "存檔管理" })).toBeDefined();

		// 標題選單的「新遊戲」不能被同一下 Enter 觸發（會進選角）
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "存檔管理" })).toBeNull();
		expect(screen.getByTestId("title-screen")).toBeDefined();
	});
});

/** jsdom 沒有 matchMedia：只讓給定的查詢成立，例如觸控為主的裝置。 */
function stubMatchMedia(matchingQueries: readonly string[]) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: matchingQueries.includes(query),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})),
	);
}

describe("TitleFlow 的光敏確認（設計文件 4.20）", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("第一次進遊戲先問；開著時標題選單不收鍵盤，Enter 選的是預設的「關閉」，寫進設定後不再出現", async () => {
		await renderWithSave(createInitialSaveData());

		expect(screen.getByRole("alertdialog", { name: "光敏提醒" })).toBeDefined();
		fireEvent.keyDown(window, { key: "Enter" });

		// 同一下 Enter 不能順便觸發標題選單的「新遊戲」
		expect(screen.queryByText("選擇外觀")).toBeNull();
		expect(screen.queryByRole("alertdialog", { name: "光敏提醒" })).toBeNull();
		expect(useGameStore.getState().settings.flickerEnabled).toBe(false);
		expect(useGameStore.getState().settings.flickerPromptSeen).toBe(true);

		// 重新進標題（例如重新整理）不再問
		cleanup();
		render(<TitleFlow />);
		expect(screen.queryByRole("alertdialog", { name: "光敏提醒" })).toBeNull();
	});

	it("選「保留閃爍效果」：閃爍照舊開著，也記下問過了", async () => {
		await renderWithSave(createInitialSaveData());

		fireEvent.click(screen.getByRole("button", { name: "保留閃爍效果" }));

		expect(screen.queryByRole("alertdialog", { name: "光敏提醒" })).toBeNull();
		expect(useGameStore.getState().settings.flickerEnabled).toBe(true);
		expect(useGameStore.getState().settings.flickerPromptSeen).toBe(true);
	});

	it("還沒選之前，面板後面的標題也不播 CRT 閃爍；選「保留」之後才播", async () => {
		await renderWithSave(createInitialSaveData());
		// CRT 覆蓋層是 aria-hidden 的裝飾，沒有角色可查，只能用 testid
		expect(screen.queryByTestId("crt-flicker")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "保留閃爍效果" }));

		expect(screen.getByTestId("crt-flicker")).toBeDefined();
	});

	it("問過的存檔直接是標題選單", async () => {
		await renderWithSave(promptSeenSave());

		expect(screen.queryByRole("alertdialog", { name: "光敏提醒" })).toBeNull();
		expect(screen.getByRole("button", { name: "新遊戲" })).toBeDefined();
	});

	it("觸控為主的裝置：光敏確認先問，選完才出現需要實體鍵盤的提示", async () => {
		stubMatchMedia([TOUCH_PRIMARY_QUERY]);
		await renderWithSave(createInitialSaveData());

		expect(screen.getByRole("alertdialog", { name: "光敏提醒" })).toBeDefined();
		expect(screen.queryByRole("alertdialog", { name: "本遊戲需要實體鍵盤" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "關閉閃爍效果" }));

		expect(screen.getByRole("alertdialog", { name: "本遊戲需要實體鍵盤" })).toBeDefined();
	});

	it("系統設定了減少動態效果時，面板多一句說明", async () => {
		stubMatchMedia([REDUCED_MOTION_QUERY]);
		await renderWithSave(createInitialSaveData());

		expect(screen.getByRole("alertdialog", { name: "光敏提醒" }).textContent).toContain(
			"偵測到你的系統設定了減少動態效果",
		);
	});
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
		expect(screen.queryByRole("button", { name: "下一步：真的終端機" })).toBeNull();
	});

	it("通關過：「下一步：真的終端機」進 /real-world（設計文件 4.20）", async () => {
		await renderWithSave(finishedSave());

		fireEvent.click(screen.getByRole("button", { name: "下一步：真的終端機" }));

		expect(push).toHaveBeenCalledWith("/real-world");
	});
});

describe("TitleFlow 的檔案櫃（4.24）", () => {
	it("通關過：「檔案櫃」打開面板，開著時標題選單不收鍵盤，Esc 關掉回標題", async () => {
		await renderWithSave(finishedSave());

		fireEvent.click(screen.getByRole("button", { name: "檔案櫃" }));
		expect(await screen.findByRole("dialog", { name: "檔案櫃" })).toBeDefined();

		// Enter 打開的是檔案櫃的第一章，不是標題選單第一項的「通關紀錄」
		fireEvent.keyDown(window, { key: "Enter" });
		expect(screen.getByRole("button", { name: /\/home\/tech\/wake_up\.txt/ })).toBeDefined();
		expect(screen.queryByRole("region", { name: "通關紀錄" })).toBeNull();

		fireEvent.keyDown(window, { key: "Escape" });
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "檔案櫃" })).toBeNull();
		expect(screen.getByTestId("title-screen")).toBeDefined();
	});

	it("還沒通關：沒有「檔案櫃」", async () => {
		const save = finishedSave();
		await renderWithSave({ ...save, progress: { ...save.progress, clearedAt: null }, storyFlags: {} });

		expect(screen.queryByRole("button", { name: "檔案櫃" })).toBeNull();
	});
});
