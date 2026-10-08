/**
 * store 模組的入口。
 *
 * 注意：這裡會帶進 `gameStore.ts` 的 React hook，只能在 client component 引用；
 * 伺服器端或純邏輯模組只需要型別與常數時，請直接從 `@/game/store/types` 引用。
 */

export { createInitialSaveData, useGameStore, useStoreHydration } from "./gameStore";
export {
	OXYGEN_LOW_THRESHOLD,
	selectHasFlag,
	selectHasSave,
	selectIsGameFinished,
	selectIsOxygenLow,
	selectIsTerminalSolved,
	selectLearnedCommands,
	selectOxygen,
	selectProgress,
	selectSettings,
	selectStoryFlags,
	selectTerminal,
} from "./selectors";
export {
	DEFAULT_PROGRESS,
	DEFAULT_SETTINGS,
	OXYGEN_MAX,
	OXYGEN_MIN,
	SAVE_STORAGE_KEY,
	SAVE_VERSION,
	TEXT_SPEED_MS,
	TRANSCRIPT_LIMIT,
} from "./types";
export type * from "./types";
