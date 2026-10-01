/**
 * 劇本資料的型別。
 *
 * M5-1 起契約移到 `src/game/story/types.ts`，這裡只轉出，避免既有的 import 壞掉。
 * 新程式請直接從 `@/game/story` 匯入。
 */

export type {
	ChapterDefinition,
	NovaScript,
	Objective,
	ObjectiveCheck,
	ObjectiveContext,
	StoryFlag,
	TerminalDefinition,
} from "@/game/story/types";
