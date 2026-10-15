import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { DEFAULT_PROGRESS, SAVE_STORAGE_KEY, SAVE_VERSION, type SaveData } from "@/game/store/types";
import ArgoPage, { metadata } from "./page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

// next/navigation 的 useRouter 在測試環境沒有 App Router context，用假的頂替
vi.mock("next/navigation", () => ({
	useRouter: () => router,
}));

/** 寫一份目前版本的存檔再讀進來。 */
async function seedSave(save: SaveData): Promise<string> {
	const raw = JSON.stringify({ state: save, version: SAVE_VERSION });
	localStorage.setItem(SAVE_STORAGE_KEY, raw);
	await useGameStore.persist.rehydrate();
	return raw;
}

/** 通關過的存檔，找到兩則阿彬的留言。 */
function clearedSave(): SaveData {
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
		abinNotes: { found: ["ch1-jokes", "ch6-shift"], reply: "我在這裡" },
	};
}

function runCommand(text: string): void {
	const input = screen.getByLabelText("指令輸入");
	fireEvent.change(input, { target: { value: text } });
	fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
	localStorage.clear();
	router.push.mockClear();
	router.replace.mockClear();
});

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("/argo 的 metadata", () => {
	it("帶 robots noindex：沒通關會被導回標題，不該被搜尋引擎收錄", () => {
		expect(metadata.robots).toEqual({ index: false });
	});
});

describe("ArgoPage 守門", () => {
	it("沒有存檔直接開：導回標題，不顯示終端機", async () => {
		await seedSave(createInitialSaveData());
		render(<ArgoPage />);
		await waitFor(() => {
			expect(router.replace).toHaveBeenCalledWith("/");
		});
		expect(screen.queryByLabelText("指令輸入")).toBeNull();
	});

	it("有存檔但還沒通關：一樣導回標題", async () => {
		const save = clearedSave();
		await seedSave({ ...save, progress: { ...save.progress, clearedAt: null } });
		render(<ArgoPage />);
		await waitFor(() => {
			expect(router.replace).toHaveBeenCalledWith("/");
		});
		expect(screen.queryByLabelText("指令輸入")).toBeNull();
	});

	it("通關過：顯示救援船終端機，上傳裡是存檔的留言與回信，打指令不寫存檔", async () => {
		const raw = await seedSave(clearedSave());
		const setItem = vi.spyOn(Storage.prototype, "setItem");

		render(<ArgoPage />);
		await screen.findByLabelText("指令輸入");
		expect(router.replace).not.toHaveBeenCalled();

		runCommand("ps");
		runCommand("ls /mnt/upload/kepler9/abin");
		runCommand("rm /mnt/upload/kepler9/manifest.txt");
		const log = screen.getByRole("log").textContent ?? "";
		expect(log).toContain("nova --restore");
		expect(log).toContain("20280418-1005.txt");
		expect(log).toContain("20310310-0240.txt");
		expect(log).toContain("reply.txt");

		expect(setItem).not.toHaveBeenCalled();
		expect(localStorage.getItem(SAVE_STORAGE_KEY)).toBe(raw);
	});

	it("確認斷線後導回標題", async () => {
		await seedSave(clearedSave());
		render(<ArgoPage />);
		const input = await screen.findByLabelText("指令輸入");
		fireEvent.keyDown(input, { key: "Escape" });
		fireEvent.click(screen.getByRole("button", { name: "回標題" }));
		expect(router.push).toHaveBeenCalledWith("/");
	});
});
