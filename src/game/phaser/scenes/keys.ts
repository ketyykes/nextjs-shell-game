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
} as const;
