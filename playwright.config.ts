import { defineConfig, devices } from "@playwright/test";

/** 本機 3000 被別的專案佔住時，用 `PORT=3001 pnpm test:e2e` 指到另一個埠；`next dev` 也吃同一個 PORT 變數。 */
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	// CI 上若殘留 test.only 就讓建置失敗
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// 整章走完的測試對時間很敏感，六個 worker 同時跑會讓瀏覽器掉幀、貼牆滑行錯過門口，所以本機也只開兩個
	workers: process.env.CI ? 1 : 2,
	reporter: "html",
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
