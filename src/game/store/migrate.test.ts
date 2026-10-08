// @vitest-environment node
import { describe, expect, it } from "vitest";
import { migrateSaveData } from "./migrate";

const V1_PROGRESS = {
	chapter: 3,
	character: "d",
	solvedTerminals: ["ch1-t1", "ch3-t2"],
	learnedCommands: ["pwd"],
	oxygen: 77,
	savedAt: "2031-03-12T08:15:00.000Z",
};

const SETTINGS = {
	textSpeed: "fast",
	flickerEnabled: true,
	scanlinesEnabled: true,
	vignetteEnabled: true,
	volume: 0.8,
	muted: false,
};

describe("migrateSaveData", () => {
	it("v1 一路升到 v3：最遠章節等於目前章節、沒有位置、沒通關、統計是空的", () => {
		const migrated = migrateSaveData(
			{ progress: V1_PROGRESS, settings: SETTINGS, terminals: {}, storyFlags: { "ch2.outroShown": true } },
			1,
		);

		expect(migrated.progress).toEqual({ ...V1_PROGRESS, furthestChapter: 3, position: null, clearedAt: null });
		expect(migrated.stats).toEqual({});
		expect(migrated.storyFlags).toEqual({ "ch2.outroShown": true });
	});

	it("v2 → v3：補 clearedAt 與 stats，終端機紀錄原樣保留（沒有雜湊，開啟時再判斷）", () => {
		const terminals = { "ch3-t1": { shell: { cwd: "/home/tech" }, transcript: [], errorCount: 2 } };
		const migrated = migrateSaveData(
			{
				progress: { ...V1_PROGRESS, furthestChapter: 4, position: null },
				settings: SETTINGS,
				terminals,
				storyFlags: {},
			},
			2,
		);

		expect(migrated.progress.clearedAt).toBeNull();
		expect(migrated.progress.furthestChapter).toBe(4);
		expect(migrated.stats).toEqual({});
		expect(migrated.terminals).toEqual(terminals);
	});

	it("v2 存檔已經看完片尾（最後一章的 outroShown 旗標）：升級後算已通關，通關時間用最後存檔時間", () => {
		const migrated = migrateSaveData(
			{
				progress: { ...V1_PROGRESS, chapter: 6, furthestChapter: 6, position: null },
				settings: SETTINGS,
				terminals: {},
				storyFlags: { "ch6.outroShown": true },
			},
			2,
		);

		expect(migrated.progress.clearedAt).toBe("2031-03-12T08:15:00.000Z");
	});

	it("v2 存檔裡已經有 stats 欄位（例如手改過）時不蓋掉", () => {
		const stats = { "1": { playTimeMs: 1000, errors: 1, hints: 0 } };
		const migrated = migrateSaveData(
			{ progress: { ...V1_PROGRESS, furthestChapter: 3, position: null }, settings: SETTINGS, terminals: {}, storyFlags: {}, stats },
			2,
		);

		expect(migrated.stats).toEqual(stats);
	});

	it("不是物件的存檔原樣回傳，交給 merge 用預設值", () => {
		expect(migrateSaveData(null, 1)).toBeNull();
		expect(migrateSaveData("壞掉", 2)).toBe("壞掉");
	});
});
