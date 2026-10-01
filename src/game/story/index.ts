/**
 * 劇本模組的公開入口：型別契約、目標判定、schema 驗證、劇情旗標。
 */

export type {
	ChapterDefinition,
	NovaScript,
	Objective,
	ObjectiveCheck,
	ObjectiveContext,
	StoryFlag,
	TerminalDefinition,
} from "./types";
export {
	all,
	any,
	catFile,
	cdInto,
	commandIs,
	createObjectiveContext,
	evaluateObjective,
	lsWithFlag,
	outputContains,
} from "./objectives";
export { chapterDefinitionSchema, MAX_HINTS, TERMINAL_ID_PATTERN, terminalDefinitionSchema, validateChapter } from "./schema";
export { isStoryFlag, roomEnteredFlag, STORY_FLAGS } from "./flags";
export { isRoomId, ROOM_IDS } from "./rooms";
