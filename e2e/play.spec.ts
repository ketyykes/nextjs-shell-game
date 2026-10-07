import { expect, test, type Page } from "@playwright/test";

/**
 * M2 完成定義：瀏覽器可玩 M1 的指令，重新整理後歷史與進度還在。
 * M3 完成定義：/play 能走動與碰撞，六台終端機位置正確（這裡驗證走到 T1 並按 E 開得起來）。
 */

/**
 * 走到 T1 冷凍艙控制台並按 E 開啟終端機。出生點在冷凍艙中央，T1 在房間左上方。
 * 存檔 v2 起會還原角色位置，已經站在 T1 旁（提示已出現）就不走。
 */
async function openCryoTerminal(page: Page): Promise<void> {
	// 等 Phaser 畫布出現，而且 Station 場景已建立（Preloader 還在載資源時按鍵會被吃掉）
	await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 15000 });
	await page.locator("canvas").click();
	// 場景剛就緒的第一幀鍵盤可能還沒接上，稍等再按
	await page.waitForTimeout(300);

	// 角色若已站在終端機旁（reload 還原位置），等 nearby 偵測跟上就好，不要再走路走離它
	let reached = await page
		.getByTestId("interact-hint")
		.waitFor({ timeout: 1500 })
		.then(() => true)
		.catch(() => false);
	// 往左走再往上走，直到 HUD 出現「按 E」提示；走偏就往下退回去重走一次
	for (let attempt = 0; attempt < 3 && !reached; attempt += 1) {
		await page.keyboard.down("ArrowLeft");
		await page.waitForTimeout(700);
		await page.keyboard.up("ArrowLeft");
		await page.keyboard.down("ArrowUp");
		reached = await page
			.getByTestId("interact-hint")
			.waitFor({ timeout: 3000 })
			.then(() => true)
			.catch(() => false);
		await page.keyboard.up("ArrowUp");
		if (!reached) {
			await page.keyboard.down("ArrowDown");
			await page.waitForTimeout(900);
			await page.keyboard.up("ArrowDown");
		}
	}
	await expect(page.getByTestId("interact-hint")).toBeVisible();

	await page.keyboard.press("e");
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	// 開啟終端機的那一下 e 不可以漏進輸入框變成預填字
	await expect(page.getByLabel("指令輸入")).toHaveValue("");
}

test.describe("/play 地圖與終端機", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/play");
		// 清掉上一次測試留下的存檔，確保每個測試從乾淨狀態開始
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("走到冷凍艙控制台按 E 開啟終端機，打 ls 看到 wake_up.txt", async ({ page }) => {
		await openCryoTerminal(page);
		await expect(page.getByText("冷凍艙控制台").first()).toBeVisible();

		const input = page.getByLabel("指令輸入");
		await input.fill("ls");
		await input.press("Enter");
		await expect(page.getByText("pod_06/")).toBeVisible();
		await expect(page.getByText("wake_up.txt", { exact: true })).toBeVisible();
	});

	test("錯誤指令顯示繁中友善訊息並扣氧氣", async ({ page }) => {
		await openCryoTerminal(page);
		const input = page.getByLabel("指令輸入");
		await input.fill("catwake_up.txt");
		await input.press("Enter");
		await expect(page.getByText("你是不是想打")).toBeVisible();
		await expect(page.getByText("O2 99%")).toBeVisible();
	});

	test("Tab 補全與 ↑ 叫回歷史", async ({ page }) => {
		await openCryoTerminal(page);
		const input = page.getByLabel("指令輸入");
		await input.fill("cat wa");
		await input.press("Tab");
		await expect(input).toHaveValue("cat wake_up.txt ");
		await input.press("Enter");
		await expect(page.getByText("喚醒排程").first()).toBeVisible();
		await input.press("ArrowUp");
		await expect(input).toHaveValue("cat wake_up.txt");
	});

	test("cat wake_up.txt 過關：目標打勾、氧氣回滿、學會指令、NOVA 說話", async ({ page }) => {
		await openCryoTerminal(page);
		const input = page.getByLabel("指令輸入");
		// 先犯一次錯讓氧氣掉，過關後要回到 100
		await input.fill("cat nope");
		await input.press("Enter");
		await expect(page.getByText("O2 99%")).toBeVisible();

		await input.fill("cat wake_up.txt");
		await input.press("Enter");
		await expect(page.getByText("O2 100%")).toBeVisible();
		await expect(page.getByTestId("objective-checkbox")).toHaveText("☑");
		await expect(page.getByTestId("objective-progress")).toHaveText("1/6");
		// 終端機內嵌的 NOVA 過關台詞
		await expect(page.getByText("第六個").first()).toBeVisible();
		// 底部已學列更新
		await expect(page.getByText("已學：")).toContainText("pwd");

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("terminal-modal")).toBeHidden();
		// 關閉後地圖上的 NOVA 對話框再說一次最後一句
		await expect(page.getByRole("status").filter({ hasText: "NOVA" }).first()).toBeVisible();
	});

	test("Esc 關閉終端機後可以繼續走動並再開一次", async ({ page }) => {
		await openCryoTerminal(page);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("terminal-modal")).toBeHidden();
		await expect(page.getByTestId("interact-hint")).toBeVisible();
		await page.keyboard.press("e");
		await expect(page.getByTestId("terminal-modal")).toBeVisible();
	});

	test("關閉終端機的那一下 Esc 不會順便打開暫停選單", async ({ page }) => {
		await openCryoTerminal(page);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("terminal-modal")).toBeHidden();
		// 暫停選單的 Esc 監聽在終端機關閉後才掛回 window，同一個 keydown 不該被它接走
		await page.waitForTimeout(300);
		await expect(page.getByTestId("pause-menu")).toHaveCount(0);
	});

	test("暫停選單開著時按 E 不會把終端機開在選單底下", async ({ page }) => {
		await openCryoTerminal(page);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("terminal-modal")).toBeHidden();
		await page.waitForTimeout(300);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-menu")).toBeVisible();
		await page.keyboard.press("e");
		await page.waitForTimeout(500);
		await expect(page.getByTestId("terminal-modal")).toHaveCount(0);
		// Esc 等同「繼續」，回到地圖後 E 才有效
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-menu")).toHaveCount(0);
		await page.keyboard.press("e");
		await expect(page.getByTestId("terminal-modal")).toBeVisible();
	});

	test("回標題再繼續（Phaser 遊戲重建）後送指令不會因舊場景殘留的音效訂閱而炸", async ({ page }) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));

		// 先過一關讓存檔有 savedAt，回標題才看得到「繼續」
		await openCryoTerminal(page);
		const input = page.getByLabel("指令輸入");
		await input.fill("cat wake_up.txt");
		await input.press("Enter");
		await expect(page.getByTestId("objective-checkbox")).toHaveText("☑");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("terminal-modal")).toBeHidden();

		// 暫停選單 → 回標題：PlayScreen 卸載、舊的 Phaser 遊戲 destroy；再按「繼續」建新遊戲
		await page.waitForTimeout(300);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-menu")).toBeVisible();
		await page.getByRole("dialog", { name: "暫停選單" }).getByText("回標題").click();
		// client-side 導頁後 Next 的路由播報器也會念「KEPLER-9」，用 heading 角色避免撞到
		await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
		await page.getByRole("button", { name: "繼續" }).click();

		// 存檔 v2 會還原角色位置：剛才停在 T1 旁，重建後不用走就看得到提示
		await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 15000 });
		await expect(page.getByTestId("interact-hint")).toBeVisible();

		// 送指令會發 sfx:play（按鍵聲），舊場景若沒清乾淨會在這裡炸 Cannot set properties of null (setting 'seek')
		await openCryoTerminal(page);
		const inputAfter = page.getByLabel("指令輸入");
		await inputAfter.fill("ls");
		await inputAfter.press("Enter");
		await expect(page.getByText("wake_up.txt", { exact: true })).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test("重新整理後輸出紀錄、工作目錄與歷史都還在", async ({ page }) => {
		await openCryoTerminal(page);
		const input = page.getByLabel("指令輸入");
		await input.fill("cd pod_06");
		await input.press("Enter");
		await input.fill("ls");
		await input.press("Enter");
		await expect(page.getByText("status.txt", { exact: true })).toBeVisible();

		await page.reload();
		await openCryoTerminal(page);

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
