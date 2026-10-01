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
	workers: process.env.CI ? 1 : undefined,
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
