/**
 * 指令列 tokenizer。
 *
 * 用明確的狀態機逐字掃描，三種狀態：
 * - `normal`：引號外，空白分隔 token，`|`、`>`、`>>` 切成符號 token。
 * - `singleQuote`：單引號內，一切照抄，直到下一個 `'`。
 * - `doubleQuote`：雙引號內，照抄直到下一個 `"`；
 *   只處理兩種跳脫：`\"` 變成字面的 `"`、`\\` 變成字面的 `\`，
 *   其他反斜線原樣保留（例如 `"a\b"` 是 `a\b`），跟 bash 在雙引號內的行為一致。
 *
 * 變數展開（第五章）：有給 `options.env` 時，在 `normal` 與 `doubleQuote` 狀態把
 * `$NAME`、`${NAME}` 換成變數值，沒有這個變數換成空字串；單引號內照抄。
 * `$` 後面不是合法名稱開頭（例如 `$1`、單獨的 `$`）原樣保留。沒給 `env` 時完全不展開。
 * 展開的值直接併進目前的 word，所以值裡的 `|`、`>` 不會變成符號，也不會再切成多個 word。
 * 引號外展開後整個 word 是空字串（例如 `echo $NOPE`）時，這個 word 直接丟掉，跟 bash 一樣；
 * 有引號包住的空字串（例如 `"$NOPE"`）保留。
 *
 * 引號外的反斜線目前「不」當跳脫字元，原樣保留（例如 `a\ b` 會切成 `a\` 與 `b`）。
 * 第一章檔名沒有空白，之後若要支援 `cd my\ dir` 再加。
 *
 * 引號可以出現在 token 中間，例如 `ab"c d"e` 是一個 token `abc de`，`quoted` 為 true。
 */

import type { ParseError, ParseOptions, Token } from "../types";

export type TokenizeResult = { ok: true; tokens: Token[] } | { ok: false; error: ParseError };

type TokenizerState = "normal" | "singleQuote" | "doubleQuote";

/** 變數名稱的開頭字元：英文字母或底線。 */
const NAME_START_PATTERN = /[A-Za-z_]/;

/** 變數名稱開頭之後的字元：英文字母、數字或底線。 */
const NAME_CHAR_PATTERN = /[A-Za-z0-9_]/;

/** 整個字串是不是合法的變數名稱。 */
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isWhitespace(char: string): boolean {
	return char === " " || char === "\t";
}

/** 一次變數展開的結果：展開後的值與吃掉了幾個字元（含 `$`）。 */
interface VariableExpansion {
	value: string;
	length: number;
}

/**
 * 嘗試從 `chars[index]`（一定是 `$`）開始展開變數。
 * 不是合法的變數寫法時回傳 null，呼叫端把 `$` 當一般字元。
 */
function expandVariable(chars: string[], index: number, env: Record<string, string>): VariableExpansion | null {
	const next = chars[index + 1];
	if (next === undefined) {
		return null;
	}

	if (next === "{") {
		const closeIndex = chars.indexOf("}", index + 2);
		if (closeIndex === -1) {
			return null;
		}
		const name = chars.slice(index + 2, closeIndex).join("");
		if (!NAME_PATTERN.test(name)) {
			return null;
		}
		return { value: env[name] ?? "", length: closeIndex - index + 1 };
	}

	if (!NAME_START_PATTERN.test(next)) {
		return null;
	}

	let end = index + 2;
	while (end < chars.length && NAME_CHAR_PATTERN.test(chars[end])) {
		end += 1;
	}
	const name = chars.slice(index + 1, end).join("");
	return { value: env[name] ?? "", length: end - index };
}

/**
 * 把一行輸入切成 token。
 * 引號沒關時回傳 `UNCLOSED_QUOTE`，`detail` 是那個引號字元。
 */
export function tokenize(input: string, options: ParseOptions = {}): TokenizeResult {
	const env = options.env;
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
	/** 目前的 word 是否有內容來自單引號內。 */
	let hasSingleQuotedPart = false;
	/** 目前的 word 是否有內容不是來自單引號內（引號外的字元、雙引號段落）。 */
	let hasOtherPart = false;

	const flushWord = (): void => {
		// 引號外展開成空字串的 word 直接丟掉；有引號包住的空字串要保留
		const isDroppedEmpty = buffer === "" && !wordQuoted;
		if (hasWord && !isDroppedEmpty) {
			tokens.push({
				kind: "word",
				value: buffer,
				quoted: wordQuoted,
				singleQuoted: hasSingleQuotedPart && !hasOtherPart,
			});
		}
		buffer = "";
		hasWord = false;
		wordQuoted = false;
		hasSingleQuotedPart = false;
		hasOtherPart = false;
	};

	const pushOperator = (kind: Token["kind"], value: string): void => {
		tokens.push({ kind, value, quoted: false, singleQuoted: false });
	};

	/**
	 * 目前字元是 `$` 而且有給 env 時嘗試展開。
	 * 成功回傳吃掉的字元數，不成功回傳 0（呼叫端把 `$` 當一般字元）。
	 */
	const tryExpand = (index: number): number => {
		if (env === undefined || chars[index] !== "$") {
			return 0;
		}
		const expansion = expandVariable(chars, index, env);
		if (expansion === null) {
			return 0;
		}
		buffer += expansion.value;
		hasWord = true;
		if (expansion.value !== "") {
			hasOtherPart = true;
		}
		return expansion.length;
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
			const consumed = tryExpand(index);
			if (consumed > 0) {
				index += consumed;
				continue;
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
			hasSingleQuotedPart = true;
			index += 1;
			continue;
		}

		if (char === '"') {
			state = "doubleQuote";
			hasWord = true;
			wordQuoted = true;
			hasOtherPart = true;
			index += 1;
			continue;
		}

		if (char === "|") {
			flushWord();
			pushOperator("pipe", "|");
			index += 1;
			continue;
		}

		if (char === ">") {
			flushWord();
			if (chars[index + 1] === ">") {
				pushOperator("redirectAppend", ">>");
				index += 2;
			} else {
				pushOperator("redirect", ">");
				index += 1;
			}
			continue;
		}

		const consumed = tryExpand(index);
		if (consumed > 0) {
			index += consumed;
			continue;
		}

		buffer += char;
		hasWord = true;
		hasOtherPart = true;
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
