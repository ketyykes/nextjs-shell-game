/**
 * 存檔匯出（M14-2）：把存檔資料包成跟 localStorage 一樣的 `{ state, version }` JSON，下載成檔案。
 * 同一份格式匯入時走 `saveImport.ts` 檢查；直接從 devtools 複製 localStorage 的 `kepler9-save` 也能匯入。
 *
 * 純函式、只 import 型別與常數，標題頁用不會帶進 zod。
 */

import { SAVE_STORAGE_KEY, SAVE_VERSION } from "./types";
import type { SaveData } from "./types";

/** 只留存檔的資料欄位（store 的 action 不進存檔），persist 的 `partialize` 也用它。 */
export function toSaveData(state: SaveData): SaveData {
	return {
		progress: state.progress,
		settings: state.settings,
		terminals: state.terminals,
		storyFlags: state.storyFlags,
		stats: state.stats,
	};
}

/** 匯出檔的內容，格式跟 localStorage 裡的存檔相同。 */
export function createSaveExportText(data: SaveData): string {
	return JSON.stringify({ state: toSaveData(data), version: SAVE_VERSION });
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

/** 下載的檔名，例如 `kepler9-save-20310305-0807.json`，用玩家的當地時間。 */
export function saveExportFileName(date: Date): string {
	const day = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
	const time = `${pad2(date.getHours())}${pad2(date.getMinutes())}`;
	return `${SAVE_STORAGE_KEY}-${day}-${time}.json`;
}
