/**
 * 指令列 tokenizer。
 *
 * 用明確的狀態機逐字掃描，三種狀態：
 * - `normal`：引號外，空白分隔 token，`|`、`>`、`>>` 切成符號 token。
 * - `singleQuote`：單引號內，一切照抄，直到下一個 `'`。
 * - `doubleQuote`：雙引號內，照抄直到下一個 `"`；
 *   只處理兩種跳脫：`\"` 變成字面的 `"`、`\\` 變成字面的 `\`，
 *   其他反斜線原樣保留（例如 `"a\b"` 是 `a\b`），跟 bash 在雙引號內的行為一致。
 *   第一章不做變數展開，`$` 照抄。
 *
 * 引號外的反斜線目前「不」當跳脫字元，原樣保留（例如 `a\ b` 會切成 `a\` 與 `b`）。
 * 第一章檔名沒有空白，之後若要支援 `cd my\ dir` 再加。
 *
 * 引號可以出現在 token 中間，例如 `ab"c d"e` 是一個 token `abc de`，`quoted` 為 true。
 */

import type { ParseError, Token } from "../types";

export type TokenizeResult = { ok: true; tokens: Token[] } | { ok: false; error: ParseError };

type TokenizerState = "normal" | "singleQuote" | "doubleQuote";

function isWhitespace(char: string): boolean {
	return char === " " || char === "\t";
}

/**
 * 把一行輸入切成 token。
 * 引號沒關時回傳 `UNCLOSED_QUOTE`，`detail` 是那個引號字元。
 */
export function tokenize(input: string): TokenizeResult {
	const tokens: Token[] = [];
	const chars = Array.from(input);

	let state: TokenizerState = "normal";
	/** 目前累積中的 word 內容。 */
	let buffer = "";
	/**
	 * 目前是否有一個 word 正在累積。
	 * 不能只看 `buffer` 是否為空，因為 `""` 要產生一個空字串 token。
	 */
	let hasWord = false;
	/** 目前的 word 是否曾被引號包住。 */
	let wordQuoted = false;

	const flushWord = (): void => {
		if (hasWord) {
			tokens.push({ kind: "word", value: buffer, quoted: wordQuoted });
		}
		buffer = "";
		hasWord = false;
		wordQuoted = false;
	};

	let index = 0;
	while (index < chars.length) {
		const char = chars[index];

		if (state === "singleQuote") {
			if (char === "'") {
				state = "normal";
			} else {
				buffer += char;
			}
			index += 1;
			continue;
		}

		if (state === "doubleQuote") {
			if (char === '"') {
				state = "normal";
				index += 1;
				continue;
			}
			if (char === "\\") {
				const next = chars[index + 1];
				if (next === '"' || next === "\\") {
					buffer += next;
					index += 2;
					continue;
				}
			}
			buffer += char;
			index += 1;
			continue;
		}

		// 以下是 normal 狀態
		if (isWhitespace(char)) {
			flushWord();
			index += 1;
			continue;
		}

		if (char === "'") {
			state = "singleQuote";
			hasWord = true;
			wordQuoted = true;
			index += 1;
			continue;
		}

		if (char === '"') {
			state = "doubleQuote";
			hasWord = true;
			wordQuoted = true;
			index += 1;
			continue;
		}

		if (char === "|") {
			flushWord();
			tokens.push({ kind: "pipe", value: "|", quoted: false });
			index += 1;
			continue;
		}

		if (char === ">") {
			flushWord();
			if (chars[index + 1] === ">") {
				tokens.push({ kind: "redirectAppend", value: ">>", quoted: false });
				index += 2;
			} else {
				tokens.push({ kind: "redirect", value: ">", quoted: false });
				index += 1;
			}
			continue;
		}

		buffer += char;
		hasWord = true;
		index += 1;
	}

	if (state === "singleQuote") {
		return { ok: false, error: { code: "UNCLOSED_QUOTE", detail: "'" } };
	}
	if (state === "doubleQuote") {
		return { ok: false, error: { code: "UNCLOSED_QUOTE", detail: '"' } };
	}

	flushWord();
	return { ok: true, tokens };
}
