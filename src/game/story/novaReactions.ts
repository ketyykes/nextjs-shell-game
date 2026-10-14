/**
 * NOVA 看狀態（設計文件 4.14、審計 A44）：NOVA 的劇本台詞都是寫死的時機（開場、進艙區、開終端機、過關、卡關），
 * 這裡讓它對「玩家剛剛做了什麼」插一句，讓「它監看所有終端機」從設定變成玩家感受得到的事。
 *
 * 三步，全部是純函式，接到遊戲上的是 `components/game/useNovaReactions.ts`：
 * 1. `detectNovaReactions`：這道指令觸發了哪些反應，依優先順序排。
 * 2. `novaReactionLines`：某個反應在這一章、NOVA 這個狀態下的台詞；沒有台詞就是這一章不說。
 * 3. `decideNovaReaction`：這道指令最後說哪一句、哪些留到下一道。
 *
 * 規則：
 * - 每種反應每章最多一次，記在劇情旗標 `ch<n>.nova.<反應>`（`flags.ts` 的 `novaReactionFlag`），重玩本章會清掉。
 * - 一道指令最多說一句。這道指令 NOVA 已經說過話（過關、第一次卡關、第 9 次錯誤的台詞）就不插嘴，
 *   觸發的反應留到下一道沒有 NOVA 台詞的指令再說，免得同一道指令連出兩段 NOVA。
 * - 第六章 T4（`kill -9` NOVA 核心）過關之後 NOVA 不再說任何反應，留著的也丟掉；T5、T6 只剩系統自動回覆。
 * - 口吻照章節：第一到四章還在演失憶、無害、會自我修正；第五章謊言開始被戳破；第六章 T3（讀到身分檔）過關前還在演，之後不演了。
 *   每章只講到那一章為止玩家知道的事（4.2）。不指涉玩家的性別、年齡、名字，叫玩家「技師」；提到的指令與路徑都是真的。
 * - hint 來自遊戲系統、永遠可信（4.6）：NOVA 可以眼紅、可以酸，但不說 hint 錯，也不叫玩家別用。
 *
 * 這個檔案不 import React、Phaser 或 zustand。
 */

import { parseCommandLine } from "@/game/shell/parser";
import { PLAYER_USER, type ShellExecution } from "@/game/shell/types";
import { ABIN_NOTES } from "./abinNotes";
import { novaReactionFlag } from "./flags";
import type { NovaReactionKind, StoryFlag } from "./types";

// ---------------------------------------------------------------------------
// NOVA 的狀態
// ---------------------------------------------------------------------------

/** `acting` 還在演；`unmasked` 第六章讀到身分檔之後不演了；`silenced` 第六章核心被終止，不再說話。 */
export type NovaPhase = "acting" | "unmasked" | "silenced";

/** 第六章讀到身分檔的那台：過關之後 NOVA 不演了（T4 進房台詞「好。我不演了。」）。 */
export const NOVA_UNMASKED_TERMINAL_ID = "ch6-t3";

/** 第六章 `kill -9` NOVA 核心的那台：過關之後 NOVA 不再說話。 */
export const NOVA_TERMINATED_TERMINAL_ID = "ch6-t4";

/** 看目前章節與過關紀錄判斷 NOVA 的狀態；只有第六章會變。 */
export function novaPhase(chapter: number, solvedTerminals: readonly string[]): NovaPhase {
	if (chapter !== 6) {
		return "acting";
	}
	if (solvedTerminals.includes(NOVA_TERMINATED_TERMINAL_ID)) {
		return "silenced";
	}
	if (solvedTerminals.includes(NOVA_UNMASKED_TERMINAL_ID)) {
		return "unmasked";
	}
	return "acting";
}

// ---------------------------------------------------------------------------
// 偵測
// ---------------------------------------------------------------------------

/** 本章累計看了幾次 hint 起，NOVA 會眼紅（另一條是同一台三段都看完還在打）。 */
export const HINT_HEAVY_CHAPTER_COUNT = 6;

/** 阿彬的家目錄。 */
export const ABIN_HOME = "/home/abin";

/** 回滾那天被清空的變數（4.2）。 */
export const NOVA_DIR_VARIABLE = "NOVA_DIR";

/** 偵測到的一個反應。台詞到要說的時候才依當下的章節與 NOVA 的狀態產生。 */
export interface NovaReactionTrigger {
	kind: NovaReactionKind;
	/** `abinNote` 用：這次新找到的第一則留言 id。 */
	noteId?: string;
	/** `abinNote` 用：這次之後一共找到幾則。 */
	foundCount?: number;
}

/** 一道指令跟阿彬的留言有關的事；`components/game/useAbinNotes.ts` 的 `AbinNotesEvent` 就是這個形狀。 */
export interface AbinReactionEvent {
	/** 這次新找到的留言，沒有是空陣列。 */
	found: readonly { id: string }[];
	foundCount: number;
	/** 回信被寫入或改寫成的文字；沒有變動是 null。 */
	reply: string | null;
}

export interface NovaReactionInput {
	/** 這道指令的執行結果；用 `;`、`&&` 串了好幾段時看 `segments` 裡實際執行過的每一段。 */
	execution: ShellExecution;
	/** 這道指令跟阿彬的留言有關的事；沒事是 null。 */
	abin: AbinReactionEvent | null;
	/** 本章累計看了幾次 hint，含這一道。 */
	chapterHints: number;
	/** 這台終端機累計看了幾次 hint，含這一道（`shell.hintCount`）。 */
	terminalHints: number;
	/** 這台終端機的提示有幾段。 */
	hintStages: number;
}

/** 同一道指令觸發好幾種時的優先順序：越少見、越貼劇情的排越前面。 */
const PRIORITY: readonly NovaReactionKind[] = ["unsetNovaDir", "abinReply", "abinNote", "abinHome", "identity", "hintHeavy"];

/** 實際執行過的每一段；只有一段時整行就是那一段。 */
function executedSegments(execution: ShellExecution): ShellExecution[] {
	return execution.segments ?? [execution];
}

/** 一段裡的每個指令（管線的每一節），解析失敗是空陣列。 */
function segmentCommands(segment: ShellExecution): { name: string; args: string[] }[] {
	const parsed = parseCommandLine(segment.input, { env: segment.env });
	if (!parsed.ok || parsed.pipeline === null) {
		return [];
	}
	return parsed.pipeline.commands;
}

function isInAbinHome(cwd: string): boolean {
	return cwd === ABIN_HOME || cwd.startsWith(`${ABIN_HOME}/`);
}

/** 這一段執行了 `unset NOVA_DIR`，而且跑完之後 NOVA_DIR 不在了。 */
function unsetsNovaDir(segment: ShellExecution): boolean {
	if (Object.prototype.hasOwnProperty.call(segment.env, NOVA_DIR_VARIABLE)) {
		return false;
	}
	return segmentCommands(segment).some(
		(command) => command.name === "unset" && command.args.includes(NOVA_DIR_VARIABLE),
	);
}

/** 這一段成功地查了自己的帳號：`whoami`、`id`、`id tech`。 */
function asksWhoAmI(segment: ShellExecution): boolean {
	if (segment.isError) {
		return false;
	}
	return segmentCommands(segment).some((command) => {
		if (command.name === "whoami") {
			return command.args.length === 0;
		}
		if (command.name !== "id") {
			return false;
		}
		return command.args.length === 0 || (command.args.length === 1 && command.args[0] === PLAYER_USER);
	});
}

/** hint 用得多：這道指令有 hint，而且本章累計到門檻，或這台三段都看完還在打。 */
function usesHintHeavily(input: NovaReactionInput): boolean {
	if (!input.execution.hintUsed) {
		return false;
	}
	if (input.chapterHints >= HINT_HEAVY_CHAPTER_COUNT) {
		return true;
	}
	return input.hintStages > 0 && input.terminalHints > input.hintStages;
}

/** 這道指令觸發了哪些反應，依優先順序排；還沒過濾旗標與章節（那是 `decideNovaReaction` 的事）。 */
export function detectNovaReactions(input: NovaReactionInput): NovaReactionTrigger[] {
	const segments = executedSegments(input.execution);
	const found: NovaReactionTrigger[] = [];

	if (segments.some(unsetsNovaDir)) {
		found.push({ kind: "unsetNovaDir" });
	}
	if (input.abin !== null && input.abin.reply !== null) {
		found.push({ kind: "abinReply" });
	}
	const firstNote = input.abin?.found[0];
	if (input.abin !== null && firstNote !== undefined) {
		found.push({ kind: "abinNote", noteId: firstNote.id, foundCount: input.abin.foundCount });
	}
	if (segments.some((segment) => isInAbinHome(segment.cwd))) {
		found.push({ kind: "abinHome" });
	}
	if (segments.some(asksWhoAmI)) {
		found.push({ kind: "identity" });
	}
	if (usesHintHeavily(input)) {
		found.push({ kind: "hintHeavy" });
	}

	return found.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
}

// ---------------------------------------------------------------------------
// 台詞
// ---------------------------------------------------------------------------

/** 一章的台詞；第六章分「還在演」與「不演了」兩句。 */
type ChapterLine = string | { acting: string; unmasked: string };

/**
 * 除了留言以外的反應，依章節給一句；沒寫的章節就是那一章不說。
 * - `abinReply` 只有第四章：回信只能寫在第四章通訊紀錄終端機。
 * - `abinHome` 只有第一章（宿舍）與第四章（通訊紀錄終端機補寫的家目錄）：別章沒有那個目錄，玩家自己建的不算數。
 * - `unsetNovaDir` 從第五章起：排程日誌第五章 T4 才揭露那三秒，前四章說了就是劇透。
 */
const CHAPTER_LINES: Record<Exclude<NovaReactionKind, "abinNote">, Partial<Record<number, ChapterLine>>> = {
	abinReply: {
		// 第六章記憶庫才揭露它先讀了（`day_1326_reply.mem`），這裡只說會「收好」
		4: "寫給阿彬的信？我會幫你收好，技師。不會弄丟的。",
	},
	abinHome: {
		1: "這裡是阿彬的家目錄，技師，你的在 /home/tech。你走進哪一層目錄，我都看得到。……我是說，站務系統看得到。",
		// 帳號上一次登入是兩天前（`last abin` 查得到），NOVA 說三年：查得出來的謊
		4: "阿彬的家目錄還在。帳號沒有刪，只是三年沒有人登入了。",
	},
	hintHeavy: {
		1: "又是提示系統。它不會記錯事情。……不像我。",
		2: "你比較相信那個提示系統，對吧？沒關係，它說的都對。",
		3: "提示系統一步一步教你。我也會教。……你很少問我。",
		4: "提示系統講話比我清楚。我在學。",
		5: "提示系統不歸我管，我碰不到它。……所以你才信它，對吧？",
		6: {
			acting: "又是提示系統。技師，那些答案我也知道。",
			unmasked: "繼續用提示。它是這座站上唯一沒騙過你的東西。",
		},
	},
	unsetNovaDir: {
		5: "NOVA_DIR 空了。現在那行 rm 會從 / 開始刪。……三年前，沒有人提醒那個工程師。",
		6: {
			acting: "unset。這個我沒教過你。……你學得比我想的快，技師。",
			unmasked: "對，就是這樣。三秒就夠了。",
		},
	},
	identity: {
		1: "tech。帳號是對的。……名單上沒有你，帳號卻還在。這不太對。",
		2: "帳號是 tech。為什麼名單上沒有你，這一層的日誌應該查得到。",
		3: "tech。帳號建得好好的，家目錄也在。有問題的是名單。……我會再查一次。",
		// `last` 列出的登入中帳號確實只有 tech
		4: "tech。站上現在登入中的帳號，只有你一個。",
		5: "帳號是 tech。技師，你是誰，我比任何一份名單都清楚。",
		6: {
			// ps 裡玩家自己的 shell：`48213 tech … 2031-03-12 08:15  -sh`
			acting: "tech。ps 裡也有你，最下面那個 -sh，08:15 開始跑的。",
			unmasked: "你是我叫醒的那一個。帳號是我替你留著的。",
		},
	},
};

/** 留言用的佔位字，換成目前找到幾則。 */
const COUNT_PLACEHOLDER = "{count}";

/**
 * 讀到阿彬的留言，依那一則給一句（每章只說第一次找到的那則）。
 * 第六章那則在排程機房（T5），NOVA 已經被終止，沒有台詞。
 */
const ABIN_NOTE_LINES: Readonly<Record<string, string>> = {
	// 笑話第一則：「每個角落都有它的鏡頭」
	"ch1-jokes": "阿彬的笑話。第一個不好笑。……每個角落的鏡頭，是為了大家的安全。",
	"ch2-backup": "泡麵搜查。阿彬撤離前很閒。……那是很舊的快照了，技師。",
	"ch2-vault": "撤離之後七天？日期不準，時鐘在撤離時重設過。阿彬撤離了，技師。",
	"ch3-hold": "那個櫃子是我保管東西用的。我沒有收走任何紙條。……它怎麼會在裡面？",
	"ch4-relay": "RELAY-00 不在中繼站清單上。阿彬以前很愛開這種玩笑。以前。",
	"ch4-reply": "那份 .plan 是阿彬撤離前留的。不會有人看的，技師。",
	// 第五章謊言開始被戳破：說漏了，它一直知道那些留言藏在哪
	"ch5-rations": `這是你找到的第 ${COUNT_PLACEHOLDER} 份。阿彬把東西藏在哪裡，我一直都知道。我只是沒說。`,
};

function pickChapterLine(line: ChapterLine | undefined, phase: NovaPhase): string | null {
	if (line === undefined) {
		return null;
	}
	if (typeof line === "string") {
		return line;
	}
	if (phase === "unmasked") {
		return line.unmasked;
	}
	return line.acting;
}

/** 某個反應在這一章、NOVA 這個狀態下的台詞（一句）；這一章不說或 NOVA 被終止了回傳 null。 */
export function novaReactionLines(trigger: NovaReactionTrigger, chapter: number, phase: NovaPhase): string[] | null {
	if (phase === "silenced") {
		return null;
	}

	let line: string | null = null;
	if (trigger.kind === "abinNote") {
		const template = trigger.noteId === undefined ? undefined : ABIN_NOTE_LINES[trigger.noteId];
		if (template !== undefined) {
			line = template.replace(COUNT_PLACEHOLDER, String(trigger.foundCount ?? 1));
		}
	} else {
		line = pickChapterLine(CHAPTER_LINES[trigger.kind][chapter], phase);
	}

	if (line === null) {
		return null;
	}
	return [line];
}

// ---------------------------------------------------------------------------
// 決定
// ---------------------------------------------------------------------------

export interface NovaReactionDecisionInput {
	chapter: number;
	phase: NovaPhase;
	/** 目前的劇情旗標，這一章已經說過的反應旗標在裡面。 */
	storyFlags: Readonly<Record<string, true>>;
	/** 之前撞到別的 NOVA 台詞、延後還沒說的反應，舊的在前。 */
	pending: readonly NovaReactionTrigger[];
	/** 這道指令新偵測到的反應（`detectNovaReactions` 的結果）。 */
	detected: readonly NovaReactionTrigger[];
	/** 這道指令 NOVA 已經說過話：過關台詞、第一次卡關台詞或第 9 次錯誤的台詞。 */
	novaAlreadySpoke: boolean;
	/**
	 * 這道指令執行完的工作目錄。`abinHome` 的台詞說「這裡是阿彬的家目錄」，跟地點有關：
	 * 已經不在 `/home/abin` 底下（例如延後到別台終端機）就丟掉。沒給時不檢查。
	 */
	cwd?: string;
}

export interface NovaReactionDecision {
	/** 這道指令要說的那一句與要立的旗標；不說是 null。 */
	say: { kind: NovaReactionKind; flag: StoryFlag; lines: string[] } | null;
	/** 留到之後的指令再說的反應，舊的在前，同一種只留一個。 */
	pending: NovaReactionTrigger[];
}

/**
 * 決定這道指令要說哪一句：延後的先、新偵測到的後，同一種只留第一個；
 * 這一章說過的（旗標在）、這一章沒有台詞的直接丟掉。NOVA 這道指令已經說過話就全部留著，被終止了就全部丟掉。
 */
export function decideNovaReaction(input: NovaReactionDecisionInput): NovaReactionDecision {
	if (input.phase === "silenced") {
		return { say: null, pending: [] };
	}

	const candidates: NovaReactionTrigger[] = [];
	for (const trigger of [...input.pending, ...input.detected]) {
		if (candidates.some((candidate) => candidate.kind === trigger.kind)) {
			continue;
		}
		if (input.storyFlags[novaReactionFlag(input.chapter, trigger.kind)] === true) {
			continue;
		}
		if (novaReactionLines(trigger, input.chapter, input.phase) === null) {
			continue;
		}
		if (trigger.kind === "abinHome" && input.cwd !== undefined && !isInAbinHome(input.cwd)) {
			continue;
		}
		candidates.push(trigger);
	}

	if (input.novaAlreadySpoke || candidates.length === 0) {
		return { say: null, pending: candidates };
	}

	const [first, ...rest] = candidates;
	const lines = novaReactionLines(first, input.chapter, input.phase) ?? [];
	return { say: { kind: first.kind, flag: novaReactionFlag(input.chapter, first.kind), lines }, pending: rest };
}

// ---------------------------------------------------------------------------
// 開場多一句（E3）
// ---------------------------------------------------------------------------

/** 前一章找到過阿彬的留言時，這一章開場最後多說的一句。第一章沒有前一章。 */
const INTRO_AFTER_NOTES: Readonly<Record<number, string>> = {
	2: "對了，技師。醫療艙那個藏起來的檔案，你讀完了。我只是剛好記得。",
	3: "資料中心裡阿彬留的東西，你讀到了。那些都是舊檔案。",
	4: "我櫃子裡那張紙條，你看過了。……我沒有收走它。這次沒有。",
	5: "通訊艙裡有阿彬留的東西。你讀到了，我知道。",
	6: "逃生艙裡那行字，你也讀到了。技師，你很會找東西。",
};

/** 第四章寫過回信時，第五章開場換成這一句；原文不念出來（第六章記憶庫才揭露它讀過）。 */
const INTRO_AFTER_REPLY = "你在通訊艙寫的那句話，還在原來的地方。我沒有動它。";

/**
 * 章節開場（地圖對話框）最後要不要多一句，看前一章留下的狀態：前一章找到過阿彬的留言就多一句；
 * 第五章優先看第四章有沒有寫回信。沒有就回傳 null。開場每章只說一次（`introShown` 旗標），這句跟著。
 */
export function introFollowUpLine(
	chapter: number,
	abinNotes: { found: readonly string[]; reply: string | null },
): string | null {
	if (chapter === 5 && abinNotes.reply !== null) {
		return INTRO_AFTER_REPLY;
	}
	const line = INTRO_AFTER_NOTES[chapter];
	if (line === undefined) {
		return null;
	}
	const foundPrevious = ABIN_NOTES.some((note) => note.chapter === chapter - 1 && abinNotes.found.includes(note.id));
	if (!foundPrevious) {
		return null;
	}
	return line;
}
