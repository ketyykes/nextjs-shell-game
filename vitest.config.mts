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
	test: {
		environment: "jsdom",
		// 只掃 src 底下的單元測試，避免撿到 e2e/ 的 Playwright 測試
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
	},
});
