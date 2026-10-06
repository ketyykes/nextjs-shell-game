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
	/** 音量，0 到 1 的數字。`AudioManager` 建構時讀取。沒設等同 1。 */
	volume: "volume",
	/** 是否靜音，布林值。`AudioManager` 建構時讀取。沒設等同 false。 */
	muted: "muted",
	/** 目前章節（1 到 6），Preloader 用它載入 `maps/deck{n}.json`。沒設等同 1。 */
	chapter: "chapter",
	/** 開場是否斷電（只有角色周圍一圈光），布林值。Station 建遮罩時讀。沒設等同 false（全亮）。 */
	startDark: "startDark",
	/**
	 * 終端機 id → `SolvedEffect` 的對照表（`Record<string, SolvedEffect>`），
	 * Station 收到 `puzzle:solved` 或重整還原時查它決定演出。沒設等同空物件。
	 */
	terminalEffects: "terminalEffects",
	/** 存檔裡的角色位置（`{ x, y }`），Station 建角色時用它取代地圖出生點。沒設或不合法就用出生點。 */
	spawnPoint: "spawnPoint",
	/** 設定的「閃爍」，布林值。Station 建立時讀，之後走 `effects:settings` 事件。沒設等同 true。 */
	flickerEnabled: "flickerEnabled",
} as const;
