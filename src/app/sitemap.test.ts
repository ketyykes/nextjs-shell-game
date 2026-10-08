// @vitest-environment node
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
	it("只列標題頁；/play 沒有存檔進不去，不給搜尋引擎收錄", () => {
		const urls = sitemap().map((entry) => entry.url);
		expect(urls).toHaveLength(1);
		expect(urls.some((url) => url.endsWith("/play"))).toBe(false);
	});
});
