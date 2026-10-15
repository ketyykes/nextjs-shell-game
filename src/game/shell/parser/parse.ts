/**
 * 指令列解析入口。
 *
 * 流程：
 * 1. 先找全形字元，有就回 `FULLWIDTH_CHAR`（優先於其他錯誤，因為這是繁中玩家最常見的失誤）。
 * 2. tokenize（有給 `env` 時順便做變數展開，有給 `substitute` 時順便執行指令替換），引號沒關回 `UNCLOSED_QUOTE`。
 * 3. 依 `;`、`&&`、`||` 切成好幾段（`parseCommandList`），沒有任何 token（空輸入、全空白、只剩空展開）時一段都沒有。
 * 4. 每一段依 `|` 切成多個指令；每個指令的第一個 word 是指令名，其餘是參數，重導向可以寫在指令的任何位置。
 *    `;`、`&&`、`||` 比 `|` 鬆，所以 `cat a | sort > b && cat b` 是兩段，第一段是帶重導向的管線。
 * 5. 沒給 `substitute` 時，`$( )` 與反引號裡的原文也照同一套規則檢查（巢狀的一層一層檢查），
 *    任一層有語法錯誤整行就回錯誤，跟 bash 一樣先檢查完整行才執行（第十九場）。
 *
 * 管線與重導向的規則：
 * - `|` 的前面或後面沒有指令（`ls |`、`| sort`、`ls | | sort`）回 `EMPTY_COMMAND`，detail 是 `|`。
 * - 重導向符號後面緊接的不是 word（行尾或另一個符號）回 `MISSING_REDIRECT_TARGET`，detail 是那個符號；
 *   `2>&1` 不需要檔名。檔名之後的 word 照樣是指令的參數（`ls > out -a` 等於 `ls -a > out`，bash 行為）。
 * - 標準輸出的重導向（`>`、`>>`、`1>`、`1>>`、`&>`、`&>>`）一條管線只能有一個，而且只能在最後一個指令：
 *   後面再接 `|`（`ls > a | sort`）回 `EMPTY_COMMAND`，detail 是 `|`；寫第二個（`ls > a > b`）回 `EMPTY_COMMAND`，detail 是第二個符號。
 * - 每個指令可以各有一個 `<`（第十九場，讀檔當 stdin，管線中間的也會蓋掉前一個指令的輸出，bash 行為）
 *   與一個錯誤輸出重導向（`2>`、`2>>`、`2>&1`、`&>`、`&>>`），寫兩次回 `EMPTY_COMMAND`，detail 是第二個符號。
 * - `2>&1` 照 bash 的順序換算：寫在 `>` 後面時錯誤訊息進同一個檔案，寫在前面（或沒有 `>`）時錯誤訊息走標準輸出原本的去處；
 *   寫在管線中間（`cmd 2>&1 | grep x`，把錯誤接進管線）不支援，回 `UNSUPPORTED_SYNTAX`，detail 是 `2>&1 |`。
 * - 只有重導向沒有指令（`> out`、`< a`）回 `EMPTY_COMMAND`，detail 是第一個重導向符號；
 *   緊接在 `|` 後面（`ls | > out`）則是 `|` 後面沒指令，detail 是 `|`。
 *
 * `parseCommandList` 回傳每一段的連接符號、原文與管線，給 shell 依序執行；
 * `parseCommandLineDetailed` 只回第一段，額外保留每個 word 是否被引號包住，給 shell 判斷要不要做萬用字元展開；
 * `parseCommandLine` 是契約型別的版本，只留純字串（指令名、參數與標準輸出的重導向）。
 */

import { findFullwidthChar } from "./fullwidth";
import { tokenize } from "./tokenizer";
import type { ErrorRedirect, ListConnector, ParseError, ParseOptions, ParseResult, Redirect, Token } from "../types";

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
	/** `<` 的檔名（第十九場），讀它的內容當這個指令的 stdin；沒有 `<` 時沒有這個欄位。 */
	input?: string;
	/** 錯誤輸出重導向（第十九場），見 `ErrorRedirect`；沒有時沒有這個欄位。 */
	stderr?: ErrorRedirect;
}

/** 保留引號資訊的管線。`redirect` 是最後一個指令的標準輸出重導向。 */
export interface DetailedPipeline {
	commands: DetailedCommand[];
	redirect: Redirect | null;
}

export type DetailedParseResult = { ok: true; pipeline: DetailedPipeline | null } | { ok: false; error: ParseError };

/** 用 `;`、`&&`、`||` 串起來的其中一段。 */
export interface DetailedListItem {
	/** 這一段前面的連接符號，第一段是 null。 */
	connector: ListConnector | null;
	/** 這一段的原文（去掉前後空白），shell 執行到這一段時用當下的環境變數重新解析。 */
	source: string;
	pipeline: DetailedPipeline;
}

export type DetailedListParseResult = { ok: true; items: DetailedListItem[] } | { ok: false; error: ParseError };

/** 依 `;`、`&&`、`||` 切開後、還沒組成管線的一段。 */
interface RawSegment {
	tokens: Token[];
	connector: ListConnector | null;
	/** 這一段在輸入裡的範圍（字元索引，含頭不含尾），用來切原文。 */
	start: number;
	end: number;
}

type PipelineTokensResult = { ok: true; pipeline: DetailedPipeline } | { ok: false; error: ParseError };

/** 重導向符號在等的檔名要用在哪裡：標準輸出、輸入、錯誤輸出，或 `&>` 的兩者。 */
type RedirectTargetSlot = "stdout" | "stdin" | "stderr" | "both";

/** 讀到重導向符號、還在等下一個 word 當檔名。 */
interface PendingTarget {
	slot: RedirectTargetSlot;
	kind: Redirect["kind"];
	/** 玩家打的符號，檔名缺了時當錯誤的 detail。 */
	operator: string;
}

/** 正在累積中的一個指令。 */
interface CommandBuilder {
	words: ParsedWord[];
	input?: string;
	stderr?: ErrorRedirect;
	/** 這個指令的第一個重導向符號；整個指令沒有 word 時當錯誤的 detail。 */
	firstOperator: string | null;
}

function emptyCommandError(detail: string): PipelineTokensResult {
	return { ok: false, error: { code: "EMPTY_COMMAND", detail } };
}

function toWord(token: Token): ParsedWord {
	return { value: token.value, quoted: token.quoted };
}

function newCommandBuilder(): CommandBuilder {
	return { words: [], firstOperator: null };
}

/** 組成指令；`input`、`stderr` 沒有就不放欄位。呼叫端要先確定 `builder.words` 不是空的。 */
function toCommand(builder: CommandBuilder): DetailedCommand {
	const [name, ...args] = builder.words;
	const command: DetailedCommand = { name, args };
	if (builder.input !== undefined) {
		command.input = builder.input;
	}
	if (builder.stderr !== undefined) {
		command.stderr = builder.stderr;
	}
	return command;
}

/** 重導向符號在等的檔名用在哪裡；不是重導向符號回 null。 */
function pendingTargetOf(token: Token): PendingTarget | null {
	switch (token.kind) {
		case "redirect":
			return { slot: "stdout", kind: "overwrite", operator: token.value };
		case "redirectAppend":
			return { slot: "stdout", kind: "append", operator: token.value };
		case "redirectIn":
			return { slot: "stdin", kind: "overwrite", operator: token.value };
		case "redirectErr":
			return { slot: "stderr", kind: "overwrite", operator: token.value };
		case "redirectErrAppend":
			return { slot: "stderr", kind: "append", operator: token.value };
		case "redirectBoth":
			return { slot: "both", kind: "overwrite", operator: token.value };
		case "redirectBothAppend":
			return { slot: "both", kind: "append", operator: token.value };
		default:
			return null;
	}
}

/**
 * 把非空的 token 序列組成管線。
 * 呼叫端要先確定 `tokens` 至少有一個元素。
 */
export function parsePipelineTokens(tokens: Token[]): PipelineTokensResult {
	const commands: DetailedCommand[] = [];
	let current = newCommandBuilder();
	let redirect: Redirect | null = null;
	let pending: PendingTarget | null = null;

	for (const token of tokens) {
		if (pending !== null) {
			if (token.kind !== "word") {
				return { ok: false, error: { code: "MISSING_REDIRECT_TARGET", detail: pending.operator } };
			}
			const target = token.value;
			if (pending.slot === "stdin") {
				current.input = target;
			} else if (pending.slot === "stderr") {
				current.stderr = { kind: pending.kind, target };
			} else {
				redirect = { kind: pending.kind, target };
				if (pending.slot === "both") {
					current.stderr = { kind: pending.kind, target };
				}
			}
			pending = null;
			continue;
		}

		if (token.kind === "word") {
			current.words.push(toWord(token));
			continue;
		}

		if (token.kind === "pipe") {
			if (current.words.length === 0) {
				return emptyCommandError("|");
			}
			// 標準輸出已經導進檔案了，沒有東西能接給 | 右邊
			if (redirect !== null) {
				return emptyCommandError("|");
			}
			if (current.stderr?.kind === "toStdout") {
				return { ok: false, error: { code: "UNSUPPORTED_SYNTAX", detail: "2>&1 |" } };
			}
			commands.push(toCommand(current));
			current = newCommandBuilder();
			continue;
		}

		// 以下都是重導向符號（`;`、`&&`、`||` 已經由 `parseCommandList` 切掉）
		if (current.firstOperator === null) {
			current.firstOperator = token.value;
		}

		const writesStdout = token.kind === "redirect" || token.kind === "redirectAppend";
		const writesBoth = token.kind === "redirectBoth" || token.kind === "redirectBothAppend";
		const writesStderr = token.kind === "redirectErr" || token.kind === "redirectErrAppend";
		if ((writesStdout || writesBoth) && redirect !== null) {
			return emptyCommandError(token.value);
		}
		if ((writesBoth || writesStderr || token.kind === "redirectErrToOut") && current.stderr !== undefined) {
			return emptyCommandError(token.value);
		}
		if (token.kind === "redirectIn" && current.input !== undefined) {
			return emptyCommandError(token.value);
		}

		if (token.kind === "redirectErrToOut") {
			// bash 的 fd 複製照順序：> 在前面就進同一個檔案，否則走標準輸出原本的去處
			if (redirect === null) {
				current.stderr = { kind: "toStdout" };
			} else {
				current.stderr = { kind: redirect.kind, target: redirect.target };
			}
			continue;
		}

		pending = pendingTargetOf(token);
		if (pending === null) {
			return emptyCommandError(token.value);
		}
	}

	if (pending !== null) {
		return { ok: false, error: { code: "MISSING_REDIRECT_TARGET", detail: pending.operator } };
	}
	if (current.words.length === 0) {
		// 結尾是 `|`，或 `|` 後面只有重導向
		if (commands.length > 0) {
			return emptyCommandError("|");
		}
		// 整條管線只有重導向，沒有指令（空 token 序列由呼叫端先擋掉）
		return emptyCommandError(current.firstOperator ?? "|");
	}
	commands.push(toCommand(current));

	return { ok: true, pipeline: { commands, redirect } };
}

/** `;`、`&&`、`||` token 對應的連接符號，其他 token 回 null。 */
function toConnector(token: Token): ListConnector | null {
	if (token.kind === "semicolon") {
		return ";";
	}
	if (token.kind === "and") {
		return "&&";
	}
	if (token.kind === "or") {
		return "||";
	}
	return null;
}

/** 依 `;`、`&&`、`||` 把 token 切成好幾段，空的段落也保留，由呼叫端判斷合不合法。 */
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
 * 解析一整行，依 `;`、`&&`、`||` 切成依序執行的好幾段，每一段各自是一條管線（三者都比 `|` 鬆）。
 *
 * 跟 bash 一樣先解析整行才執行，所以任何一段有語法錯誤都回錯誤、一段都不執行。
 * 空的段落：開頭（`; ls`）、連續兩個符號（`ls ;; pwd`、`ls && ; pwd`）回 `EMPTY_COMMAND`，
 * detail 是左邊沒有指令的那個符號；結尾的 `&&`、`||`（`cd logs &&`）也是，detail 是那個符號；
 * 只有結尾的 `;`（`ls ;`）合法，直接忽略。空輸入回傳空陣列。
 * 沒給 `substitute` 時，指令替換裡的原文也遞迴檢查一次（見檔頭第 5 點）。
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
			if (segment.connector === "&&" || segment.connector === "||") {
				return { ok: false, error: { code: "EMPTY_COMMAND", detail: segment.connector } };
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

	// 沒執行指令替換時，裡面的原文也要是合法的一行（巢狀的會在這裡遞迴下去）
	if (options.substitute === undefined) {
		for (const source of tokenizeResult.substitutions) {
			const inner = parseCommandList(source);
			if (!inner.ok) {
				return inner;
			}
		}
	}

	return { ok: true, items };
}

/** 解析一整行，保留每個 word 的引號資訊；用 `;`、`&&`、`||` 串了好幾段時只回第一段，完整的清單用 `parseCommandList`。 */
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
 * 用 `;`、`&&`、`||` 串了好幾段時兩者都是第一段的（目標判定逐段看 `ShellExecution.segments`）。
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
