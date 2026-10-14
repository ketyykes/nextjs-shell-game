import { expect, test } from "@playwright/test";
import { enterPlay, seedSave } from "./helpers/deck";

/**
 * 除役倒數（設計文件 4.13）：HUD 左上 O2 下面的倒數，遊玩時往下跳；標籤照章節與過關紀錄換，重新整理後一樣。
 * 版面不重疊的檢查併在 save-v2.spec.ts 的三種視窗排版測試裡。
 */

/** 「T-81d 20:24:57」轉成剩餘秒數，方便比大小。 */
function toSeconds(text: string): number {
	const match = /^T-(\d+)d (\d{2}):(\d{2}):(\d{2})$/.exec(text);
	if (match === null) {
		throw new Error(`倒數格式不對：${text}`);
	}
	const [, days, hours, minutes, seconds] = match.map(Number);
	return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

test("第一章 O2 下面是中性的站務排程倒數，從完整的 81 天 20 小時多開始，玩的時候往下跳", async ({ page }) => {
	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await enterPlay(page);

	const countdown = page.getByTestId("hud-countdown");
	await expect(countdown).toBeVisible();
	await expect(page.getByTestId("countdown-label")).toHaveText("站務排程");
	await expect(countdown).not.toContainText("除役");

	const value = page.getByTestId("countdown-value");
	const first = toSeconds((await value.textContent()) ?? "");
	// 新存檔還沒有遊玩統計，最多只過了進地圖這幾秒
	expect(first).toBeLessThanOrEqual(toSeconds("T-81d 20:25:00"));
	expect(first).toBeGreaterThan(toSeconds("T-81d 20:24:00"));
	await expect.poll(async () => toSeconds((await value.textContent()) ?? ""), { timeout: 5000 }).toBeLessThan(first);
});

test("第五章 T1 過關後標籤是遠端除役，重新整理後維持", async ({ page }) => {
	await seedSave(page, { chapter: 5, solvedTerminals: ["ch5-t1"], flags: ["ch5.introShown"] });
	await enterPlay(page);
	await expect(page.getByTestId("countdown-label")).toHaveText("遠端除役");

	await page.reload();
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await expect(page.getByTestId("countdown-label")).toHaveText("遠端除役");
});

test("第五章 T1 還沒過關時仍是站務排程", async ({ page }) => {
	await seedSave(page, { chapter: 5, flags: ["ch5.introShown"] });
	await enterPlay(page);
	await expect(page.getByTestId("countdown-label")).toHaveText("站務排程");
});

test("第六章 T4 終止 NOVA 之後標籤多一句目標無回應，倒數照走", async ({ page }) => {
	await seedSave(page, {
		chapter: 6,
		solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3", "ch6-t4"],
		flags: ["ch6.introShown"],
	});
	await enterPlay(page);
	await expect(page.getByTestId("countdown-label")).toHaveText("遠端除役 · 目標無回應");

	const value = page.getByTestId("countdown-value");
	const first = toSeconds((await value.textContent()) ?? "");
	await expect.poll(async () => toSeconds((await value.textContent()) ?? ""), { timeout: 5000 }).toBeLessThan(first);
});
