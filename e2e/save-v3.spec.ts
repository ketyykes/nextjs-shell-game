import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { hold, seedSave, TERMINALS_PER_CHAPTER } from "./helpers/deck";

/**
 * 存檔 v3：通關狀態與遊玩統計（M14-1）、存檔匯出匯入（M14-2）、劇本改版偵測（M12-4）。
 * `seedSave` 寫的是 v1，這裡的每個測試都順便驗證 v1 → v3 的 migrate 在真瀏覽器跑得通。
 */

/** 讀 localStorage 的整份存檔。 */
async function readSave(page: Page): Promise<{ state: Record<string, Record<string, unknown>>; version: number }> {
	return page.evaluate(() => JSON.parse(window.localStorage.getItem("kepler9-save") ?? "{}"));
}

/** 改 localStorage 裡的存檔（下一次讀檔才生效）。 */
async function patchSave(page: Page, patch: (save: { state: Record<string, unknown> }) => void): Promise<void> {
	const raw = await page.evaluate(() => window.localStorage.getItem("kepler9-save") as string);
	const save = JSON.parse(raw);
	patch(save);
	await page.evaluate((json) => window.localStorage.setItem("kepler9-save", json), JSON.stringify(save));
}

/** 第一章到第 n 章全部終端機的 id。 */
function allTerminalsUpTo(chapter: number): string[] {
	const ids: string[] = [];
	for (let current = 1; current <= chapter; current += 1) {
		for (let index = 1; index <= TERMINALS_PER_CHAPTER; index += 1) {
			ids.push(`ch${current}-t${index}`);
		}
	}
	return ids;
}

test("第六章片尾播完回標題：副標顯示已逃離、「繼續」換成「通關紀錄」，重整後仍是通關狀態", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedSave(page, { chapter: 6, solvedTerminals: allTerminalsUpTo(6), flags: ["ch6.introShown"] });
	// v1 種子帶統計：migrate 只在沒有 stats 時補空的，帶了就保留
	await patchSave(page, (save) => {
		save.state.stats = {
			"1": { playTimeMs: 600_000, errors: 4, hints: 2 },
			"6": { playTimeMs: 125_000, errors: 3, hints: 1 },
		};
	});
	await page.goto("/play");

	// 六台都過關、終端機沒開：直接是章節結束畫面；回顧卡下方有本章紀錄
	const recap = page.getByTestId("chapter-end-recap");
	await expect(page.getByTestId("chapter-end-screen")).toBeVisible({ timeout: 20000 });
	for (let presses = 0; presses < 12 && !(await recap.isVisible()); presses += 1) {
		await page.keyboard.press("Enter");
		await page.waitForTimeout(300);
	}
	await expect(page.getByTestId("chapter-end-stats")).toContainText("用時 2 分 5 秒");
	await expect(page.getByTestId("chapter-end-stats")).toContainText("指令出錯 3 次");
	await recap.getByRole("button", { name: "繼續" }).click();

	// 片尾逐句，最後一句再 Enter 回標題
	const hint = page.getByTestId("chapter-end-continue-hint");
	for (let presses = 0; presses < 12 && !(await hint.isVisible()); presses += 1) {
		await page.keyboard.press("Enter");
		await page.waitForTimeout(300);
	}
	await expect(hint).toHaveText("按 Enter 回標題");
	await page.keyboard.press("Enter");

	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");
	await expect(page.getByRole("button", { name: "繼續" })).toHaveCount(0);
	const save = await readSave(page);
	expect(save.version).toBe(3);
	expect(typeof save.state.progress.clearedAt).toBe("string");

	// 重整後一樣；通關紀錄列出每章與總計
	await page.reload();
	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");
	await page.getByRole("button", { name: "通關紀錄" }).click();
	const record = page.getByRole("region", { name: "通關紀錄" });
	await expect(record).toContainText("第一章 冷凍艙");
	await expect(record).toContainText("10 分 0 秒");
	await expect(record.locator("tfoot")).toContainText("12 分 5 秒");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "選章" })).toBeVisible();
	expect(pageErrors).toEqual([]);
});

test("存檔管理：匯出成 JSON 檔，清掉存檔後再匯入，重新載入後回到原本的進度", async ({ page }) => {
	await seedSave(page, { chapter: 3 });
	await page.reload();
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	// 讀檔時 v1 種子升成 v3 寫回，等寫完再匯出
	await expect.poll(async () => (await readSave(page)).version).toBe(3);

	await page.getByRole("button", { name: "存檔管理" }).click();
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "匯出存檔" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^kepler9-save-\d{8}-\d{4}\.json$/);
	const exportedPath = await download.path();
	const exported = JSON.parse(await readFile(exportedPath, "utf8"));
	expect(exported.version).toBe(3);
	expect(exported.state.progress.chapter).toBe(3);
	await expect(page.getByTestId("save-manager-message")).toContainText("已下載");
	await page.keyboard.press("Escape");

	// 換一台電腦的情境：沒有存檔
	await page.evaluate(() => window.localStorage.clear());
	await page.reload();
	await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
	await expect(page.getByRole("button", { name: "繼續" })).toHaveCount(0);

	await page.getByRole("button", { name: "存檔管理" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "匯入存檔" }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles(exportedPath);

	await expect(page.getByTestId("confirm-panel")).toContainText("第三章 工程艙");
	await page.getByRole("button", { name: "匯入" }).click();

	// 匯入後整頁重新載入，標題回到第三章
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible({ timeout: 10000 });
	await expect(page.getByTestId("title-subtitle")).toHaveText("工程艙 · 第三章");
	const save = await readSave(page);
	expect(save.state.progress).toEqual(exported.state.progress);
});

test("存檔管理：匯入壞掉或版本太新的檔案會被拒絕，原本的存檔不變", async ({ page }) => {
	await seedSave(page, { chapter: 2 });
	await page.reload();
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect.poll(async () => (await readSave(page)).version).toBe(3);
	const before = await page.evaluate(() => window.localStorage.getItem("kepler9-save"));

	await page.getByRole("button", { name: "存檔管理" }).click();
	const message = page.getByTestId("save-manager-message");
	for (const [content, expected] of [
		["{壞掉的存檔", "不是 JSON"],
		[JSON.stringify({ state: { progress: {} }, version: 99 }), "較新版本"],
	] as const) {
		const chooserPromise = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "匯入存檔" }).click();
		const chooser = await chooserPromise;
		await chooser.setFiles({ name: "save.json", mimeType: "application/json", buffer: Buffer.from(content) });
		await expect(message).toContainText(expected);
		await expect(page.getByTestId("confirm-panel")).toHaveCount(0);
	}

	expect(await page.evaluate(() => window.localStorage.getItem("kepler9-save"))).toBe(before);
});

/** 走到第一章 T1 旁按 E；dev 伺服器剛編譯完會掉幀，看不到「按 E」就從角落重走。 */
async function openCryoTerminal(page: Page): Promise<void> {
	const hint = page.getByTestId("interact-hint");
	await page.waitForTimeout(500);
	for (let attempt = 0; attempt < 3 && !(await hint.isVisible()); attempt += 1) {
		await hold(page, ["ArrowUp", "ArrowLeft"], 2500);
		await hold(page, ["ArrowRight"], 580);
		await page.waitForTimeout(300);
	}
	await expect(hint).toBeVisible();
	await page.keyboard.press("e");
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
}

test("劇本改版：沒過關的終端機用新版劇本重建，輸出區多一行說明、指令歷史保留", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await page.goto("/play");
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await page.locator("canvas").click();
	await openCryoTerminal(page);

	const input = page.getByLabel("指令輸入");
	await input.fill("echo mine > mine.txt");
	await input.press("Enter");
	await expect.poll(async () => typeof (await readSave(page)).state.terminals["ch1-t1"]).toBe("object");
	const firstHash = ((await readSave(page)).state.terminals["ch1-t1"] as { scriptHash?: string }).scriptHash;
	expect(firstHash).toMatch(/^[0-9a-f]{16}$/);

	// 模擬存檔是舊版劇本留下的：雜湊對不上。先離開 /play，免得遊戲（角色停下存位置等）把改過的存檔又蓋回去
	await page.goto("/");
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await patchSave(page, (save) => {
		(save.state.terminals as Record<string, { scriptHash: string }>)["ch1-t1"].scriptHash = "0000000000000000";
	});
	await page.goto("/play");
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await page.locator("canvas").click();
	await openCryoTerminal(page);

	await expect(page.getByText("這台終端機的資料已更新到新版本")).toBeVisible();
	// 檔案系統回到劇本初始狀態，自己寫的檔案不見了；歷史還在
	const reopenedInput = page.getByLabel("指令輸入");
	await reopenedInput.fill("ls");
	await reopenedInput.press("Enter");
	await expect(page.getByText("wake_up.txt", { exact: true }).last()).toBeVisible();
	await expect(page.getByText("mine.txt", { exact: true })).toHaveCount(0);
	await reopenedInput.press("ArrowUp");
	await reopenedInput.press("ArrowUp");
	await expect(reopenedInput).toHaveValue("echo mine > mine.txt");

	const terminal = (await readSave(page)).state.terminals["ch1-t1"] as { scriptHash: string };
	expect(terminal.scriptHash).toBe(firstHash);
	expect(pageErrors).toEqual([]);
});
