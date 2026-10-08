// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizeAssetFailure } from "./assetCheck";

const CRITICAL_ALL_LOADED = [
	{ url: "/tiles/tileset-buch-scifi.png", loaded: true },
	{ url: "/maps/deck1.json", loaded: true },
	{ url: "/sprites/technician-a.png", loaded: true },
];

describe("summarizeAssetFailure", () => {
	it("全部載到、沒有 loaderror 時回傳 null", () => {
		expect(summarizeAssetFailure([], CRITICAL_ALL_LOADED)).toBeNull();
	});

	it("只有音效載不到：列出檔案，但不是致命錯誤（AudioManager 會略過那個音效）", () => {
		expect(summarizeAssetFailure([{ url: "/audio/door.ogg" }], CRITICAL_ALL_LOADED)).toEqual({
			files: ["/audio/door.ogg"],
			fatal: false,
		});
	});

	it("地圖不在 cache 裡就是致命錯誤，即使 loader 沒發 loaderror（例如 JSON 解析失敗）", () => {
		const critical = CRITICAL_ALL_LOADED.map((asset) => ({
			...asset,
			loaded: asset.url !== "/maps/deck1.json",
		}));

		expect(summarizeAssetFailure([], critical)).toEqual({ files: ["/maps/deck1.json"], fatal: true });
	});

	it("loaderror 與 cache 檢查抓到同一個檔案只列一次，音效與地圖一起壞時仍是致命錯誤", () => {
		const critical = CRITICAL_ALL_LOADED.map((asset) => ({
			...asset,
			loaded: asset.url !== "/sprites/technician-a.png",
		}));

		expect(
			summarizeAssetFailure([{ url: "/sprites/technician-a.png" }, { url: "/audio/key.ogg" }], critical),
		).toEqual({ files: ["/sprites/technician-a.png", "/audio/key.ogg"], fatal: true });
	});
});
