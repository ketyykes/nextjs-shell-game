import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { FsSnapshot } from "@/game/shell/types";
import { createInitialSaveData, useGameStore } from "./gameStore";
import { getSaveIssue, setSaveIssue } from "./saveStatus";
import { selectHasSave, selectIsOxygenLow, selectTerminal } from "./selectors";
import {
	DEFAULT_PROGRESS,
	DEFAULT_SETTINGS,
	OXYGEN_MAX,
	OXYGEN_MIN,
	SAVE_STORAGE_KEY,
	SAVE_VERSION,
	TRANSCRIPT_LIMIT,
} from "./types";
import type { OutputEntry, SaveData, TerminalSessionRecord } from "./types";

const TEST_SNAPSHOT: FsSnapshot = {
	home: {
		tech: {
			"wake_up.txt": "喚醒排程：三年後\n",
			logs: { "day_001.txt": "第一天\n" },
		},
	},
};

/** 建一個真的 Shell，執行幾個指令讓 cwd 與歷史有變化。 */
function createPlayedShell(): Shell {
	const shell = new Shell({
		fs: VirtualFileSystem.fromSnapshot(TEST_SNAPSHOT),
		terminalId: "ch1-t1",
		hints: ["先搞清楚你在哪個目錄。", "試試 pwd。", "輸入 pwd。"],
		learnedCommands: ["pwd", "ls", "cd", "cat"],
	});
	shell.execute("ls");
	shell.execute("cd logs");
	return shell;
}

function createSystemEntry(index: number): OutputEntry {
	return { kind: "system", id: `entry-${index}`, lines: [`第 ${index} 行`] };
}

function createRecord(transcript: OutputEntry[] = []): TerminalSessionRecord {
	return { shell: createPlayedShell().toState(), transcript };
}

/** 讀出 localStorage 裡的存檔 JSON。 */
function readStoredSave(): { state: Record<string, unknown>; version: number } {
	const raw = localStorage.getItem(SAVE_STORAGE_KEY);
	expect(raw).not.toBeNull();
	return JSON.parse(raw as string);
}

beforeEach(() => {
	// setState 也會寫入 localStorage，所以先重置再清空
	useGameStore.setState(createInitialSaveData());
	localStorage.clear();
	setSaveIssue(null);
});

/** 讓 localStorage 的寫入一律丟 QuotaExceededError，回傳 spy 方便之後還原。 */
function failAllWrites() {
	return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new DOMException("儲存空間已滿", "QuotaExceededError");
	});
}

describe("初始狀態", () => {
	it("預設值等於 DEFAULT_PROGRESS 與 DEFAULT_SETTINGS，終端機與旗標是空物件", () => {
		const state = useGameStore.getState();
		expect(state.progress).toEqual(DEFAULT_PROGRESS);
		expect(state.settings).toEqual(DEFAULT_SETTINGS);
		expect(state.terminals).toEqual({});
		expect(state.storyFlags).toEqual({});
	});

	it("初始資料的陣列不和 DEFAULT_PROGRESS 共用參考", () => {
		const data = createInitialSaveData();
		expect(data.progress.learnedCommands).not.toBe(DEFAULT_PROGRESS.learnedCommands);
		expect(data.progress.solvedTerminals).not.toBe(DEFAULT_PROGRESS.solvedTerminals);
	});
});

describe("設定", () => {
	it("updateSettings 只改傳入的欄位", () => {
		useGameStore.getState().updateSettings({ flickerEnabled: false, textSpeed: "fast" });
		expect(useGameStore.getState().settings).toEqual({
			...DEFAULT_SETTINGS,
			flickerEnabled: false,
			textSpeed: "fast",
		});
	});
});

describe("進度", () => {
	it("setCharacter 設定外觀", () => {
		useGameStore.getState().setCharacter("d");
		expect(useGameStore.getState().progress.character).toBe("d");
	});

	it("learnCommand 重複學同一個指令不會重複加入", () => {
		const { learnCommand } = useGameStore.getState();
		learnCommand("pwd");
		learnCommand("ls");
		learnCommand("pwd");
		expect(useGameStore.getState().progress.learnedCommands).toEqual(["pwd", "ls"]);
	});

	it("markTerminalSolved 重複標記不會重複加入", () => {
		const { markTerminalSolved } = useGameStore.getState();
		markTerminalSolved("ch1-t1");
		markTerminalSolved("ch1-t1");
		expect(useGameStore.getState().progress.solvedTerminals).toEqual(["ch1-t1"]);
	});

	it("loseOxygen 每次扣 1", () => {
		useGameStore.getState().loseOxygen();
		expect(useGameStore.getState().progress.oxygen).toBe(OXYGEN_MAX - 1);
	});

	it("loseOxygen 連扣 100 次停在下限", () => {
		const { loseOxygen } = useGameStore.getState();
		for (let index = 0; index < 100; index += 1) {
			loseOxygen();
		}
		expect(useGameStore.getState().progress.oxygen).toBe(OXYGEN_MIN);
		expect(OXYGEN_MIN).toBe(5);
	});

	it("restoreOxygen 回到 100", () => {
		const { loseOxygen, restoreOxygen } = useGameStore.getState();
		loseOxygen();
		loseOxygen();
		restoreOxygen();
		expect(useGameStore.getState().progress.oxygen).toBe(OXYGEN_MAX);
	});

	it("touchSave 寫入 ISO 8601 時間", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2031-03-12T08:15:00.000Z"));
		try {
			useGameStore.getState().touchSave();
			expect(useGameStore.getState().progress.savedAt).toBe("2031-03-12T08:15:00.000Z");
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("終端機 session", () => {
	it("saveTerminalSession 存入真的 Shell 狀態，讀出後能還原 Shell", () => {
		const shell = createPlayedShell();
		const record: TerminalSessionRecord = { shell: shell.toState(), transcript: [createSystemEntry(1)] };

		useGameStore.getState().saveTerminalSession("ch1-t1", record);

		const saved = selectTerminal("ch1-t1")(useGameStore.getState());
		expect(saved).toEqual(record);
		expect(saved?.shell.cwd).toBe("/home/tech/logs");
		expect(saved?.shell.history).toEqual(["ls", "cd logs"]);

		const restored = Shell.fromState(
			saved!.shell,
			VirtualFileSystem.fromSerialized(saved!.shell.fs),
			["提示一", "提示二", "提示三"],
		);
		expect(restored.cwd).toBe("/home/tech/logs");
		expect(restored.execute("cat day_001.txt").lines).toEqual(["第一天"]);
	});

	it("saveTerminalSession 整筆覆蓋舊紀錄", () => {
		const { saveTerminalSession } = useGameStore.getState();
		saveTerminalSession("ch1-t1", createRecord([createSystemEntry(1), createSystemEntry(2)]));
		const replacement = createRecord([createSystemEntry(9)]);
		saveTerminalSession("ch1-t1", replacement);
		expect(useGameStore.getState().terminals["ch1-t1"]).toEqual(replacement);
	});

	it("selectTerminal 沒有存過回傳 undefined", () => {
		expect(selectTerminal("ch1-t6")(useGameStore.getState())).toBeUndefined();
	});

	it("appendTranscript 只加輸出，不動 shell 狀態", () => {
		const record = createRecord([createSystemEntry(1)]);
		useGameStore.getState().saveTerminalSession("ch1-t1", record);
		useGameStore.getState().appendTranscript("ch1-t1", [createSystemEntry(2), createSystemEntry(3)]);

		const saved = useGameStore.getState().terminals["ch1-t1"];
		expect(saved.transcript.map((entry) => entry.id)).toEqual(["entry-1", "entry-2", "entry-3"]);
		expect(saved.shell).toBe(record.shell);
	});

	it("appendTranscript 超過上限時裁掉最舊的", () => {
		const initial = Array.from({ length: TRANSCRIPT_LIMIT - 1 }, (_, index) => createSystemEntry(index));
		useGameStore.getState().saveTerminalSession("ch1-t1", createRecord(initial));
		useGameStore
			.getState()
			.appendTranscript("ch1-t1", [createSystemEntry(1000), createSystemEntry(1001), createSystemEntry(1002)]);

		const transcript = useGameStore.getState().terminals["ch1-t1"].transcript;
		expect(transcript).toHaveLength(TRANSCRIPT_LIMIT);
		expect(transcript[0].id).toBe("entry-2");
		expect(transcript[TRANSCRIPT_LIMIT - 1].id).toBe("entry-1002");
	});

	it("appendTranscript 對沒有 session 的終端機不做事", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		useGameStore.getState().appendTranscript("ch1-t9", [createSystemEntry(1)]);
		expect(useGameStore.getState().terminals).toEqual({});
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("setTerminalErrorCount 對沒有 session 的終端機不做事", () => {
		useGameStore.getState().setTerminalErrorCount("ch1-t9", 3);
		expect(useGameStore.getState().terminals).toEqual({});
	});

	it("setTerminalErrorCount 只更新計數，不動 shell 與 transcript", () => {
		const record = createRecord([createSystemEntry(1)]);
		useGameStore.getState().saveTerminalSession("ch1-t1", record);
		useGameStore.getState().setTerminalErrorCount("ch1-t1", 3);

		const saved = useGameStore.getState().terminals["ch1-t1"];
		expect(saved.errorCount).toBe(3);
		expect(saved.shell).toBe(record.shell);
		expect(saved.transcript).toBe(record.transcript);

		useGameStore.getState().setTerminalErrorCount("ch1-t1", 0);
		expect(useGameStore.getState().terminals["ch1-t1"].errorCount).toBe(0);
	});

	it("setTerminalErrorCount 負數與小數會修成非負整數", () => {
		useGameStore.getState().saveTerminalSession("ch1-t1", createRecord());
		useGameStore.getState().setTerminalErrorCount("ch1-t1", -2);
		expect(useGameStore.getState().terminals["ch1-t1"].errorCount).toBe(0);
		useGameStore.getState().setTerminalErrorCount("ch1-t1", 4.7);
		expect(useGameStore.getState().terminals["ch1-t1"].errorCount).toBe(4);
	});

	it("saveTerminalSession 沒帶 errorCount 時保留原本的階梯計數，有帶就覆蓋", () => {
		const { saveTerminalSession, setTerminalErrorCount } = useGameStore.getState();
		saveTerminalSession("ch1-t1", createRecord());
		setTerminalErrorCount("ch1-t1", 5);

		saveTerminalSession("ch1-t1", createRecord([createSystemEntry(2)]));
		expect(useGameStore.getState().terminals["ch1-t1"].errorCount).toBe(5);

		saveTerminalSession("ch1-t1", { ...createRecord(), errorCount: 1 });
		expect(useGameStore.getState().terminals["ch1-t1"].errorCount).toBe(1);
	});

	it("errorCount 會存進 localStorage", () => {
		useGameStore.getState().saveTerminalSession("ch1-t1", createRecord());
		useGameStore.getState().setTerminalErrorCount("ch1-t1", 7);
		const stored = readStoredSave().state as { terminals: Record<string, TerminalSessionRecord> };
		expect(stored.terminals["ch1-t1"].errorCount).toBe(7);
	});

	it("clearTranscript 清空輸出但保留 shell 狀態", () => {
		const record = createRecord([createSystemEntry(1), createSystemEntry(2)]);
		useGameStore.getState().saveTerminalSession("ch1-t1", record);
		useGameStore.getState().clearTranscript("ch1-t1");

		const saved = useGameStore.getState().terminals["ch1-t1"];
		expect(saved.transcript).toEqual([]);
		expect(saved.shell).toBe(record.shell);
	});
});

describe("劇情旗標", () => {
	it("setFlag 寫入 true，clearFlag 刪掉 key", () => {
		const { setFlag, clearFlag } = useGameStore.getState();
		setFlag("ch1.sawShadow");
		setFlag("ch1.readDiary");
		expect(useGameStore.getState().storyFlags).toEqual({ "ch1.sawShadow": true, "ch1.readDiary": true });

		clearFlag("ch1.sawShadow");
		expect(useGameStore.getState().storyFlags).toEqual({ "ch1.readDiary": true });
		expect("ch1.sawShadow" in useGameStore.getState().storyFlags).toBe(false);
	});

	it("clearFlag 不存在的旗標不會出錯", () => {
		useGameStore.getState().clearFlag("ch1.nothing");
		expect(useGameStore.getState().storyFlags).toEqual({});
	});
});

describe("resetSave", () => {
	it("清掉進度、終端機與旗標，但保留改過的設定", () => {
		const state = useGameStore.getState();
		state.updateSettings({ flickerEnabled: false, volume: 0.3 });
		state.setCharacter("a");
		state.learnCommand("pwd");
		state.markTerminalSolved("ch1-t1");
		state.loseOxygen();
		state.touchSave();
		state.saveTerminalSession("ch1-t1", createRecord());
		state.setFlag("ch1.sawShadow");

		useGameStore.getState().resetSave();

		const after = useGameStore.getState();
		expect(after.progress).toEqual(DEFAULT_PROGRESS);
		expect(after.terminals).toEqual({});
		expect(after.storyFlags).toEqual({});
		expect(after.settings).toEqual({ ...DEFAULT_SETTINGS, flickerEnabled: false, volume: 0.3 });
	});
});

describe("章節", () => {
	it("advanceChapter 章節加一、氧氣回滿並蓋上 savedAt", () => {
		const state = useGameStore.getState();
		state.loseOxygen();
		state.advanceChapter();
		const after = useGameStore.getState().progress;
		expect(after.chapter).toBe(2);
		expect(after.oxygen).toBe(OXYGEN_MAX);
		expect(after.savedAt).not.toBeNull();
	});

	it("resetChapter 只清掉該章的終端機、過關紀錄與旗標，其他章與已學指令保留", () => {
		const state = useGameStore.getState();
		state.learnCommand("pwd");
		state.markTerminalSolved("ch1-t1");
		state.markTerminalSolved("ch2-t1");
		state.markTerminalSolved("ch2-t2");
		state.saveTerminalSession("ch1-t1", createRecord());
		state.saveTerminalSession("ch2-t1", createRecord());
		state.setFlag("ch1.outroShown");
		state.setFlag("ch2.introShown");
		state.setFlag("ch2.room.dc_entry.entered");
		state.loseOxygen();

		useGameStore.getState().resetChapter(2);

		const after = useGameStore.getState();
		expect(after.progress.solvedTerminals).toEqual(["ch1-t1"]);
		expect(after.progress.learnedCommands).toEqual(["pwd"]);
		expect(after.progress.oxygen).toBe(OXYGEN_MAX);
		expect(Object.keys(after.terminals)).toEqual(["ch1-t1"]);
		expect(after.storyFlags).toEqual({ "ch1.outroShown": true });
	});

	it("resetChapter 不會把 ch1 的前綴誤認成 ch10", () => {
		const state = useGameStore.getState();
		state.markTerminalSolved("ch1-t1");
		state.markTerminalSolved("ch10-t1");
		state.setFlag("ch1.outroShown");
		state.setFlag("ch10.outroShown");

		useGameStore.getState().resetChapter(1);

		const after = useGameStore.getState();
		expect(after.progress.solvedTerminals).toEqual(["ch10-t1"]);
		expect(after.storyFlags).toEqual({ "ch10.outroShown": true });
	});

	it("advanceChapter 會推進最遠章節並清掉角色位置", () => {
		const state = useGameStore.getState();
		state.savePlayerPosition({ chapter: 1, x: 100, y: 200, roomId: "cryo" });
		state.advanceChapter();
		const after = useGameStore.getState().progress;
		expect(after.furthestChapter).toBe(2);
		expect(after.position).toBeNull();
	});

	it("在較早的章節進下一章時，最遠章節不會倒退", () => {
		useGameStore.setState({ progress: { ...DEFAULT_PROGRESS, chapter: 2, furthestChapter: 5 } });
		useGameStore.getState().advanceChapter();
		const after = useGameStore.getState().progress;
		expect(after.chapter).toBe(3);
		expect(after.furthestChapter).toBe(5);
	});

	it("resetChapter 清掉同一章的角色位置，別章的位置保留", () => {
		const state = useGameStore.getState();
		state.savePlayerPosition({ chapter: 2, x: 100, y: 200, roomId: "dc_logs" });
		state.resetChapter(1);
		expect(useGameStore.getState().progress.position).toEqual({ chapter: 2, x: 100, y: 200, roomId: "dc_logs" });
		useGameStore.getState().resetChapter(2);
		expect(useGameStore.getState().progress.position).toBeNull();
	});

	it("selectChapter 跳到到過的章節：只重置該章，其他章的進度與最遠章節保留", () => {
		useGameStore.setState({
			progress: {
				...DEFAULT_PROGRESS,
				chapter: 4,
				furthestChapter: 4,
				solvedTerminals: ["ch2-t1", "ch3-t1", "ch4-t1"],
				position: { chapter: 4, x: 10, y: 20, roomId: "com_entry" },
			},
			storyFlags: { "ch2.outroShown": true, "ch3.outroShown": true },
		});

		const moved = useGameStore.getState().selectChapter(2);

		const after = useGameStore.getState();
		expect(moved).toBe(true);
		expect(after.progress.chapter).toBe(2);
		expect(after.progress.furthestChapter).toBe(4);
		expect(after.progress.solvedTerminals).toEqual(["ch3-t1", "ch4-t1"]);
		expect(after.progress.position).toBeNull();
		expect(after.progress.savedAt).not.toBeNull();
		expect(after.storyFlags).toEqual({ "ch3.outroShown": true });
	});

	it("selectChapter 不能跳到還沒到過的章節", () => {
		useGameStore.setState({ progress: { ...DEFAULT_PROGRESS, chapter: 2, furthestChapter: 2 } });
		const moved = useGameStore.getState().selectChapter(3);
		expect(moved).toBe(false);
		expect(useGameStore.getState().progress.chapter).toBe(2);
	});
});

describe("角色位置", () => {
	it("預設沒有位置，savePlayerPosition 存下章節、座標與艙區", () => {
		expect(useGameStore.getState().progress.position).toBeNull();
		useGameStore.getState().savePlayerPosition({ chapter: 1, x: 321, y: 456, roomId: "medbay" });
		expect(useGameStore.getState().progress.position).toEqual({ chapter: 1, x: 321, y: 456, roomId: "medbay" });
	});

	it("座標存成整數，避免存檔裡出現長小數", () => {
		useGameStore.getState().savePlayerPosition({ chapter: 1, x: 10.6, y: 20.2, roomId: "cryo" });
		expect(useGameStore.getState().progress.position).toEqual({ chapter: 1, x: 11, y: 20, roomId: "cryo" });
	});

	it("resetSave 清掉位置並回到第一章", () => {
		const state = useGameStore.getState();
		state.savePlayerPosition({ chapter: 1, x: 1, y: 2, roomId: "cryo" });
		state.advanceChapter();
		useGameStore.getState().resetSave();
		const after = useGameStore.getState().progress;
		expect(after.position).toBeNull();
		expect(after.furthestChapter).toBe(1);
	});
});

describe("selectors", () => {
	it("selectHasSave 依 savedAt 判斷", () => {
		expect(selectHasSave(useGameStore.getState())).toBe(false);
		useGameStore.getState().touchSave();
		expect(selectHasSave(useGameStore.getState())).toBe(true);
	});

	it("selectIsOxygenLow 在低於 30 時為 true", () => {
		const { loseOxygen } = useGameStore.getState();
		for (let index = 0; index < 70; index += 1) {
			loseOxygen();
		}
		expect(useGameStore.getState().progress.oxygen).toBe(30);
		expect(selectIsOxygenLow(useGameStore.getState())).toBe(false);

		loseOxygen();
		expect(selectIsOxygenLow(useGameStore.getState())).toBe(true);
	});
});

describe("persist", () => {
	it("呼叫 action 後寫入 localStorage，含版本與 progress，不含 action 函式", () => {
		useGameStore.getState().learnCommand("pwd");

		const stored = readStoredSave();
		expect(stored.version).toBe(SAVE_VERSION);
		expect(stored.version).toBe(2);
		expect(stored.state.progress).toEqual({ ...DEFAULT_PROGRESS, learnedCommands: ["pwd"] });
		expect(Object.keys(stored.state).sort()).toEqual(["progress", "settings", "storyFlags", "terminals"]);
		expect(stored.state).not.toHaveProperty("learnCommand");
		expect(stored.state).not.toHaveProperty("resetSave");
	});

	it("先寫一筆 localStorage，rehydrate 後能讀回", async () => {
		const save: SaveData = {
			progress: {
				...DEFAULT_PROGRESS,
				character: "c",
				learnedCommands: ["pwd", "ls"],
				solvedTerminals: ["ch1-t1"],
				oxygen: 42,
				savedAt: "2031-03-12T08:15:00.000Z",
			},
			settings: { ...DEFAULT_SETTINGS, scanlinesEnabled: false },
			terminals: { "ch1-t1": createRecord([createSystemEntry(1)]) },
			storyFlags: { "ch1.sawShadow": true },
		};
		localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify({ state: save, version: SAVE_VERSION }));

		await useGameStore.persist.rehydrate();

		const state = useGameStore.getState();
		expect(state.progress).toEqual(save.progress);
		expect(state.settings).toEqual(save.settings);
		expect(state.terminals).toEqual(save.terminals);
		expect(state.storyFlags).toEqual(save.storyFlags);
		expect(typeof state.learnCommand).toBe("function");
		expect(useGameStore.persist.hasHydrated()).toBe(true);
	});

	it("舊存檔缺少的設定欄位會用預設值補上", async () => {
		const partialSettings = { textSpeed: "slow" };
		localStorage.setItem(
			SAVE_STORAGE_KEY,
			JSON.stringify({
				state: { ...createInitialSaveData(), settings: partialSettings },
				version: SAVE_VERSION,
			}),
		);

		await useGameStore.persist.rehydrate();

		expect(useGameStore.getState().settings).toEqual({ ...DEFAULT_SETTINGS, textSpeed: "slow" });
	});

	it("v1 存檔升級成 v2：最遠章節等於目前章節、沒有位置，其他資料原樣保留", async () => {
		const v1Progress = {
			chapter: 3,
			character: "d",
			solvedTerminals: ["ch1-t1", "ch3-t2"],
			learnedCommands: ["pwd"],
			oxygen: 77,
			savedAt: "2031-03-12T08:15:00.000Z",
		};
		localStorage.setItem(
			SAVE_STORAGE_KEY,
			JSON.stringify({
				state: { ...createInitialSaveData(), progress: v1Progress, storyFlags: { "ch2.outroShown": true } },
				version: 1,
			}),
		);

		await useGameStore.persist.rehydrate();

		const state = useGameStore.getState();
		expect(state.progress).toEqual({ ...v1Progress, furthestChapter: 3, position: null });
		expect(state.storyFlags).toEqual({ "ch2.outroShown": true });
	});

	it("最遠章節比目前章節小的壞存檔會被拉回至少等於目前章節", async () => {
		localStorage.setItem(
			SAVE_STORAGE_KEY,
			JSON.stringify({
				state: { ...createInitialSaveData(), progress: { ...DEFAULT_PROGRESS, chapter: 4, furthestChapter: 2 } },
				version: SAVE_VERSION,
			}),
		);

		await useGameStore.persist.rehydrate();

		expect(useGameStore.getState().progress.furthestChapter).toBe(4);
	});

	it("存檔不是合法 JSON 時視為沒有存檔，仍完成 hydration", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(SAVE_STORAGE_KEY, "{壞掉的存檔");

		await useGameStore.persist.rehydrate();

		expect(useGameStore.persist.hasHydrated()).toBe(true);
		expect(useGameStore.getState().progress).toEqual(DEFAULT_PROGRESS);
		warn.mockRestore();
	});
});

describe("存檔寫入失敗", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("寫入丟 QuotaExceededError 時 action 不會丟例外，記憶體裡的狀態照樣更新，並回報存檔失敗", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		failAllWrites();

		expect(() => useGameStore.getState().loseOxygen()).not.toThrow();

		expect(useGameStore.getState().progress.oxygen).toBe(OXYGEN_MAX - 1);
		expect(getSaveIssue()).toBe("write-failed");
		expect(warn).toHaveBeenCalled();
	});

	it("之後寫入成功就清掉存檔失敗的狀態", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const setItem = failAllWrites();
		useGameStore.getState().loseOxygen();
		expect(getSaveIssue()).toBe("write-failed");

		setItem.mockRestore();
		useGameStore.getState().loseOxygen();

		expect(getSaveIssue()).toBeNull();
		expect(readStoredSave().state.progress).toMatchObject({ oxygen: OXYGEN_MAX - 2 });
	});

	it("讀舊版存檔升級後的寫入失敗也能完成 hydration，不會卡在讀檔中", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(
			SAVE_STORAGE_KEY,
			JSON.stringify({ state: { ...createInitialSaveData(), storyFlags: { "ch1.introShown": true } }, version: 1 }),
		);
		failAllWrites();

		await useGameStore.persist.rehydrate();

		expect(useGameStore.persist.hasHydrated()).toBe(true);
		expect(useGameStore.getState().storyFlags).toEqual({ "ch1.introShown": true });
		expect(getSaveIssue()).toBe("write-failed");
	});
});

describe("useStoreHydration", () => {
	it("一開始回傳 false，mount 後讀完存檔變成 true", async () => {
		// 換一份全新的模組，確保 store 還沒 hydrate 過
		vi.resetModules();
		const freshModule = await import("./gameStore");

		localStorage.setItem(
			SAVE_STORAGE_KEY,
			JSON.stringify({
				state: { ...createInitialSaveData(), storyFlags: { "ch1.sawShadow": true } },
				version: SAVE_VERSION,
			}),
		);

		const renders: boolean[] = [];
		const { result } = renderHook(() => {
			const hydrated = freshModule.useStoreHydration();
			renders.push(hydrated);
			return hydrated;
		});

		expect(renders[0]).toBe(false);
		await waitFor(() => {
			expect(result.current).toBe(true);
		});
		expect(freshModule.useGameStore.getState().storyFlags).toEqual({ "ch1.sawShadow": true });
	});
});
