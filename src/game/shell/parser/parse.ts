/**
 * 指令列解析入口。
 *
 * 流程：
 * 1. 先找全形字元，有就回 `FULLWIDTH_CHAR`（優先於其他錯誤，因為這是繁中玩家最常見的失誤）。
 * 2. tokenize（有給 `env` 時順便做變數展開），引號沒關回 `UNCLOSED_QUOTE`。
 * 3. 沒有任何 token（空輸入、全空白、只剩空展開）回 `{ ok: true, command: null, pipeline: null }`。
 * 4. 依 `|` 切成多個指令，結尾可接一個 `>` 或 `>>` 重導向；每個指令的第一個 word 是指令名，其餘是參數。
 *
 * 管線與重導向的規則：
 * - `|` 的前面或後面沒有指令（`ls |`、`| sort`、`ls | | sort`）回 `EMPTY_COMMAND`，detail 是 `|`。
 * - `>`、`>>` 後面緊接的不是 word（行尾或另一個符號）回 `MISSING_REDIRECT_TARGET`，detail 是那個符號。
 * - 重導向之後只允許 word：第一個是檔名，其餘併回最後一個指令的參數（`ls > out -a` 等於 `ls -a > out`，bash 行為）。
 *   之後再出現任何符號（`ls > a | sort`、`ls > a > b`）回 `EMPTY_COMMAND`，detail 是那個符號。
 * - 重導向前面沒有任何指令（`> out`）回 `EMPTY_COMMAND`，detail 是那個重導向符號；
 *   緊接在 `|` 後面（`ls | > out`）則是 `|` 後面沒指令，detail 是 `|`。
 *
 * `parseCommandLineDetailed` 額外保留每個 word 是否被引號包住，給 shell 判斷要不要做萬用字元展開；
 * `parseCommandLine` 是契約型別的版本，只留純字串。
 */

import { findFullwidthChar } from "./fullwidth";
import { tokenize } from "./tokenizer";
import type { ParseError, ParseOptions, ParseResult, Redirect, Token } from "../types";

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

/** 解析一整行，保留每個 word 的引號資訊。 */
export function parseCommandLineDetailed(input: string, options: ParseOptions = {}): DetailedParseResult {
	const fullwidthChar = findFullwidthChar(input);
	if (fullwidthChar !== null) {
		return { ok: false, error: { code: "FULLWIDTH_CHAR", detail: fullwidthChar } };
	}

	const tokenizeResult = tokenize(input, options);
	if (!tokenizeResult.ok) {
		return { ok: false, error: tokenizeResult.error };
	}

	const tokens = tokenizeResult.tokens;
	if (tokens.length === 0) {
		return { ok: true, pipeline: null };
	}

	return parsePipelineTokens(tokens);
}

/** 解析一整行，回傳契約型別：`command` 是管線的第一個指令，`pipeline` 是完整管線。 */
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
