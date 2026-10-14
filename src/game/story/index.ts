/**
 * 劇本模組的公開入口：型別契約、目標判定、schema 驗證、劇情旗標、卡關偵測與環境反應階梯、阿彬的隱藏留言、NOVA 看狀態的反應。
 */

export type {
	ChapterDefinition,
	ChapterMap,
	NovaReactionKind,
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
	NOVA_REACTION_KINDS,
	novaPortraitFor,
	novaReactionFlag,
	outroShownFlag,
	roomEnteredFlag,
	terminalOpenedFlag,
} from "./flags";
export type { NovaPortrait } from "./flags";
export { isRoomId, ROOM_IDS } from "./rooms";
export {
	ABIN_HOME,
	decideNovaReaction,
	detectNovaReactions,
	HINT_HEAVY_CHAPTER_COUNT,
	introFollowUpLine,
	NOVA_DIR_VARIABLE,
	NOVA_TERMINATED_TERMINAL_ID,
	NOVA_UNMASKED_TERMINAL_ID,
	novaPhase,
	novaReactionLines,
} from "./novaReactions";
export type {
	AbinReactionEvent,
	NovaPhase,
	NovaReactionDecision,
	NovaReactionDecisionInput,
	NovaReactionInput,
	NovaReactionTrigger,
} from "./novaReactions";
export {
	ABIN_NOTE_TOTAL,
	ABIN_NOTES,
	ABIN_OWNER,
	ABIN_REPLY_MAX_LENGTH,
	ABIN_REPLY_PATH,
	ABIN_REPLY_TERMINAL_ID,
	abinEvidenceFiles,
	abinNotesByTime,
	applyAbinOverlay,
	countFoundAbinNotes,
	findAbinNote,
	readAbinReply,
	revealedAbinNotes,
	sanitizeReplyText,
} from "./abinNotes";
export type { AbinEvidenceFile, AbinNote, AbinOverlayOptions } from "./abinNotes";
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
