/**
 * 存檔格式的逐版升級，persist 讀到舊版存檔時呼叫，存檔匯入（`saveImport.ts`）也走同一條。
 *
 * - v1 → v2：`progress` 多 `furthestChapter`（舊存檔沒有選章，等於目前章節）與 `position`（舊存檔不存位置，null）。
 * - v2 → v3：`progress` 多 `clearedAt`、整份多 `stats`（每章統計，舊存檔沒有紀錄，從空的開始）。
 *   已經看完片尾的存檔（最後一章的 `outroShown` 旗標在）算已通關，通關時間用最後存檔時間。
 *   終端機紀錄不動：沒有 `scriptHash` 的紀錄在開啟時才判斷要不要用新版劇本重建（`terminalSession.ts`）。
 *
 * 只會收到比 `SAVE_VERSION` 舊的版本：比程式新的存檔在 `safeLocalStorage.getItem`（或匯入檢查）就擋掉了。
 * 欄位缺漏或型別不對的壞存檔交給 `mergeSaveData` 用預設值補。
 *
 * 純函式、不 import React 與 zustand，node 環境可以直接測。
 */

import { LAST_CHAPTER } from "@/game/chapters/meta";
import type { SaveData } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateToV2(state: Record<string, unknown>): Record<string, unknown> {
	if (!isRecord(state.progress)) {
		return state;
	}
	const progress = state.progress;
	return { ...state, progress: { ...progress, furthestChapter: progress.chapter, position: null } };
}

function migrateToV3(state: Record<string, unknown>): Record<string, unknown> {
	let next = state;

	if (isRecord(state.progress)) {
		const flags = isRecord(state.storyFlags) ? state.storyFlags : {};
		const sawEnding = flags[`ch${LAST_CHAPTER}.outroShown`] === true;
		let clearedAt: string | null = null;
		if (sawEnding) {
			const savedAt = state.progress.savedAt;
			clearedAt = typeof savedAt === "string" ? savedAt : new Date().toISOString();
		}
		next = { ...next, progress: { ...state.progress, clearedAt } };
	}

	if (!isRecord(state.stats)) {
		next = { ...next, stats: {} };
	}

	return next;
}

/** 依 `version` 逐版轉換到目前的 `SAVE_VERSION`。 */
export function migrateSaveData(persistedState: unknown, version: number): SaveData {
	if (!isRecord(persistedState)) {
		return persistedState as SaveData;
	}

	let state: Record<string, unknown> = persistedState;

	if (version < 2) {
		state = migrateToV2(state);
	}
	if (version < 3) {
		state = migrateToV3(state);
	}

	return state as unknown as SaveData;
}
