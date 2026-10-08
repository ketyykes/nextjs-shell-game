/**
 * 指令列解析入口。
 *
 * 流程：
 * 1. 先找全形字元，有就回 `FULLWIDTH_CHAR`（優先於其他錯誤，因為這是繁中玩家最常見的失誤）。
 * 2. tokenize（有給 `env` 時順便做變數展開），引號沒關回 `UNCLOSED_QUOTE`。
 * 3. 依 `;`、`&&` 切成好幾段（`parseCommandList`），沒有任何 token（空輸入、全空白、只剩空展開）時一段都沒有。
 * 4. 每一段依 `|` 切成多個指令，結尾可接一個 `>` 或 `>>` 重導向；每個指令的第一個 word 是指令名，其餘是參數。
 *    `;`、`&&` 比 `|` 鬆，所以 `cat a | sort > b && cat b` 是兩段，第一段是帶重導向的管線。
 *
 * 管線與重導向的規則：
 * - `|` 的前面或後面沒有指令（`ls |`、`| sort`、`ls | | sort`）回 `EMPTY_COMMAND`，detail 是 `|`。
 * - `>`、`>>` 後面緊接的不是 word（行尾或另一個符號）回 `MISSING_REDIRECT_TARGET`，detail 是那個符號。
 * - 重導向之後只允許 word：第一個是檔名，其餘併回最後一個指令的參數（`ls > out -a` 等於 `ls -a > out`，bash 行為）。
 *   之後再出現任何符號（`ls > a | sort`、`ls > a > b`）回 `EMPTY_COMMAND`，detail 是那個符號。
 * - 重導向前面沒有任何指令（`> out`）回 `EMPTY_COMMAND`，detail 是那個重導向符號；
 *   緊接在 `|` 後面（`ls | > out`）則是 `|` 後面沒指令，detail 是 `|`。
 *
 * `parseCommandList` 回傳每一段的連接符號、原文與管線，給 shell 依序執行；
 * `parseCommandLineDetailed` 只回第一段，額外保留每個 word 是否被引號包住，給 shell 判斷要不要做萬用字元展開；
 * `parseCommandLine` 是契約型別的版本，只留純字串。
 */

import { findFullwidthChar } from "./fullwidth";
import { tokenize } from "./tokenizer";
import type { ListConnector, ParseError, ParseOptions, ParseResult, Redirect, Token } from "../types";

/** 保留引號資訊的 word。 */
export interface ParsedWord {
	value: string;
	/** 是否曾被引號包住；被包住的不做萬用字元展開。 */
	quoted: boolean;
}

/** 保留引號資訊的單一指令。 */
export interface DetailedCommand {
	name: ParsedWord;
	args: ParsedWord[];
}

/** 保留引號資訊的管線。 */
export interface DetailedPipeline {
	commands: DetailedCommand[];
	redirect: Redirect | null;
}

export type DetailedParseResult = { ok: true; pipeline: DetailedPipeline | null } | { ok: false; error: ParseError };

/** 用 `;`、`&&` 串起來的其中一段。 */
export interface DetailedListItem {
	/** 這一段前面的連接符號，第一段是 null。 */
	connector: ListConnector | null;
	/** 這一段的原文（去掉前後空白），shell 執行到這一段時用當下的環境變數重新解析。 */
	source: string;
	pipeline: DetailedPipeline;
}

export type DetailedListParseResult = { ok: true; items: DetailedListItem[] } | { ok: false; error: ParseError };

/** 依 `;`、`&&` 切開後、還沒組成管線的一段。 */
interface RawSegment {
	tokens: Token[];
	connector: ListConnector | null;
	/** 這一段在輸入裡的範圍（字元索引，含頭不含尾），用來切原文。 */
	start: number;
	end: number;
}

type PipelineTokensResult = { ok: true; pipeline: DetailedPipeline } | { ok: false; error: ParseError };

/** 掃描 token 時所在的階段。 */
type PipelinePhase = "commands" | "redirectTarget" | "afterRedirect";

function emptyCommandError(detail: string): PipelineTokensResult {
	return { ok: false, error: { code: "EMPTY_COMMAND", detail } };
}

function toWord(token: Token): ParsedWord {
	return { value: token.value, quoted: token.quoted };
}

function toCommand(words: ParsedWord[]): DetailedCommand {
	const [name, ...args] = words;
	return { name, args };
}

/**
 * 把非空的 token 序列組成管線。
 * 呼叫端要先確定 `tokens` 至少有一個元素。
 */
export function parsePipelineTokens(tokens: Token[]): PipelineTokensResult {
	const commands: DetailedCommand[] = [];
	let current: ParsedWord[] = [];
	let phase: PipelinePhase = "commands";
	let redirectKind: Redirect["kind"] = "overwrite";
	let redirectOperator = "";
	let redirect: Redirect | null = null;

	for (const token of tokens) {
		if (phase === "redirectTarget") {
			if (token.kind !== "word") {
				return { ok: false, error: { code: "MISSING_REDIRECT_TARGET", detail: redirectOperator } };
			}
			redirect = { kind: redirectKind, target: token.value };
			phase = "afterRedirect";
			continue;
		}

		if (phase === "afterRedirect") {
			if (token.kind !== "word") {
				return emptyCommandError(token.value);
			}
			// 重導向檔名後面的 word 併回最後一個指令的參數
			current.push(toWord(token));
			continue;
		}

		// 以下是 commands 階段
		if (token.kind === "word") {
			current.push(toWord(token));
			continue;
		}

		if (token.kind === "pipe") {
			if (current.length === 0) {
				return emptyCommandError("|");
			}
			commands.push(toCommand(current));
			current = [];
			continue;
		}

		// 重導向符號
		if (current.length === 0) {
			if (commands.length > 0) {
				return emptyCommandError("|");
			}
			return emptyCommandError(token.value);
		}
		redirectKind = token.kind === "redirectAppend" ? "append" : "overwrite";
		redirectOperator = token.value;
		phase = "redirectTarget";
	}

	if (phase === "redirectTarget") {
		return { ok: false, error: { code: "MISSING_REDIRECT_TARGET", detail: redirectOperator } };
	}
	if (current.length === 0) {
		// 只有在結尾是 `|` 時才會走到這裡（空 token 序列由呼叫端先擋掉）
		return emptyCommandError("|");
	}
	commands.push(toCommand(current));

	return { ok: true, pipeline: { commands, redirect } };
}

/** `;`、`&&` token 對應的連接符號，其他 token 回 null。 */
function toConnector(token: Token): ListConnector | null {
	if (token.kind === "semicolon") {
		return ";";
	}
	if (token.kind === "and") {
		return "&&";
	}
	return null;
}

/** 依 `;`、`&&` 把 token 切成好幾段，空的段落也保留，由呼叫端判斷合不合法。 */
function splitSegments(tokens: Token[], inputLength: number): RawSegment[] {
	const segments: RawSegment[] = [];
	let current: Token[] = [];
	let connector: ListConnector | null = null;
	let start = 0;

	for (const token of tokens) {
		const next = toConnector(token);
		if (next === null) {
			current.push(token);
			continue;
		}

		const offset = token.offset ?? start;
		segments.push({ tokens: current, connector, start, end: offset });
		current = [];
		connector = next;
		start = offset + Array.from(token.value).length;
	}

	segments.push({ tokens: current, connector, start, end: inputLength });
	return segments;
}

/**
 * 去掉一段原文前後的空白。
 * 結尾的空白如果被反斜線跳脫（`echo a\ `，結尾連續奇數個 `\`），那個空白是 word 的一部分，要留一個。
 */
function trimSegmentSource(source: string): string {
	const trimmed = source.trim();
	const trailingBackslashes = trimmed.length - trimmed.replace(/\\+$/, "").length;
	if (trailingBackslashes % 2 === 0) {
		return trimmed;
	}

	const leading = source.length - source.trimStart().length;
	return source.slice(leading, leading + trimmed.length + 1);
}

/**
 * 解析一整行，依 `;`、`&&` 切成依序執行的好幾段，每一段各自是一條管線（`;`、`&&` 比 `|` 鬆）。
 *
 * 跟 bash 一樣先解析整行才執行，所以任何一段有語法錯誤都回錯誤、一段都不執行。
 * 空的段落：開頭（`; ls`）、連續兩個符號（`ls ;; pwd`、`ls && ; pwd`）回 `EMPTY_COMMAND`，
 * detail 是左邊沒有指令的那個符號；結尾的 `&&`（`cd logs &&`）也是，detail 是 `&&`；
 * 只有結尾的 `;`（`ls ;`）合法，直接忽略。空輸入回傳空陣列。
 */
export function parseCommandList(input: string, options: ParseOptions = {}): DetailedListParseResult {
	const fullwidthChar = findFullwidthChar(input);
	if (fullwidthChar !== null) {
		return { ok: false, error: { code: "FULLWIDTH_CHAR", detail: fullwidthChar } };
	}

	const tokenizeResult = tokenize(input, options);
	if (!tokenizeResult.ok) {
		return { ok: false, error: tokenizeResult.error };
	}

	const chars = Array.from(input);
	const segments = splitSegments(tokenizeResult.tokens, chars.length);
	const items: DetailedListItem[] = [];

	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const isLast = index === segments.length - 1;

		if (segment.tokens.length === 0) {
			if (!isLast) {
				return { ok: false, error: { code: "EMPTY_COMMAND", detail: segments[index + 1].connector ?? ";" } };
			}
			if (segment.connector === "&&") {
				return { ok: false, error: { code: "EMPTY_COMMAND", detail: "&&" } };
			}
			// 結尾的 `;`，或整行沒有任何 token
			continue;
		}

		const parsed = parsePipelineTokens(segment.tokens);
		if (!parsed.ok) {
			return parsed;
		}

		items.push({
			connector: segment.connector,
			source: trimSegmentSource(chars.slice(segment.start, segment.end).join("")),
			pipeline: parsed.pipeline,
		});
	}

	return { ok: true, items };
}

/** 解析一整行，保留每個 word 的引號資訊；用 `;`、`&&` 串了好幾段時只回第一段，完整的清單用 `parseCommandList`。 */
export function parseCommandLineDetailed(input: string, options: ParseOptions = {}): DetailedParseResult {
	const list = parseCommandList(input, options);
	if (!list.ok) {
		return list;
	}

	if (list.items.length === 0) {
		return { ok: true, pipeline: null };
	}

	return { ok: true, pipeline: list.items[0].pipeline };
}

/**
 * 解析一整行，回傳契約型別：`command` 是管線的第一個指令，`pipeline` 是完整管線。
 * 用 `;`、`&&` 串了好幾段時兩者都是第一段的（目標判定逐段看 `ShellExecution.segments`）。
 */
export function parseCommandLine(input: string, options: ParseOptions = {}): ParseResult {
	const detailed = parseCommandLineDetailed(input, options);
	if (!detailed.ok) {
		return detailed;
	}
	if (detailed.pipeline === null) {
		return { ok: true, command: null, pipeline: null };
	}

	const commands = detailed.pipeline.commands.map((command) => ({
		name: command.name.value,
		args: command.args.map((arg) => arg.value),
	}));
	return {
		ok: true,
		command: commands[0],
		pipeline: { commands, redirect: detailed.pipeline.redirect },
	};
}
