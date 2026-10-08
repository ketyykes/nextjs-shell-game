import { expect, test } from "@playwright/test";

/** M7 完成定義：標題 → 新遊戲 → 選角 → boot log → 地圖；關掉再開能按「繼續」。 */
test.describe("標題畫面", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
		// 讀檔完成、標題選單掛上鍵盤監聽之前按的鍵會被吃掉，先等選單出現
		await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
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

	test("桌機不顯示觸控裝置提示", async ({ page }) => {
		await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
		await expect(page.getByTestId("touch-warning")).toHaveCount(0);
	});
});

/** A34：觸控為主的裝置（Chromium 開 hasTouch 時 pointer: coarse 且 hover: none）先提示需要實體鍵盤，可以略過。 */
test.describe("觸控裝置提示", () => {
	test.use({ hasTouch: true });

	test("標題先提示需要實體鍵盤，Enter 只略過提示，之後照常操作且同分頁不再提示", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();

		const warning = page.getByRole("alertdialog", { name: "本遊戲需要實體鍵盤" });
		await expect(warning).toBeVisible();

		// 接實體鍵盤的平板：Enter 只關掉提示，不會同一下就觸發標題選單的「新遊戲」
		await page.keyboard.press("Enter");
		await expect(warning).toHaveCount(0);
		await expect(page.getByText("選擇外觀")).toHaveCount(0);

		await page.reload();
		await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
		await expect(warning).toHaveCount(0);

		await page.getByRole("button", { name: "新遊戲" }).tap();
		await expect(page.getByText("選擇外觀")).toBeVisible();
	});

	test("點「仍要繼續」略過提示", async ({ page }) => {
		await page.goto("/");
		const warning = page.getByRole("alertdialog", { name: "本遊戲需要實體鍵盤" });
		await expect(warning).toBeVisible();
		await page.getByRole("button", { name: "仍要繼續" }).tap();
		await expect(warning).toHaveCount(0);
		await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
	});
});
