// @vitest-environment node
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
	it("列標題頁與練習模式；/play 沒有存檔、/argo 沒通關都進不去，不給搜尋引擎收錄", () => {
		const urls = sitemap().map((entry) => entry.url);
		expect(urls).toHaveLength(2);
		expect(urls.some((url) => url.endsWith("/sandbox"))).toBe(true);
		expect(urls.some((url) => url.endsWith("/play"))).toBe(false);
		expect(urls.some((url) => url.endsWith("/argo"))).toBe(false);
	});
});
