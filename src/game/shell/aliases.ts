/**
 * 別名（第十九場的 `alias`）：檢查別名的內容、在執行前展開。純函式，不碰 shell 的狀態。
 *
 * 展開規則照 bash：
 * - 只看每段管線的第一個 word（指令名），參數裡的同名字不展開。
 * - 被引號包住或反斜線跳脫的指令名不展開（`\ls`、`'ls'` 是繞過別名的寫法）。
 * - 展開後的內容重新 tokenize（變數與 `~` 用執行當下的值展開），原本的參數接在後面。
 * - 展開結果的第一個 word 是別的別名時再展開，但同一個名字不會展開第二次（`alias ls='ls -a'` 不會無限展開）。
 * - 別名內容只能是一個指令或用 `|` 串起來的管線（`checkAliasValue` 在定義時就擋），裡面 `|` 後面的指令名也照規則展開。
 *
 * 跟 bash 的差別：別名內容結尾是空白時 bash 會連下一個 word 也檢查別名，這裡不做；
 * 同一行用 `;`、`&&` 先定義再使用時 bash 要到下一行才生效，這裡每一段執行到時才展開，所以馬上生效。
 */

import { parsePipelineTokens, tokenize } from "./parser";
import type { DetailedCommand, ParsedWord } from "./parser";
import type { ParseError, ParseOptions, Token } from "./types";

/** 別名內容的問題：空的、不是單純的指令或管線、或語法錯誤（引號沒關、不支援的符號）。 */
export type AliasValueProblem = { kind: "empty" } | { kind: "unsupported" } | { kind: "parse"; error: ParseError };

/** 別名內容只能有 word 與 `|`；`;`、`&&`、`>` 與之後新增的語法都不收。 */
function isAllowedToken(token: Token): boolean {
	return token.kind === "word" || token.kind === "pipe";
}

/**
 * 檢查別名的內容可不可以用，可以時回傳 null。
 * 只檢查結構，不展開變數與 `~`（那些在使用時才展開）。
 */
export function checkAliasValue(value: string): AliasValueProblem | null {
	const tokenized = tokenize(value);
	if (!tokenized.ok) {
		return { kind: "parse", error: tokenized.error };
	}

	const { tokens } = tokenized;
	if (tokens.length === 0) {
		return { kind: "empty" };
	}
	if (!tokens.every(isAllowedToken) || !parsePipelineTokens(tokens).ok) {
		return { kind: "unsupported" };
	}
	return null;
}

function toToken(word: ParsedWord): Token {
	return { kind: "word", value: word.value, quoted: word.quoted };
}

/** 展開一個指令；`expanding` 是這條展開鏈上已經展開過的名字。 */
function expandCommand(
	command: DetailedCommand,
	aliases: Readonly<Record<string, string>>,
	options: ParseOptions,
	expanding: ReadonlySet<string>,
): DetailedCommand[] {
	const name = command.name;
	if (name.quoted || !Object.hasOwn(aliases, name.value) || expanding.has(name.value)) {
		return [command];
	}

	const tokenized = tokenize(aliases[name.value], options);
	if (!tokenized.ok) {
		return [command];
	}
	const tokens = [...tokenized.tokens, ...command.args.map(toToken)];
	if (tokens.length === 0 || !tokens.every(isAllowedToken)) {
		return [command];
	}
	const parsed = parsePipelineTokens(tokens);
	if (!parsed.ok) {
		return [command];
	}

	const nextExpanding = new Set(expanding).add(name.value);
	return parsed.pipeline.commands.flatMap((expanded) => expandCommand(expanded, aliases, options, nextExpanding));
}

/**
 * 展開一段管線裡每個指令的別名，規則見檔頭。`options` 是執行當下的環境變數與家目錄。
 *
 * @example expandAliases(commandsOf("ll pod_06"), { ll: "ls -l" }, options) // ls -l pod_06
 */
export function expandAliases(
	commands: DetailedCommand[],
	aliases: Readonly<Record<string, string>>,
	options: ParseOptions,
): DetailedCommand[] {
	return commands.flatMap((command) => expandCommand(command, aliases, options, new Set()));
}
