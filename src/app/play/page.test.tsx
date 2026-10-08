import { describe, expect, it } from "vitest";
import { metadata } from "./page";

describe("/play 的 metadata", () => {
	it("帶 robots noindex：沒有存檔會被導回標題，不該被搜尋引擎收錄", () => {
		expect(metadata.robots).toEqual({ index: false });
	});
});
