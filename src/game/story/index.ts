/**
 * 劇本模組的公開入口：型別契約、目標判定、schema 驗證、劇情旗標、卡關偵測與環境反應階梯。
 */

export type {
	ChapterDefinition,
	ChapterMap,
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
	anyCommandIs,
	catFile,
	cdInto,
	commandHasOption,
	commandIs,
	commandTouches,
	createObjectiveContext,
	envEquals,
	evaluateObjective,
	fileAbsent,
	fileContains,
	fileExists,
	lsWithFlag,
	noProcessMatching,
	outputContains,
	redirectsTo,
	visibleOutputLines,
} from "./objectives";
export { chapterDefinitionSchema, MAX_HINTS, TERMINAL_ID_PATTERN, terminalDefinitionSchema, validateChapter } from "./schema";
export {
	chapterFlagPrefix,
	introShownFlag,
	isStoryFlag,
	novaPortraitFor,
	outroShownFlag,
	roomEnteredFlag,
	terminalOpenedFlag,
} from "./flags";
export type { NovaPortrait } from "./flags";
export { isRoomId, ROOM_IDS } from "./rooms";
export { deckTerminal, deckTerminalIdentity, deckTerminals, TERMINAL_SLOTS } from "./decks";
export type { DeckTerminal, TerminalIndex } from "./decks";
export {
	checkIdle,
	createPressureState,
	DEFAULT_NOVA_ERROR_LINES,
	FLICKER_DURATION_MS,
	LADDER_STEPS,
	novaErrorLine,
	recordExecution,
	resetPressure,
	STUCK_ERROR_STREAK,
	STUCK_IDLE_MS,
	stuckLines,
} from "./pressure";
export type { PressureReaction, PressureResult, PressureState } from "./pressure";
