import { expect, test, type Page } from "@playwright/test";
import { seedSave, TERMINALS_PER_CHAPTER } from "./helpers/deck";

/**
 * 救援船 ARGO（設計文件 4.23）：片尾之後可玩的尾聲。
 * 通關過的標題多「救援船 ARGO」，片尾最後一句之後也能直接連線；/argo 是一台全螢幕的醫療終端機，不存檔。
 */

const SAVE_KEY = "kepler9-save";
const NOVA_COMMAND = "nova --restore /mnt/upload/kepler9/core.part";

async function readSave(page: Page): Promise<string | null> {
	return page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
}

/** 在終端機打一行指令。 */
async function run(page: Page, command: string): Promise<void> {
	const input = page.getByLabel("指令輸入");
	await input.fill(command);
	await input.press("Enter");
}

/** 六章全部終端機的 id。 */
function allTerminals(): string[] {
	const ids: string[] = [];
	for (let chapter = 1; chapter <= 6; chapter += 1) {
		for (let index = 1; index <= TERMINALS_PER_CHAPTER; index += 1) {
			ids.push(`ch${chapter}-t${index}`);
		}
	}
	return ids;
}

/** 已經看完片尾的存檔：v1 種子讀進來時 migrate 會補上已逃離的時間；可以順便種阿彬留言的進度。 */
async function seedClearedSave(page: Page, abinNotes?: { found: string[]; reply: string | null }): Promise<void> {
	await seedSave(page, { chapter: 6, solvedTerminals: allTerminals(), flags: ["ch6.introShown", "ch6.outroShown"] });
	if (abinNotes !== undefined) {
		await page.evaluate(
			([key, notes]) => {
				const save = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
				save.state.abinNotes = notes;
				window.localStorage.setItem(key as string, JSON.stringify(save));
			},
			[SAVE_KEY, abinNotes] as const,
		);
	}
	await page.reload();
}

/** Esc 先確認，← 選「回標題」，回到標題畫面。 */
async function disconnect(page: Page): Promise<void> {
	await page.getByLabel("指令輸入").press("Escape");
	await expect(page.getByTestId("confirm-panel")).toContainText("斷線回標題？");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/$/);
}

test("通關過的標題有「救援船 ARGO」：進去打 ps 看得到 nova、殺不掉，Esc 確認後回標題，存檔不變", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedClearedSave(page, { found: ["ch1-jokes"], reply: "我在這裡" });
	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");
	// 讀檔時 v1 種子升成目前版本寫回，等寫完再記下來比對
	await expect.poll(async () => JSON.parse((await readSave(page)) ?? "{}").version).toBe(4);
	const before = await readSave(page);

	await page.getByRole("button", { name: "救援船 ARGO" }).click();
	// 開發模式第一次進 /argo 要先編譯這條路由，幾個 worker 同時跑時會超過預設的 5 秒
	await expect(page).toHaveURL(/\/argo$/, { timeout: 20000 });
	await expect(page.getByRole("heading", { name: "救援船 ARGO" })).toBeVisible();
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	// 不載 Phaser、沒有氧氣 HUD
	await expect(page.locator("canvas")).toHaveCount(0);
	await expect(page.getByText(/O2 \d+%/)).toHaveCount(0);

	const log = page.getByRole("log");
	await run(page, "ps");
	await expect(log).toContainText(NOVA_COMMAND);
	await expect(page.getByText("tech@argo:~$").first()).toBeVisible();
	await run(page, "kill -9 2290");
	await expect(log).toContainText("沒有權限終止程序 2290");
	await run(page, "ls /mnt/upload/kepler9/abin");
	await expect(log).toContainText("20280418-1005.txt");
	await expect(log).toContainText("reply.txt");

	await disconnect(page);
	await expect(page.getByRole("button", { name: "救援船 ARGO" })).toBeVisible();
	expect(await readSave(page)).toBe(before);
	expect(pageErrors).toEqual([]);
});

test("沒通關直接開 /argo 會導回標題", async ({ page }) => {
	await seedSave(page, { chapter: 3 });
	await page.goto("/argo");
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect(page.getByRole("button", { name: "救援船 ARGO" })).toHaveCount(0);
});

test("片尾最後一句之後選「連線救援船終端機」：先記下已逃離，再進 /argo", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedSave(page, { chapter: 6, solvedTerminals: allTerminals(), flags: ["ch6.introShown"] });
	await page.goto("/play");

	// 六台都過關、終端機沒開：直接是章節結束畫面，走到回顧卡再進片尾
	await expect(page.getByTestId("chapter-end-screen")).toBeVisible({ timeout: 20000 });
	const recap = page.getByTestId("chapter-end-recap");
	for (let presses = 0; presses < 12 && !(await recap.isVisible()); presses += 1) {
		await page.keyboard.press("Enter");
		await page.waitForTimeout(300);
	}
	await recap.getByRole("button", { name: "繼續" }).click();

	const hint = page.getByTestId("chapter-end-continue-hint");
	for (let presses = 0; presses < 12 && !(await hint.isVisible()); presses += 1) {
		await page.keyboard.press("Enter");
		await page.waitForTimeout(300);
	}
	await expect(page.getByTestId("chapter-end-outro-text")).toHaveText("你是……");
	await expect(hint).toHaveText("按 Enter 繼續");
	await page.keyboard.press("Enter");

	// 預設選「連線救援船終端機」；Phaser 還掛在底下，方向鍵一樣切得動
	const choices = page.getByTestId("chapter-end-ending-choices");
	const connect = choices.getByRole("button", { name: "連線救援船終端機" });
	const back = choices.getByRole("button", { name: "回標題" });
	await expect(connect).toHaveAttribute("data-selected", "true");
	await page.keyboard.press("ArrowDown");
	await expect(back).toHaveAttribute("data-selected", "true");
	await page.keyboard.press("ArrowUp");
	await expect(connect).toHaveAttribute("data-selected", "true");
	await page.keyboard.press("Enter");

	await expect(page).toHaveURL(/\/argo$/, { timeout: 20000 });
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	const save = JSON.parse((await readSave(page)) ?? "{}");
	expect(typeof save.state.progress.clearedAt).toBe("string");
	expect(save.state.storyFlags["ch6.outroShown"]).toBe(true);

	await disconnect(page);
	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");
	expect(pageErrors).toEqual([]);
});
