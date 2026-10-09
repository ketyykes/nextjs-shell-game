// @vitest-environment node
import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
	it("全站開放索引，並告訴搜尋引擎 sitemap 的位置", () => {
		const result = robots();
		expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
		expect(result.sitemap).toMatch(/^https?:\/\/[^/]+\/sitemap\.xml$/);
	});
});
