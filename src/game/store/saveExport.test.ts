// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSaveExportText, saveExportFileName, toSaveData } from "./saveExport";
import { parseSaveImport } from "./saveImport";
import { DEFAULT_PROGRESS, DEFAULT_SETTINGS, SAVE_VERSION } from "./types";
import type { SaveData } from "./types";

const SAVE: SaveData = {
	progress: { ...DEFAULT_PROGRESS, chapter: 2, furthestChapter: 2, character: "e", savedAt: "2031-03-12T08:15:00.000Z" },
	settings: DEFAULT_SETTINGS,
	terminals: {},
	storyFlags: { "ch1.outroShown": true },
	stats: { "1": { playTimeMs: 90_000, errors: 5, hints: 3 } },
};

describe("toSaveData", () => {
	it("只留五個資料欄位，丟掉 action 之類的其他東西", () => {
		const withExtras = { ...SAVE, loseOxygen: () => {}, extra: 1 };

		expect(toSaveData(withExtras)).toEqual(SAVE);
		expect(Object.keys(toSaveData(withExtras)).sort()).toEqual(["progress", "settings", "stats", "storyFlags", "terminals"]);
	});
});

describe("createSaveExportText", () => {
	it("格式跟 localStorage 的存檔一樣（{ state, version }），匯入檢查認得", () => {
		const text = createSaveExportText(SAVE);

		expect(JSON.parse(text)).toEqual({ state: SAVE, version: SAVE_VERSION });
		const imported = parseSaveImport(text);
		expect(imported.ok && imported.data).toEqual(SAVE);
	});
});

describe("saveExportFileName", () => {
	it("用當地時間組檔名：kepler9-save-年月日-時分.json", () => {
		expect(saveExportFileName(new Date(2031, 2, 5, 8, 7))).toBe("kepler9-save-20310305-0807.json");
	});
});
