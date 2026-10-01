/** 場景 key，`main.ts` 會 re-export。獨立成檔是為了避免場景與 main 互相 import。 */
export const SCENE_KEYS = {
	boot: "Boot",
	preloader: "Preloader",
	station: "Station",
} as const;

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];

/** `game.registry` 的 key，main 寫入、場景讀取。 */
export const REGISTRY_KEYS = {
	/** 選角結果，值是 `CharacterId`。 */
	character: "character",
	/**
	 * 已過關的終端機 id 陣列（`string[]`，例如 `["ch1-t4"]`），重整後還原場景用。
	 * Station 的 `create()` 讀取並呼叫 `applySolvedState`，不播動畫直接套最終狀態。沒設等同空陣列。
	 */
	solvedTerminals: "solvedTerminals",
} as const;
