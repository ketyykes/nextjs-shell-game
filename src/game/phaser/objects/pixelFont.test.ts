// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PIXEL_FONT_SIZE, pixelFontFamily } from "./pixelFont";

describe("pixelFontFamily（地圖上「按 E」的字型）", () => {
	it("用 next/font 掛在 html 上的 Fusion Pixel 變數，後面接 monospace 備援", () => {
		const read = (name: string) => (name === "--font-fusion-pixel" ? " '__fusionPixel_ab12', '__fusionPixel_Fallback_ab12'" : "");
		expect(pixelFontFamily(read)).toBe("'__fusionPixel_ab12', '__fusionPixel_Fallback_ab12', monospace");
	});

	it("讀不到變數（例如測試環境或字型還沒掛上）時退回 monospace", () => {
		expect(pixelFontFamily(() => "")).toBe("monospace");
	});

	it("字級是 12 的整數倍，Fusion Pixel 才清楚", () => {
		expect(PIXEL_FONT_SIZE % 12).toBe(0);
	});
});
