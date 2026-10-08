/**
 * 遊戲的 zustand store，負責進度、設定、終端機 session 與劇情旗標，並用 persist 存進 localStorage。
 *
 * - 型別與常數的契約在 `./types.ts`，這裡只負責實作。
 * - `skipHydration: true`：伺服器與 client 第一次 render 都用預設值，
 *   等 client mount 後才由 `useStoreHydration` 呼叫 `rehydrate()` 讀回存檔，避免 hydration mismatch。
 * - 所有 action 都用 `set` 回傳新物件，不直接修改既有狀態。
 *
 * 這個模組會用到 React hook，只能在 client component（`"use client"` 底下）引用；
 * 純資料型別請改從 `./types` 引用。
 */

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import { getSaveIssue, setSaveIssue } from "./saveStatus";
import {
	DEFAULT_PROGRESS,
	DEFAULT_SETTINGS,
	OXYGEN_MAX,
	OXYGEN_MIN,
	SAVE_STORAGE_KEY,
	SAVE_VERSION,
	TRANSCRIPT_LIMIT,
} from "./types";
import type { GameStore, ProgressState, SaveData, StoryFlags, TerminalSessionRecord } from "./types";

// ---------------------------------------------------------------------------
// 初始值
// ---------------------------------------------------------------------------

/** 建立一份全新的存檔資料。陣列與物件每次都是新的，不會和 `DEFAULT_*` 共用參考。 */
export function createInitialSaveData(): SaveData {
	return {
		progress: {
			...DEFAULT_PROGRESS,
			solvedTerminals: [],
			learnedCommands: [],
		},
		settings: { ...DEFAULT_SETTINGS },
		terminals: {},
		storyFlags: {},
	};
}

// ---------------------------------------------------------------------------
// 存檔讀寫的防護
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 舊版存檔升級前的備份 key，例如 `kepler9-save.backup.v1`。 */
function backupKeyFor(name: string, version: number): string {
	return `${name}.backup.v${version}`;
}

/** 升級前把原始字串留一份，升級寫壞了還能手動還原。備份寫不進去不擋升級，只警告。 */
function backupBeforeMigrate(name: string, version: number, raw: string): void {
	try {
		localStorage.setItem(backupKeyFor(name, version), raw);
	} catch (error) {
		console.warn(`[gameStore] 存檔 ${name} 升級前的備份寫入失敗，照樣升級。`, error);
	}
}

/**
 * 包一層 localStorage：
 *
 * - 讀到壞掉的 JSON 時當成沒有存檔。persist 遇到 `JSON.parse` 丟錯時不會把 `hasHydrated()` 設成 true，
 *   畫面會一直卡在「讀檔中」；這裡先擋掉，讓壞檔等同空檔，下一次存檔時自然被覆蓋。
 * - 版本比程式新（例如部署回滾）：不讀進來也不寫回去，原始存檔原封不動，回報 `newer-version` 讓畫面提示。
 *   以前會照目前格式硬轉型讀進來，下一次寫檔就把新版的資料蓋掉。
 * - 版本比程式舊：交給 persist 呼叫 migrate 升級之前，先把原始字串備份到 `<key>.backup.v<舊版號>`。
 * - 寫入失敗（配額滿的 `QuotaExceededError`、瀏覽器封鎖儲存的 `SecurityError`）不往外丟：
 *   persist 每次 `set` 都同步寫檔，例外會從 action 一路冒到按鍵 handler，記憶體狀態已改、存檔沒寫、玩家看不到提示。
 *   改成 console.warn 並回報 `write-failed` 讓畫面提示，記憶體裡的進度照常，下次寫入成功就清掉提示。
 */
const safeLocalStorage: StateStorage = {
	getItem: (name) => {
		// 每次讀檔重新判斷版本，上一次讀到的新版存檔可能已經被清掉
		if (getSaveIssue() === "newer-version") {
			setSaveIssue(null);
		}

		const raw = localStorage.getItem(name);

		if (raw === null) {
			return null;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			console.warn(`[gameStore] 存檔 ${name} 不是合法的 JSON，視為沒有存檔。`);
			return null;
		}

		const version = isRecord(parsed) ? parsed.version : undefined;
		if (typeof version === "number" && version > SAVE_VERSION) {
			console.warn(`[gameStore] 存檔版本 ${version} 比目前版本 ${SAVE_VERSION} 新，這次不讀取也不寫入，保留原始存檔。`);
			setSaveIssue("newer-version");
			return null;
		}
		if (typeof version === "number" && version < SAVE_VERSION) {
			backupBeforeMigrate(name, version, raw);
		}
		return raw;
	},
	setItem: (name, value) => {
		// 讀到比程式新的存檔：這個分頁期間一律不寫，避免舊程式把新版資料蓋掉
		if (getSaveIssue() === "newer-version") {
			return;
		}
		try {
			localStorage.setItem(name, value);
		} catch (error) {
			console.warn(`[gameStore] 存檔 ${name} 寫入失敗，進度只留在記憶體裡。`, error);
			setSaveIssue("write-failed");
			return;
		}
		if (getSaveIssue() === "write-failed") {
			setSaveIssue(null);
		}
	},
	removeItem: (name) => {
		localStorage.removeItem(name);
	},
};

/**
 * 把讀回來的存檔合併到目前狀態。
 *
 * zustand 預設是淺層合併，`progress` 或 `settings` 之後新增欄位時，舊存檔會整包蓋掉預設值；
 * 這裡改成對這兩個物件再合併一層，讓新欄位能拿到 `DEFAULT_*` 的值。
 */
function mergeSaveData(persistedState: unknown, currentState: GameStore): GameStore {
	if (!isRecord(persistedState)) {
		return currentState;
	}

	const persisted = persistedState as Partial<SaveData>;
	const merged: GameStore = { ...currentState };

	if (isRecord(persisted.progress)) {
		const progress = { ...currentState.progress, ...persisted.progress };
		// 選章只開放到 furthestChapter，壞存檔若比目前章節還小就拉回來，至少能選到現在這章
		progress.furthestChapter = Math.max(progress.furthestChapter, progress.chapter);
		merged.progress = progress;
	}

	if (isRecord(persisted.settings)) {
		merged.settings = { ...currentState.settings, ...persisted.settings };
	}

	if (isRecord(persisted.terminals)) {
		merged.terminals = persisted.terminals;
	}

	if (isRecord(persisted.storyFlags)) {
		merged.storyFlags = persisted.storyFlags;
	}

	return merged;
}

/**
 * 存檔版本不同時才會被呼叫（版本相同 persist 不會呼叫 migrate）。依 `version` 逐版轉換到 `SAVE_VERSION`。
 *
 * - v1 → v2：`progress` 多 `furthestChapter`（舊存檔沒有選章，等於目前章節）與 `position`（舊存檔不存位置，null）。
 *
 * 只會收到比 `SAVE_VERSION` 舊的版本：比程式新的存檔在 `safeLocalStorage.getItem` 就擋掉了，不會走到這裡。
 * 欄位缺漏或型別不對的壞存檔交給 `mergeSaveData` 用預設值補。
 */
function migrateSaveData(persistedState: unknown, version: number): SaveData {
	if (!isRecord(persistedState)) {
		return persistedState as SaveData;
	}

	let state: Record<string, unknown> = persistedState;

	if (version < 2 && isRecord(state.progress)) {
		const progress = state.progress;
		state = {
			...state,
			progress: { ...progress, furthestChapter: progress.chapter, position: null },
		};
	}

	return state as unknown as SaveData;
}

/**
 * 清掉某一章的進度：`ch<n>-` 開頭的終端機 session 與過關紀錄、`ch<n>.` 開頭的旗標、該章的角色位置，氧氣回滿。
 * 前綴帶分隔符號，ch1 才不會誤殺 ch10。
 */
function clearChapter(
	state: SaveData,
	chapter: number,
): { progress: ProgressState; terminals: Record<string, TerminalSessionRecord>; storyFlags: StoryFlags } {
	const terminalPrefix = `ch${chapter}-`;
	const flagPrefix = `ch${chapter}.`;

	const terminals: Record<string, TerminalSessionRecord> = {};
	for (const [terminalId, record] of Object.entries(state.terminals)) {
		if (!terminalId.startsWith(terminalPrefix)) {
			terminals[terminalId] = record;
		}
	}

	const storyFlags: StoryFlags = {};
	for (const flag of Object.keys(state.storyFlags)) {
		if (!flag.startsWith(flagPrefix)) {
			storyFlags[flag] = true;
		}
	}

	let position = state.progress.position;
	if (position !== null && position.chapter === chapter) {
		position = null;
	}

	return {
		progress: {
			...state.progress,
			solvedTerminals: state.progress.solvedTerminals.filter((id) => !id.startsWith(terminalPrefix)),
			oxygen: OXYGEN_MAX,
			position,
		},
		terminals,
		storyFlags,
	};
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStore>()(
	persist(
		(set, get) => ({
			...createInitialSaveData(),

			// 設定 -------------------------------------------------------------

			updateSettings: (patch) => {
				set((state) => ({ settings: { ...state.settings, ...patch } }));
			},

			// 進度 -------------------------------------------------------------

			setCharacter: (character) => {
				set((state) => ({ progress: { ...state.progress, character } }));
			},

			learnCommand: (name) => {
				if (get().progress.learnedCommands.includes(name)) {
					return;
				}

				set((state) => ({
					progress: {
						...state.progress,
						learnedCommands: [...state.progress.learnedCommands, name],
					},
				}));
			},

			markTerminalSolved: (terminalId) => {
				if (get().progress.solvedTerminals.includes(terminalId)) {
					return;
				}

				set((state) => ({
					progress: {
						...state.progress,
						solvedTerminals: [...state.progress.solvedTerminals, terminalId],
					},
				}));
			},

			loseOxygen: () => {
				set((state) => ({
					progress: {
						...state.progress,
						oxygen: Math.max(OXYGEN_MIN, state.progress.oxygen - 1),
					},
				}));
			},

			restoreOxygen: () => {
				set((state) => ({ progress: { ...state.progress, oxygen: OXYGEN_MAX } }));
			},

			// 終端機 session ---------------------------------------------------

			saveTerminalSession: (terminalId, record) => {
				const current = get().terminals[terminalId];
				let nextRecord = record;

				// 呼叫端存 shell 狀態時通常只帶 shell 與 transcript，這裡保留原本的階梯計數，避免被洗成 0
				if (record.errorCount === undefined && current?.errorCount !== undefined) {
					nextRecord = { ...record, errorCount: current.errorCount };
				}

				set((state) => ({ terminals: { ...state.terminals, [terminalId]: nextRecord } }));
			},

			appendTranscript: (terminalId, entries) => {
				const current = get().terminals[terminalId];

				// 沒有 session 就沒有 shell 狀態可以掛輸出，必須先呼叫 saveTerminalSession。
				if (current === undefined) {
					console.warn(`[gameStore] 終端機 ${terminalId} 還沒有 session，略過 appendTranscript。`);
					return;
				}

				let transcript = [...current.transcript, ...entries];

				if (transcript.length > TRANSCRIPT_LIMIT) {
					transcript = transcript.slice(transcript.length - TRANSCRIPT_LIMIT);
				}

				const nextRecord: TerminalSessionRecord = { ...current, transcript };
				set((state) => ({ terminals: { ...state.terminals, [terminalId]: nextRecord } }));
			},

			clearTranscript: (terminalId) => {
				const current = get().terminals[terminalId];

				if (current === undefined) {
					return;
				}

				const nextRecord: TerminalSessionRecord = { ...current, transcript: [] };
				set((state) => ({ terminals: { ...state.terminals, [terminalId]: nextRecord } }));
			},

			setTerminalErrorCount: (terminalId, count) => {
				const current = get().terminals[terminalId];

				// 沒有 session 就沒有地方掛計數；開啟終端機時一定會先建立 session，這裡安靜略過即可
				if (current === undefined) {
					return;
				}

				const errorCount = Math.max(0, Math.trunc(count));
				if (current.errorCount === errorCount) {
					return;
				}

				const nextRecord: TerminalSessionRecord = { ...current, errorCount };
				set((state) => ({ terminals: { ...state.terminals, [terminalId]: nextRecord } }));
			},

			// 劇情旗標 ---------------------------------------------------------

			setFlag: (flag) => {
				set((state) => ({ storyFlags: { ...state.storyFlags, [flag]: true } }));
			},

			clearFlag: (flag) => {
				if (!(flag in get().storyFlags)) {
					return;
				}

				set((state) => {
					const nextFlags: StoryFlags = { ...state.storyFlags };
					delete nextFlags[flag];
					return { storyFlags: nextFlags };
				});
			},

			// 存檔 -------------------------------------------------------------

			resetSave: () => {
				const initial = createInitialSaveData();

				set({
					progress: initial.progress,
					terminals: initial.terminals,
					storyFlags: initial.storyFlags,
				});
			},

			touchSave: () => {
				set((state) => ({ progress: { ...state.progress, savedAt: new Date().toISOString() } }));
			},

			// 章節 -------------------------------------------------------------

			advanceChapter: () => {
				set((state) => ({
					progress: {
						...state.progress,
						chapter: state.progress.chapter + 1,
						furthestChapter: Math.max(state.progress.furthestChapter, state.progress.chapter + 1),
						position: null,
						oxygen: OXYGEN_MAX,
						savedAt: new Date().toISOString(),
					},
				}));
			},

			resetChapter: (chapter) => {
				set((state) => clearChapter(state, chapter));
			},

			selectChapter: (chapter) => {
				const { furthestChapter } = get().progress;
				if (!Number.isInteger(chapter) || chapter < 1 || chapter > furthestChapter) {
					return false;
				}

				set((state) => {
					const cleared = clearChapter(state, chapter);
					return {
						...cleared,
						progress: { ...cleared.progress, chapter, position: null, savedAt: new Date().toISOString() },
					};
				});
				return true;
			},

			savePlayerPosition: (position) => {
				set((state) => ({
					progress: {
						...state.progress,
						position: { ...position, x: Math.round(position.x), y: Math.round(position.y) },
					},
				}));
			},
		}),
		{
			name: SAVE_STORAGE_KEY,
			version: SAVE_VERSION,
			storage: createJSONStorage<SaveData>(() => safeLocalStorage),
			// 只存資料欄位，actions 不進 localStorage
			partialize: (state): SaveData => ({
				progress: state.progress,
				settings: state.settings,
				terminals: state.terminals,
				storyFlags: state.storyFlags,
			}),
			migrate: migrateSaveData,
			merge: mergeSaveData,
			skipHydration: true,
		},
	),
);

// ---------------------------------------------------------------------------
// hydration hook
// ---------------------------------------------------------------------------

/** 訂閱 hydration 開始與結束；放在模組層，讓 `useSyncExternalStore` 拿到穩定的參考。 */
function subscribeHydration(onChange: () => void): () => void {
	const unsubscribeStart = useGameStore.persist.onHydrate(onChange);
	const unsubscribeFinish = useGameStore.persist.onFinishHydration(onChange);

	return () => {
		unsubscribeStart();
		unsubscribeFinish();
	};
}

function getHydratedSnapshot(): boolean {
	return useGameStore.persist.hasHydrated();
}

/** 伺服器沒有 localStorage，永遠視為尚未讀檔；client hydration 時也用這個值，兩邊才會一致。 */
function getServerHydratedSnapshot(): boolean {
	return false;
}

/**
 * 在 client mount 後讀回 localStorage 的存檔，回傳是否已讀完。
 *
 * 回傳 false 時 store 裡是預設值，依賴存檔的畫面（例如標題畫面的「繼續」）應該先不顯示。
 * 多個元件同時使用也只會讀檔一次。
 */
export function useStoreHydration(): boolean {
	const hydrated = useSyncExternalStore(subscribeHydration, getHydratedSnapshot, getServerHydratedSnapshot);

	useEffect(() => {
		if (!useGameStore.persist.hasHydrated()) {
			void useGameStore.persist.rehydrate();
		}
	}, []);

	return hydrated;
}
