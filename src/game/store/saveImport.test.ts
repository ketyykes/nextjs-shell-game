// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { parseSaveImport } from "./saveImport";
import { DEFAULT_PROGRESS, DEFAULT_SETTINGS, SAVE_VERSION } from "./types";
import type { SaveData, TerminalSessionRecord } from "./types";

function createRecord(): TerminalSessionRecord {
	const shell = new Shell({
		fs: VirtualFileSystem.fromSnapshot({ home: { tech: { "note.txt": "hello\n" } } }),
		terminalId: "ch3-t1",
		hints: ["一"],
		learnedCommands: ["ls"],
	});
	shell.execute("ls");
	return { shell: shell.toState(), transcript: [{ kind: "system", id: "banner-ch3-t1", lines: ["歡迎"] }], errorCount: 1 };
}

function createSave(): SaveData {
	return {
		progress: {
			...DEFAULT_PROGRESS,
			chapter: 3,
			furthestChapter: 3,
			character: "c",
			solvedTerminals: ["ch1-t1"],
			learnedCommands: ["pwd"],
			savedAt: "2031-03-12T08:15:00.000Z",
		},
		settings: { ...DEFAULT_SETTINGS, textSpeed: "fast" },
		terminals: { "ch3-t1": createRecord() },
		storyFlags: { "ch1.outroShown": true },
		stats: { "3": { playTimeMs: 1000, errors: 2, hints: 0 } },
	};
}

/** JSON 化後拿來改壞的存檔，欄位型別故意放寬。 */
interface MutableSave {
	progress?: Record<string, unknown>;
	settings?: unknown;
	terminals: Record<string, { shell: { fs: { root?: unknown } } }>;
	storyFlags: Record<string, unknown>;
	stats: Record<string, Record<string, unknown>>;
}

/** 跟遊戲匯出的檔案同格式：persist 的 `{ state, version }`。 */
function exported(state: unknown, version: number = SAVE_VERSION): string {
	return JSON.stringify({ state, version });
}

describe("parseSaveImport", () => {
	it("目前版本的存檔：通過檢查，回傳要寫進 localStorage 的字串與摘要", () => {
		const save = createSave();
		const result = parseSaveImport(exported(save));

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.data).toEqual(save);
		expect(JSON.parse(result.json)).toEqual({ state: save, version: SAVE_VERSION });
		expect(result.summary).toEqual({ chapter: 3, cleared: false });
	});

	it("舊版（v1）存檔先走 migrate 升到目前版本再檢查", () => {
		const v1 = {
			progress: {
				chapter: 2,
				character: "a",
				solvedTerminals: [],
				learnedCommands: [],
				oxygen: 100,
				savedAt: "2031-03-12T08:15:00.000Z",
			},
			settings: DEFAULT_SETTINGS,
			terminals: {},
			storyFlags: {},
		};

		const result = parseSaveImport(exported(v1, 1));

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.data.progress).toMatchObject({ chapter: 2, furthestChapter: 2, position: null, clearedAt: null });
		expect(result.data.stats).toEqual({});
		expect(JSON.parse(result.json).version).toBe(SAVE_VERSION);
	});

	it("已通關的存檔摘要標記 cleared", () => {
		const save = createSave();
		save.progress.clearedAt = "2031-04-01T00:00:00.000Z";

		const result = parseSaveImport(exported(save));

		expect(result.ok && result.summary.cleared).toBe(true);
	});

	it("不是 JSON：拒絕並說明", () => {
		const result = parseSaveImport("{這不是 JSON");

		expect(result).toEqual({ ok: false, reason: "invalid-json", message: expect.stringContaining("JSON") });
	});

	it.each([
		["JSON 但不是物件", "[1, 2, 3]"],
		["沒有 version", JSON.stringify({ state: createSave() })],
		["沒有 state", JSON.stringify({ version: SAVE_VERSION })],
		["version 不是正整數", exported(createSave(), 0)],
		["version 是小數", exported(createSave(), 2.5)],
	])("%s：不是這個遊戲的存檔", (_label, text) => {
		const result = parseSaveImport(text);

		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("not-a-save");
		expect(!result.ok && result.message).toContain("KEPLER-9");
	});

	it("版本比程式新：拒絕，訊息帶兩邊的版本號", () => {
		const result = parseSaveImport(exported(createSave(), SAVE_VERSION + 1));

		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("newer-version");
		expect(!result.ok && result.message).toContain(`v${SAVE_VERSION + 1}`);
		expect(!result.ok && result.message).toContain(`v${SAVE_VERSION}`);
	});

	it.each([
		["章節不是正整數", (save: MutableSave) => (save.progress!.chapter = "三")],
		["已過關清單不是字串陣列", (save: MutableSave) => (save.progress!.solvedTerminals = [1, 2])],
		["外觀不認得", (save: MutableSave) => (save.progress!.character = "z")],
		["終端機的檔案系統缺 root", (save: MutableSave) => delete save.terminals["ch3-t1"].shell.fs.root],
		["旗標不是 true", (save: MutableSave) => (save.storyFlags["ch1.outroShown"] = "yes")],
		["統計次數是負數", (save: MutableSave) => (save.stats["3"].errors = -1)],
		["沒有 progress", (save: MutableSave) => delete save.progress],
	])("%s：內容壞掉，拒絕", (_label, mutate) => {
		const save = JSON.parse(JSON.stringify(createSave())) as MutableSave;
		mutate(save);

		const result = parseSaveImport(exported(save));

		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("invalid-content");
	});

	it("設定缺欄位不算壞：讀檔時會用預設值補", () => {
		const save = JSON.parse(JSON.stringify(createSave())) as MutableSave;
		save.settings = { textSpeed: "slow" };

		expect(parseSaveImport(exported(save)).ok).toBe(true);
	});
});
