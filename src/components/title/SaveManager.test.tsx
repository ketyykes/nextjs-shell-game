import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { setSaveIssue } from "@/game/store/saveStatus";
import { DEFAULT_PROGRESS, SAVE_STORAGE_KEY, SAVE_VERSION } from "@/game/store/types";
import type { SaveData } from "@/game/store/types";
import { SaveManager } from "./SaveManager";

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

function playedSave(chapter = 2): SaveData {
	return {
		...createInitialSaveData(),
		progress: {
			...DEFAULT_PROGRESS,
			chapter,
			furthestChapter: chapter,
			character: "a",
			savedAt: "2031-03-12T08:15:00.000Z",
		},
		stats: { "1": { playTimeMs: 1000, errors: 1, hints: 0 } },
	};
}

function renderManager() {
	const onClose = vi.fn();
	const onImported = vi.fn();
	render(<SaveManager onClose={onClose} onImported={onImported} />);
	return { onClose, onImported };
}

/** 攔下載：記下產生的 Blob 與 <a download> 的檔名，不真的觸發瀏覽器下載。 */
function captureDownloads() {
	const blobs: Blob[] = [];
	const names: string[] = [];
	vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
		blobs.push(blob as Blob);
		return "blob:kepler9";
	});
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
		names.push(this.download);
	});
	return { blobs, names };
}

/** 模擬玩家在檔案選擇器選了一個檔案。 */
async function chooseFile(text: string) {
	const input = screen.getByLabelText("選擇存檔檔案") as HTMLInputElement;
	const file = new File([text], "save.json", { type: "application/json" });
	await act(async () => {
		fireEvent.change(input, { target: { files: [file] } });
	});
}

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
	localStorage.clear();
	setSaveIssue(null);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	setSaveIssue(null);
});

describe("SaveManager 匯出", () => {
	it("有存檔：下載跟 localStorage 同格式的 JSON 檔，檔名帶日期，畫面說已下載", async () => {
		useGameStore.setState(playedSave());
		const { blobs, names } = captureDownloads();
		renderManager();

		fireEvent.click(screen.getByRole("button", { name: /匯出存檔/ }));

		expect(names).toHaveLength(1);
		expect(names[0]).toMatch(/^kepler9-save-\d{8}-\d{4}\.json$/);
		const exported = JSON.parse(await blobs[0].text());
		expect(exported).toEqual({ state: playedSave(), version: SAVE_VERSION });
		expect(screen.getByTestId("save-manager-message").textContent).toContain(names[0]);
	});

	it("沒有存檔：不下載，提示沒有存檔可以匯出", () => {
		const { names } = captureDownloads();
		renderManager();

		fireEvent.click(screen.getByRole("button", { name: /匯出存檔/ }));

		expect(names).toHaveLength(0);
		expect(screen.getByTestId("save-manager-message").textContent).toContain("沒有存檔");
	});

	it("存檔來自較新版本（這個分頁沒讀進來）：照原樣匯出 localStorage 裡的原始存檔", async () => {
		const raw = JSON.stringify({ state: { progress: { chapter: 5 } }, version: SAVE_VERSION + 1 });
		localStorage.setItem(SAVE_STORAGE_KEY, raw);
		setSaveIssue("newer-version");
		const { blobs } = captureDownloads();
		renderManager();

		fireEvent.click(screen.getByRole("button", { name: /匯出存檔/ }));

		expect(await blobs[0].text()).toBe(raw);
	});
});

describe("SaveManager 匯入", () => {
	it("Enter 選「匯入存檔」會打開檔案選擇器", () => {
		const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
		renderManager();

		press("ArrowDown");
		press("Enter");

		expect(click).toHaveBeenCalledTimes(1);
	});

	it("合法的檔案：先確認要覆蓋，確認後寫進 localStorage（升到目前版本）並通知重新載入", async () => {
		useGameStore.setState(playedSave(1));
		const { onImported } = renderManager();
		const imported = playedSave(3);

		await chooseFile(JSON.stringify({ state: imported, version: SAVE_VERSION }));

		const confirm = await screen.findByTestId("confirm-panel");
		expect(confirm.textContent).toContain("第三章 工程艙");
		expect(confirm.textContent).toContain("覆蓋");
		expect(onImported).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "匯入" }));

		expect(JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) as string)).toEqual({
			state: imported,
			version: SAVE_VERSION,
		});
		expect(onImported).toHaveBeenCalledTimes(1);
	});

	it("確認時選取消：存檔不變，回到存檔管理選單", async () => {
		localStorage.setItem(SAVE_STORAGE_KEY, "原本的存檔");
		const { onImported } = renderManager();

		await chooseFile(JSON.stringify({ state: playedSave(3), version: SAVE_VERSION }));
		await screen.findByTestId("confirm-panel");
		press("Enter");

		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(localStorage.getItem(SAVE_STORAGE_KEY)).toBe("原本的存檔");
		expect(onImported).not.toHaveBeenCalled();
	});

	it.each([
		["不是 JSON", "{壞掉", "JSON"],
		["版本太新", JSON.stringify({ state: playedSave(), version: SAVE_VERSION + 1 }), "較新版本"],
		["內容壞掉", JSON.stringify({ state: { progress: { chapter: "三" } }, version: SAVE_VERSION }), "格式錯誤"],
		["不是這個遊戲的檔案", JSON.stringify({ hello: "world" }), "不是 KEPLER-9 的存檔"],
	])("%s：拒絕並顯示繁中原因，不跳確認也不動存檔", async (_label, text, expected) => {
		localStorage.setItem(SAVE_STORAGE_KEY, "原本的存檔");
		const { onImported } = renderManager();

		await chooseFile(text);

		await waitFor(() => {
			expect(screen.getByTestId("save-manager-message").textContent).toContain(expected);
		});
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(localStorage.getItem(SAVE_STORAGE_KEY)).toBe("原本的存檔");
		expect(onImported).not.toHaveBeenCalled();
	});

	it("寫入失敗（儲存空間滿、被封鎖）：提示匯入失敗，不重新載入", async () => {
		const { onImported } = renderManager();
		await chooseFile(JSON.stringify({ state: playedSave(3), version: SAVE_VERSION }));
		await screen.findByTestId("confirm-panel");
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("儲存空間已滿", "QuotaExceededError");
		});

		fireEvent.click(screen.getByRole("button", { name: "匯入" }));

		expect(screen.getByTestId("save-manager-message").textContent).toContain("匯入失敗");
		expect(onImported).not.toHaveBeenCalled();
	});
});

describe("SaveManager 關閉", () => {
	it("Esc 或「返回」呼叫 onClose", () => {
		const { onClose } = renderManager();
		press("Escape");
		expect(onClose).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "返回" }));
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});
