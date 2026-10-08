import { expect, test } from "@playwright/test";
import { seedSave } from "./helpers/deck";

/**
 * M12-6 素材載入失敗：Phaser 的 Preloader 載不到素材時，經 EventBus 讓 React 顯示繁中提示與「重新載入」。
 * 用 `page.route` 擋掉指定檔案模擬網路失敗。
 */

test("地圖載不到時蓋上「素材載入失敗」，重新載入後恢復正常", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await page.route("**/maps/deck1.json", (route) => route.abort());
	await page.goto("/play");

	const dialog = page.getByRole("alertdialog", { name: "素材載入失敗" });
	await expect(dialog).toBeVisible({ timeout: 20000 });
	await expect(dialog).toContainText("/maps/deck1.json");
	// 地圖沒有就不進 Station，不會在 Phaser 迴圈裡炸成黑畫面
	await expect(page.locator("main[data-scene-ready='true']")).toHaveCount(0);

	await page.unroute("**/maps/deck1.json");
	await dialog.getByRole("button", { name: "重新載入" }).click();
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await expect(dialog).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("音效載不到時遊戲照常進行，頂端提示可以收起來", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await page.route("**/audio/door.*", (route) => route.abort());
	await page.goto("/play");

	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	const notice = page.getByTestId("asset-error-notice");
	await expect(notice).toContainText("音效");
	await notice.getByRole("button", { name: "先不用" }).click();
	await expect(notice).toHaveCount(0);
	expect(errors).toEqual([]);
});
