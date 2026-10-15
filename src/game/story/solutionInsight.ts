/**
 * 過關時認可「提前用上還沒教的東西」（設計文件 4.9 過關回饋）。
 *
 * 目標判定只看結果不看寫法，會的玩家常用還沒教的指令或語法過關（第一章就 `grep`、第二章就 `|`）。
 * 這裡從過關那一行找出這些東西，交給過關流程在「目標達成」下面插一行認可，不評分、不說教。
 *
 * 偵測的東西（字串寫法跟各章 `teaches` 一致，同時也是旗標的 key）：
 * - 指令名：每一段實際執行的管線裡的每一個指令。
 * - 帶旗標的教學（`ls -a`、`grep -r`、`kill -9`、`chmod 644`……）：從章節清單裡帶空白的 `teaches` 自動收集，
 *   `-<字母>` 這種短選項支援合併寫法（`ls -la` 同時算 `ls -l` 與 `ls -a`），其他寫法要參數完全相同。
 *   只在指令本身已經會了（學過或這台正在教）時才認：指令本身也是新的就只認指令，免得同一行列出 `grep` 又列 `grep -r`。
 * - 語法：`|`、`>`、`>>`、`*`、`~`、`$變數`、`;`、`&&`。全部看 token，引號內與反斜線跳脫過的不算。
 *
 * 排除：已學過的、這台本身在教的、已經認可過的（劇情旗標 `insight.<概念>`）、遊戲本身的求助指令（`hint`、`help`），
 * 以及教學位置在前面章節的（只會在跳章之類的存檔出現，不能說「第 1 章才會正式介紹」）。
 *
 * 純函式，不碰 store；章節清單由呼叫端傳入，所以這個檔案不 import `@/game/chapters`（劇本會 import story，避免循環）。
 */

import { splitOptionsAndOperands } from "@/game/shell/commands/options";
import { parseCommandList, tokenize } from "@/game/shell/parser";
import type { DetailedCommand } from "@/game/shell/parser";
import { HOME_DIR, type ParseOptions, type ShellExecution, type Token } from "@/game/shell/types";
import type { ChapterDefinition, TerminalDefinition } from "./types";

/** 一個被認可的「提前用上」。 */
export interface SolutionInsight {
	/** 概念的寫法，跟 `teaches` 一致，例如 `grep`、`ls -a`、`|`、`$變數`。 */
	concept: string;
	/** 第幾章才教；不在任何一台的 `teaches` 裡（課表外）是 null。 */
	chapter: number | null;
	/** 跟過關的這台終端機同一章（訊息說「這一章就會教到」）。 */
	sameChapter: boolean;
}

export interface FindSolutionInsightsInput {
	/** 過關的那一次執行；用 `;`、`&&` 串了好幾段時看 `segments` 裡實際執行過的每一段。 */
	execution: ShellExecution;
	/** 過關的終端機，它的 `teaches` 不算「還沒教」。 */
	definition: TerminalDefinition;
	/** 過關**之前**的已學清單（store 的 `progress.learnedCommands`），有指令也有概念字串。 */
	learnedCommands: readonly string[];
	/** 目前的劇情旗標，`insight.<概念>` 在的就是認可過了。 */
	storyFlags: Readonly<Record<string, true>>;
	/** 依章節順序排好的全部章節，用來找每個概念第一次在哪裡教。 */
	chapters: readonly ChapterDefinition[];
}

/** 認可旗標的前綴。刻意不用 `ch<n>.`：重玩章節（只清 `ch<n>.` 前綴）不會重新認可，只有新遊戲會清。 */
export const INSIGHT_FLAG_PREFIX = "insight.";

/**
 * 不認可的指令：
 * - `hint`、`help` 是遊戲本身的求助指令，開場就告訴玩家有這兩個，不算 shell 技能。
 * - `sudo`、`exit`、`logout` 是彩蛋，在這座站一定被拒絕、什麼都沒做成，不能說是「自己找到的」解法。
 */
const SYSTEM_COMMANDS = new Set(["hint", "help", "explain", "sudo", "exit", "logout"]);

/** 語法概念在訊息裡的順序（指令一律排在語法前面）。 */
const SYNTAX_ORDER = ["|", ">", ">>", "*", "~", "$變數", ";", "&&"] as const;

type SyntaxConcept = (typeof SYNTAX_ORDER)[number];

/** `teaches` 裡帶旗標的教學，例如 `ls -a` 拆成指令 `ls` 與參數 `-a`。 */
interface FlaggedTeach {
	concept: string;
	command: string;
	arg: string;
}

/** 從一行裡偵測到、還沒過濾的概念。帶旗標的教學多記所屬的指令名，例如 `ls -a` 的 `ls`。 */
type UsedConcept =
	| { kind: "command"; concept: string }
	| { kind: "flagged"; concept: string; command: string }
	| { kind: "syntax"; concept: string };

/** 某個概念的認可旗標，例如 `insight.grep`、`insight.ls -a`。 */
export function insightFlag(concept: string): string {
	return `${INSIGHT_FLAG_PREFIX}${concept}`;
}

/** `teaches` 字串的指令名：`ls -a` 是 `ls`，`|` 就是 `|`。 */
function baseName(teach: string): string {
	return teach.trim().split(/\s+/)[0] ?? teach;
}

/** 短選項的寫法：一個 `-` 加一個英文字母，例如 `-a`、`-r`。 */
const SHORT_LETTER_OPTION = /^-[A-Za-z]$/;

/** 收集全部章節裡帶旗標的教學，依課表順序、去重。 */
function collectFlaggedTeaches(chapters: readonly ChapterDefinition[]): FlaggedTeach[] {
	const result: FlaggedTeach[] = [];
	for (const chapter of chapters) {
		for (const terminal of chapter.terminals) {
			for (const teach of terminal.teaches) {
				const parts = teach.trim().split(/\s+/);
				if (parts.length !== 2 || result.some((item) => item.concept === teach)) {
					continue;
				}
				result.push({ concept: teach, command: parts[0], arg: parts[1] });
			}
		}
	}
	return result;
}

/**
 * 指令有沒有用到這個帶旗標的教學。
 * `-<字母>` 跟目標判定的 `commandHasOption` 同一套規則（支援 `-la` 這種合併寫法，`--all` 這種長選項不算）；
 * 其他寫法（`-9`、`+r`、`644`）要有一個參數完全相同。
 */
function usesFlaggedTeach(args: string[], teach: FlaggedTeach): boolean {
	if (SHORT_LETTER_OPTION.test(teach.arg)) {
		const letter = teach.arg.slice(1);
		const { options } = splitOptionsAndOperands(args);
		return options.some((option) => !option.startsWith("--") && option.slice(1).includes(letter));
	}
	return args.includes(teach.arg);
}

/** 兩種解析選項切出來的 token 不一樣，代表那個選項（變數展開或 `~` 展開）真的作用到了。 */
function tokensDiffer(input: string, options: ParseOptions): boolean {
	const plain = tokenize(input);
	const expanded = tokenize(input, options);
	if (!plain.ok || !expanded.ok) {
		return false;
	}
	return JSON.stringify(plain.tokens) !== JSON.stringify(expanded.tokens);
}

/** 沒被引號包住、也沒被反斜線跳脫的 `*`，shell 會拿去做萬用字元展開。 */
function isUnquotedGlob(token: Token): boolean {
	return token.kind === "word" && !token.quoted && token.value.includes("*");
}

/** 一段（`;`、`&&` 切開後實際執行的其中一段）用到的指令與語法。 */
function scanSegment(segment: ShellExecution, commands: DetailedCommand[], syntax: Set<SyntaxConcept>): void {
	// 指令名與參數照 shell 執行時的樣子展開變數（跟目標判定一樣用執行後的 env）
	const list = parseCommandList(segment.input, { env: segment.env });
	if (list.ok) {
		for (const item of list.items) {
			commands.push(...item.pipeline.commands);
			const redirect = item.pipeline.redirect;
			if (redirect !== null) {
				syntax.add(redirect.kind === "append" ? ">>" : ">");
			}
		}
	}

	// 語法看沒展開過的 token：引號內、跳脫過的都已經是 word 的一部分，不會被誤認
	const raw = tokenize(segment.input);
	if (raw.ok) {
		if (raw.tokens.some((token) => token.kind === "pipe")) {
			syntax.add("|");
		}
		if (raw.tokens.some(isUnquotedGlob)) {
			syntax.add("*");
		}
	}
	// 空的 env 會把每個能展開的 `$NAME` 換成空字串，token 有變就是用到了變數
	if (tokensDiffer(segment.input, { env: {} })) {
		syntax.add("$變數");
	}
	if (tokensDiffer(segment.input, { home: HOME_DIR })) {
		syntax.add("~");
	}
}

/** `;`、`&&` 看整行：結尾多打的 `;` 沒有真的串起第二段，不算。 */
function scanConnectors(input: string, syntax: Set<SyntaxConcept>): void {
	const raw = tokenize(input);
	if (!raw.ok) {
		return;
	}
	raw.tokens.forEach((token, index) => {
		const hasNext = index < raw.tokens.length - 1;
		if (token.kind === "semicolon" && hasNext) {
			syntax.add(";");
		}
		if (token.kind === "and") {
			syntax.add("&&");
		}
	});
}

/** 這一行用到的全部概念，指令依出現順序（每個指令後面接它用到的旗標教學），接著是語法。 */
function detectUsedConcepts(execution: ShellExecution, flaggedTeaches: FlaggedTeach[]): UsedConcept[] {
	const commands: DetailedCommand[] = [];
	const syntax = new Set<SyntaxConcept>();
	for (const segment of execution.segments ?? [execution]) {
		scanSegment(segment, commands, syntax);
	}
	scanConnectors(execution.input, syntax);

	const used: UsedConcept[] = [];
	const seen = new Set<string>();
	const add = (item: UsedConcept): void => {
		if (!seen.has(item.concept)) {
			seen.add(item.concept);
			used.push(item);
		}
	};

	for (const command of commands) {
		const name = command.name.value;
		add({ concept: name, kind: "command" });
		const args = command.args.map((arg) => arg.value);
		for (const teach of flaggedTeaches) {
			if (teach.command === name && usesFlaggedTeach(args, teach)) {
				add({ concept: teach.concept, kind: "flagged", command: name });
			}
		}
	}
	for (const concept of SYNTAX_ORDER) {
		if (syntax.has(concept)) {
			add({ concept, kind: "syntax" });
		}
	}
	return used;
}

/** 清單（`teaches` 或已學清單）裡有沒有這個指令；只比指令名，學過 `ls -a` 也算會 `ls`。 */
function listCoversCommand(list: readonly string[], name: string): boolean {
	return list.some((entry) => baseName(entry) === name);
}

/** 清單裡有沒有這個概念：指令比指令名，帶旗標的教學與語法要字串完全相同。 */
function listCovers(list: readonly string[], item: UsedConcept): boolean {
	if (item.kind === "command") {
		return listCoversCommand(list, item.concept);
	}
	return list.includes(item.concept);
}

/** 依課表順序找第一台教這個概念的終端機，回傳章節號；課表外回傳 null。 */
function findTeachingChapter(chapters: readonly ChapterDefinition[], item: UsedConcept): number | null {
	for (const chapter of chapters) {
		if (chapter.terminals.some((terminal) => listCovers(terminal.teaches, item))) {
			return chapter.chapter;
		}
	}
	return null;
}

/**
 * 找出過關這一行裡值得認可的「提前用上」，順序就是訊息裡列出的順序。
 * 沒有就回空陣列，呼叫端不插認可行。
 */
export function findSolutionInsights(input: FindSolutionInsightsInput): SolutionInsight[] {
	const { execution, definition, learnedCommands, storyFlags, chapters } = input;
	const currentChapter =
		chapters.find((chapter) => chapter.terminals.some((terminal) => terminal.id === definition.id))?.chapter ?? null;
	/** 已經會的：學過的，加上這台正在教的。 */
	const known = [...learnedCommands, ...definition.teaches];
	const insights: SolutionInsight[] = [];

	for (const item of detectUsedConcepts(execution, collectFlaggedTeaches(chapters))) {
		if (item.kind === "command" && SYSTEM_COMMANDS.has(item.concept)) {
			continue;
		}
		if (listCovers(known, item) || storyFlags[insightFlag(item.concept)] === true) {
			continue;
		}
		// 指令本身也還沒會時只認指令，旗標留到指令學會之後
		if (item.kind === "flagged" && !listCoversCommand(known, item.command)) {
			continue;
		}

		const chapter = findTeachingChapter(chapters, item);
		const taughtEarlier = chapter !== null && currentChapter !== null && chapter < currentChapter;
		if (taughtEarlier) {
			continue;
		}
		insights.push({ concept: item.concept, chapter, sameChapter: chapter !== null && chapter === currentChapter });
	}

	return insights;
}
