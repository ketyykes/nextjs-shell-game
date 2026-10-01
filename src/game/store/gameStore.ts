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
import {
	DEFAULT_PROGRESS,
	DEFAULT_SETTINGS,
	OXYGEN_MAX,
	OXYGEN_MIN,
	SAVE_STORAGE_KEY,
	SAVE_VERSION,
	TRANSCRIPT_LIMIT,
} from "./types";
import type { GameStore, SaveData, StoryFlags, TerminalSessionRecord } from "./types";

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

/**
 * 包一層 localStorage：讀到壞掉的 JSON 時當成沒有存檔。
 *
 * persist 遇到 `JSON.parse` 丟錯時不會把 `hasHydrated()` 設成 true，
 * 畫面會一直卡在「讀檔中」；這裡先擋掉，讓壞檔等同空檔，下一次存檔時自然被覆蓋。
 */
const safeLocalStorage: StateStorage = {
	getItem: (name) => {
		const raw = localStorage.getItem(name);

		if (raw === null) {
			return null;
		}

		try {
			JSON.parse(raw);
			return raw;
		} catch {
			console.warn(`[gameStore] 存檔 ${name} 不是合法的 JSON，視為沒有存檔。`);
			return null;
		}
	},
	setItem: (name, value) => {
		localStorage.setItem(name, value);
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
		merged.progress = { ...currentState.progress, ...persisted.progress };
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
 * 存檔版本不同時才會被呼叫（版本相同 persist 不會呼叫 migrate）。
 *
 * 目前只有 v1，所以未知版本一律當成 v1 原樣回傳，欄位缺漏交給 `mergeSaveData` 用預設值補。
 * 之後 `SAVE_VERSION` 加一時，在這裡依 `version` 逐版轉換，例如：
 *
 * ```ts
 * if (version < 2) {
 *   // v1 → v2 的轉換
 * }
 * ```
 */
function migrateSaveData(persistedState: unknown, version: number): SaveData {
	if (version !== SAVE_VERSION) {
		console.warn(`[gameStore] 存檔版本 ${version} 與目前版本 ${SAVE_VERSION} 不同，暫時當成 v1 讀取。`);
	}

	return persistedState as SaveData;
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
