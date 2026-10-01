import { expect, test } from "@playwright/test";

/** M7 完成定義：標題 → 新遊戲 → 選角 → boot log → 地圖；關掉再開能按「繼續」。 */
test.describe("標題畫面", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("沒有存檔時只有新遊戲與設定，走完選角與 boot log 進入地圖", async ({ page }) => {
		await expect(page.getByText("KEPLER-9")).toBeVisible();
		await expect(page.getByText("繼續")).toHaveCount(0);

		// ↓ 不需要：第一項就是新遊戲
		await page.keyboard.press("Enter");
		await expect(page.getByText("選擇外觀")).toBeVisible();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");

		// boot log：第一次 Enter 跳過動畫，第二次 Enter 進地圖
		await expect(page.getByText("冷凍艙喚醒程序")).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(page.getByText("查無此人").first()).toBeVisible();
		await page.keyboard.press("Enter");

		await expect(page).toHaveURL(/\/play$/);
		await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	});

	test("有存檔時出現繼續，按下直接進入地圖", async ({ page }) => {
		await page.keyboard.press("Enter");
		await expect(page.getByText("選擇外觀")).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(page.getByText("冷凍艙喚醒程序")).toBeVisible();

		// 選完角就算有存檔：回標題應該看得到「繼續」
		await page.goto("/");
		await expect(page.getByText("繼續")).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/play$/);
	});

	test("設定選單可以切換文字速度並關閉", async ({ page }) => {
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("dialog")).toBeVisible();
		// 預設 normal 顯示「中」，→ 一次變 fast 顯示「快」
		await page.keyboard.press("ArrowRight");
		await expect(page.getByRole("dialog")).toContainText("快");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});
});
