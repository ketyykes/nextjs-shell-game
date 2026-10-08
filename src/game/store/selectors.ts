/**
 * 常用的 selector，給元件用 `useGameStore(selectX)` 只訂閱需要的片段，避免整個 store 變動都重新 render。
 *
 * selector 都回傳 store 裡既有的參考或原始值，不在裡面組新物件或新陣列，
 * 否則每次比較都不相等，會造成無限重新 render。需要組合多個欄位時請搭配 `zustand/react/shallow` 的 `useShallow`。
 */

import { LAST_CHAPTER } from "@/game/chapters/meta";
import type { GameStore, ProgressState, SettingsState, StoryFlags, TerminalSessionRecord } from "./types";

/** 氧氣低於這個百分比時 HUD 進入警示狀態。 */
export const OXYGEN_LOW_THRESHOLD = 30;

export function selectSettings(state: GameStore): SettingsState {
	return state.settings;
}

export function selectProgress(state: GameStore): ProgressState {
	return state.progress;
}

export function selectStoryFlags(state: GameStore): StoryFlags {
	return state.storyFlags;
}

export function selectOxygen(state: GameStore): number {
	return state.progress.oxygen;
}

export function selectLearnedCommands(state: GameStore): string[] {
	return state.progress.learnedCommands;
}

/** 有沒有存檔，標題畫面用它決定「繼續」要不要出現。需在 hydration 完成後才可信。 */
export function selectHasSave(state: GameStore): boolean {
	return state.progress.savedAt !== null;
}

export function selectIsOxygenLow(state: GameStore): boolean {
	return state.progress.oxygen < OXYGEN_LOW_THRESHOLD;
}

/**
 * 依終端機 id 取 session，沒有存過回傳 `undefined`。
 *
 * 這是 selector 工廠，元件裡 `useGameStore(selectTerminal(id))` 每次 render 都會產生新函式，
 * 但回傳值是 store 內的同一個參考，所以不會多餘地重新 render。
 */
export function selectTerminal(terminalId: string): (state: GameStore) => TerminalSessionRecord | undefined {
	return (state) => state.terminals[terminalId];
}

export function selectIsTerminalSolved(terminalId: string): (state: GameStore) => boolean {
	return (state) => state.progress.solvedTerminals.includes(terminalId);
}

export function selectHasFlag(flag: string): (state: GameStore) => boolean {
	return (state) => state.storyFlags[flag] === true;
}

/**
 * 已逃離而且停在片尾之後（v3）：通關過、目前在最後一章、最後一章的片尾也播完了。
 * 標題畫面用它把「繼續」換成「通關紀錄」、副標換成「已逃離 Kepler-9」；
 * 通關後選章重玩（章節變了、或最後一章的旗標被清掉）就不算，「繼續」回來。
 */
export function selectIsGameFinished(state: GameStore): boolean {
	return (
		state.progress.clearedAt !== null &&
		state.progress.chapter === LAST_CHAPTER &&
		state.storyFlags[`ch${LAST_CHAPTER}.outroShown`] === true
	);
}
