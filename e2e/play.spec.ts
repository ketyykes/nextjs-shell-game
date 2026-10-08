import { expect, test, type Page } from "@playwright/test";
import { seedSave, walkToTerminal } from "./helpers/deck";

/**
 * M2 完成定義：瀏覽器可玩 M1 的指令，重新整理後歷史與進度還在。
 * M3 完成定義：/play 能走動與碰撞，六台終端機位置正確（這裡驗證走到 T1 並按 E 開得起來）。
 */

/**
 * 走到 T1 冷凍艙控制台並按 E 開啟終端機。出生點在冷凍艙中央，T1 在房間左上方。
 * 存檔 v2 起會還原角色位置，走路工具是讀座標的閉環，從哪裡出發都走得到。
 */
async function openCryoTerminal(page: Page): Promise<void> {
	// 等 Phaser 畫布出現，而且 Station 場景已建立（Preloader 還在載資源時按鍵會被吃掉）
	await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 15000 });
	await page.locator("canvas").click();
	// 場景剛就緒的第一幀鍵盤可能還沒接上，稍等再按
	await page.waitForTimeout(300);

	// 閉環走路：存檔 v2 會還原位置，已經站在終端機旁（例如 reload 後）就不會動
	await walkToTerminal(page, 0, "冷凍艙控制台");

	await page.keyboard.press("e");
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	// 開啟終端機的那一下 e 不可以漏進輸入框變成預填字
	await expect(page.getByLabel("指令輸入")).toHaveValue("");
}

/** 扣氧回饋出現當下的樣子：浮字文字、數字是否琥珀、浮字的 display。 */
interface OxygenLossRecord {
	text: string;
	amber: boolean;
	display: string;
}

/**
 * 在頁面上掛 MutationObserver，記錄扣氧回饋（M10-9）出現過的樣子。
 * 回饋只維持 0.9 秒，機器忙的時候輪詢斷言可能整段錯過，所以改成在頁面裡當場記下來再比對。
 */
async function watchOxygenLoss(page: Page): Promise<void> {
	await page.evaluate(() => {
		const records: Array<{ text: string; amber: boolean; display: string }> = [];
		Object.assign(window, { __oxygenLossRecords: records });
		const observer = new MutationObserver(() => {
			const loss = document.querySelector<HTMLElement>('[data-testid="hud-oxygen-loss"]');
			const value = document.querySelector<HTMLElement>('[data-testid="hud-oxygen-value"]');
			if (loss === null || value === null) {
				return;
			}
			records.push({
				text: loss.textContent ?? "",
				amber: value.className.includes("text-game-amber"),
				display: getComputedStyle(loss).display,
			});
		});
		observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
	});
}

async function oxygenLossSeen(page: Page): Promise<OxygenLossRecord[]> {
	return page.evaluate(
		() => (window as unknown as { __oxygenLossRecords?: OxygenLossRecord[] }).__oxygenLossRecords ?? [],
	);
}

test("沒有存檔直接開 /play（例如別人分享的網址）會導回標題，不掛 Phaser", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => window.localStorage.clear());
	await page.goto("/play");
	await expect(page).toHaveURL(/:\d+\/$/);
	await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
	await expect(page.locator("canvas")).toHaveCount(0);
});

test.describe("/play 地圖與終端機", () => {
	test.beforeEach(async ({ page }) => {
		// 每個測試從「剛選完角、第一章開頭」的乾淨存檔開始；沒有存檔的 /play 會被導回標題（G5）
		await seedSave(page, { chapter: 1 });
		await page.goto("/play");
	});

	test("/play 帶 robots noindex，不給搜尋引擎收錄", async ({ page }) => {
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
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
		await watchOxygenLoss(page);
		const input = page.getByLabel("指令輸入");
		await input.fill("catwake_up.txt");
		await input.press("Enter");
		await expect(page.getByText("你是不是想打")).toBeVisible();
		await expect(page.getByText("O2 99%")).toBeVisible();
		// 扣氧當下數字閃琥珀並浮出 -1（M10-9）
		await expect
			.poll(async () =>
				(await oxygenLossSeen(page)).some(
					(record) => record.text === "-1" && record.amber && record.display !== "none",
				),
			)
			.toBe(true);
		// 閃完回到青綠，浮字消失
		await expect(page.getByTestId("hud-oxygen-loss")).toHaveCount(0);
		await expect(page.getByTestId("hud-oxygen-value")).toHaveClass(/text-game-success/);
	});

	test("減少動態效果時扣氧只變色，不浮出 -1", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openCryoTerminal(page);
		await watchOxygenLoss(page);
		const input = page.getByLabel("指令輸入");
		await input.fill("cat nope");
		await input.press("Enter");
		await expect(page.getByText("O2 99%")).toBeVisible();
		await expect.poll(async () => (await oxygenLossSeen(page)).length).toBeGreaterThan(0);
		const records = await oxygenLossSeen(page);
		expect(records.every((record) => record.amber && record.display === "none")).toBe(true);
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
		// T1 過關前地圖上方常駐操作提示（M10-3）
		await expect(page.getByTestId("controls-hint")).toHaveText("方向鍵移動 · E 互動 · Esc 選單");
		await openCryoTerminal(page);
		// 終端機開著時方向鍵與 Esc 是終端機的操作，提示先收起來
		await expect(page.getByTestId("controls-hint")).toHaveCount(0);
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
		// 終端機內先出現青綠的「目標達成」系統行，標題列標已完成（M10-1）
		await expect(page.getByText("☑ 目標達成：讀取冷凍艙的喚醒排程")).toBeVisible();
		await expect(page.getByTestId("terminal-solved-badge")).toHaveText("☑ 已完成");
		// 終端機內嵌的 NOVA 過關台詞
		await expect(page.getByText("第六個").first()).toBeVisible();
		// 底部已學列更新
		await expect(page.getByText("已學：")).toContainText("pwd");

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("terminal-modal")).toBeHidden();
		// 關閉後地圖上的 NOVA 對話框再說一次最後一句
		await expect(page.getByRole("status").filter({ hasText: "NOVA" }).first()).toBeVisible();
		// T1 過關後操作提示不再出現
		await expect(page.getByTestId("controls-hint")).toHaveCount(0);
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

		// 先過一關（存檔有過關紀錄與位置），再回標題按「繼續」
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
