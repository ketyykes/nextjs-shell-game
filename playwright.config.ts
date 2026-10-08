import { defineConfig, devices } from "@playwright/test";

/** 本機 3000 被別的專案佔住時，用 `PORT=3001 pnpm test:e2e` 指到另一個埠；`next dev` 也吃同一個 PORT 變數。 */
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	// CI 上若殘留 test.only 就讓建置失敗
	forbidOnly: !!process.env.CI,
	// Playwright 層的重試：失敗後重跑過關的測試會在報告裡標成 flaky（不是測試裡自己寫重試迴圈，不會把 bug 蓋掉）
	retries: process.env.CI ? 2 : 1,
	// 走路已改成讀座標的閉環（M11-6），掉幀只會走得慢、不會走偏，六個 worker 在 load 48 下也全綠；
	// 但機器忙時整章測試會從一分鐘拉長到兩分鐘，逼近 180 秒的逾時，所以本機折衷開四個
	workers: process.env.CI ? 1 : 4,
	// list 在終端機直接列出 flaky 的測試與總數；html 報告不自動開瀏覽器（失敗時用 pnpm exec playwright show-report 看）
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	// 測試前自動啟動 Next.js 開發伺服器，本機已有伺服器時直接沿用
	webServer: {
		command: "pnpm dev",
		url: baseURL,
		reuseExistingServer: !process.env.CI,
	},
});
