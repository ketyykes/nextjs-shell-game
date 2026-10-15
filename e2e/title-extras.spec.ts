import { expect, test, type Page } from "@playwright/test";

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
