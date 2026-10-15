import { expect, test, type Page } from "@playwright/test";
import { seedSave } from "./helpers/deck";
import { answerFlickerPrompt } from "./helpers/title";

/** 設計文件 4.20：光敏首次確認、製作名單 /credits、真實世界橋接頁 /real-world。 */

/** 讀 localStorage 裡存檔的設定。 */
async function readSettings(page: Page): Promise<Record<string, unknown>> {
	return page.evaluate(() => JSON.parse(window.localStorage.getItem("kepler9-save") ?? "{}").state?.settings ?? {});
}

test("第一次進站先問光敏確認：Enter 選預設的「關閉」，設定選單裡閃爍是關的，重新整理不再問", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => window.localStorage.clear());
	await page.reload();

	const prompt = page.getByRole("alertdialog", { name: "光敏提醒" });
	await expect(prompt).toBeVisible();
	await expect(prompt).toContainText("本遊戲有燈光閃爍與畫面閃動的效果");
	await expect(prompt.getByRole("button", { name: "關閉閃爍效果" })).toHaveAttribute("data-selected", "true");

	// Esc 不關，一定要選一個；Enter 是預設的「關閉」，同一下不會觸發標題選單的「新遊戲」
	await page.keyboard.press("Escape");
	await expect(prompt).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(prompt).toHaveCount(0);
	await expect(page.getByText("選擇外觀")).toHaveCount(0);
	expect(await readSettings(page)).toMatchObject({ flickerEnabled: false, flickerPromptSeen: true });

	await page.getByRole("button", { name: "設定" }).click();
	await expect(page.getByRole("dialog", { name: "設定" }).getByRole("button", { name: "閃爍效果：關" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "設定" })).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
	await expect(prompt).toHaveCount(0);
});

test("製作名單：沒有存檔也在標題選單最後一項，進 /credits 後「返回標題」與 Esc 都回得去，授權全文跟著網站散佈", async ({
	page,
}) => {
	await page.goto("/");
	await page.evaluate(() => window.localStorage.clear());
	await page.reload();
	await answerFlickerPrompt(page);

	const menuItems = page.getByRole("navigation", { name: "標題選單" }).getByRole("button");
	await expect(menuItems.last()).toHaveText(/製作名單/);
	await page.getByRole("button", { name: "製作名單" }).click();
	await expect(page).toHaveURL(/\/credits$/);
	await expect(page.getByRole("heading", { level: 1, name: "製作名單" })).toBeVisible();
	await expect(page.getByRole("region", { name: "字型" })).toContainText("Fusion Pixel Font");

	// 從標題進來是 client 端導頁，Esc 的監聽已經掛好
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/:\d+\/$/);
	await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();

	// 直接打開網址：「返回標題」是一般連結，不等 JavaScript 也能按
	await page.goto("/credits");
	await page.getByRole("link", { name: "返回標題" }).first().click();
	await expect(page).toHaveURL(/:\d+\/$/);
	await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();

	for (const [file, text] of [
		["OFL-1.1.txt", "SIL OPEN FONT LICENSE Version 1.1"],
		["LICENSE-fusion-pixel.txt", "TakWolf"],
		["LICENSE-kenney.txt", "Kenney"],
	] as const) {
		const response = await page.request.get(`/licenses/${file}`);
		expect(response.status(), file).toBe(200);
		expect(await response.text()).toContain(text);
	}
});

test("通關過的存檔：標題的「通關紀錄」後面多一項「下一步：真的終端機」，進 /real-world 後 Esc 與「返回標題」都回得去", async ({
	page,
}) => {
	// 第六章片尾看完的舊存檔：migrate 直接算已逃離（存檔 v3 的升級規則）
	await seedSave(page, { chapter: 6, flags: ["ch6.introShown", "ch6.outroShown"] });
	await page.reload();
	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");

	const menuItems = page.getByRole("navigation", { name: "標題選單" }).getByRole("button");
	await expect(menuItems.nth(0)).toHaveText(/通關紀錄/);
	await expect(menuItems.nth(1)).toHaveText(/下一步：真的終端機/);
	await page.getByRole("button", { name: "下一步：真的終端機" }).click();

	await expect(page).toHaveURL(/\/real-world$/);
	await expect(page.getByRole("heading", { level: 1, name: "下一步：真的終端機" })).toBeVisible();
	await expect(page.getByRole("region", { name: "打開終端機" })).toContainText("wsl --install");
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/:\d+\/$/);
	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");

	await page.goto("/real-world");
	await page.getByRole("link", { name: "返回標題" }).last().click();
	await expect(page).toHaveURL(/:\d+\/$/);
	await expect(page.getByRole("button", { name: "下一步：真的終端機" })).toBeVisible();
});

test("沒通關的存檔沒有「下一步：真的終端機」", async ({ page }) => {
	await seedSave(page, { chapter: 3 });
	await page.reload();
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect(page.getByRole("button", { name: "下一步：真的終端機" })).toHaveCount(0);
});
