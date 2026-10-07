import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			// 對應 tsconfig 的 @/* → ./src/*
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	css: {
		// 以內嵌空設定略過 postcss.config.mjs：Next 用字串形式宣告插件，Vite 無法解析；
		// 單元測試不需要 Tailwind 轉換，CSS Module 只要能被 import 即可
		postcss: { plugins: [] },
	},
	test: {
		environment: "jsdom",
		// 只掃 src 底下的單元測試，避免撿到 e2e/ 的 Playwright 測試
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		// jsdom 每檔重建一次佔掉一半時間；vmThreads 讓同一個 worker 重用環境，又保住每檔隔離
		pool: "vmThreads",
	},
});
