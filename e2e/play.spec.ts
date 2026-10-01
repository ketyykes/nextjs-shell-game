import { expect, test } from "@playwright/test";

/** M2 完成定義：瀏覽器可玩 M1 的指令，重新整理後歷史與進度還在。 */
test.describe("/play 終端機", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/play");
		// 清掉上一次測試留下的存檔，確保每個測試從乾淨狀態開始
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("打 ls 看到冷凍艙目錄與 wake_up.txt", async ({ page }) => {
		const input = page.getByLabel("指令輸入");
		await expect(input).toBeFocused();
		await input.fill("ls");
		await input.press("Enter");
		await expect(page.getByText("pod_06/")).toBeVisible();
		await expect(page.getByText("wake_up.txt", { exact: true })).toBeVisible();
	});

	test("錯誤指令顯示繁中友善訊息", async ({ page }) => {
		const input = page.getByLabel("指令輸入");
		await input.fill("catwake_up.txt");
		await input.press("Enter");
		await expect(page.getByText("你是不是想打")).toBeVisible();
	});

	test("Tab 補全與 ↑ 叫回歷史", async ({ page }) => {
		const input = page.getByLabel("指令輸入");
		await input.fill("cat wa");
		await input.press("Tab");
		await expect(input).toHaveValue("cat wake_up.txt ");
		await input.press("Enter");
		await expect(page.getByText("喚醒排程").first()).toBeVisible();
		await input.press("ArrowUp");
		await expect(input).toHaveValue("cat wake_up.txt");
	});

	test("重新整理後輸出紀錄、工作目錄與歷史都還在", async ({ page }) => {
		const input = page.getByLabel("指令輸入");
		await input.fill("cd pod_06");
		await input.press("Enter");
		await input.fill("ls");
		await input.press("Enter");
		await expect(page.getByText("status.txt", { exact: true })).toBeVisible();

		await page.reload();

		const inputAfter = page.getByLabel("指令輸入");
		// 輸出紀錄還在
		await expect(page.getByText("status.txt", { exact: true })).toBeVisible();
		// 工作目錄還在：提示符顯示 ~/pod_06
		await expect(page.getByText("crew@kepler9:~/pod_06$").last()).toBeVisible();
		// 歷史還在
		await inputAfter.press("ArrowUp");
		await expect(inputAfter).toHaveValue("ls");
	});
});
