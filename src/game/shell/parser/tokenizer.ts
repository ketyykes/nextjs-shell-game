/**
 * 指令列 tokenizer。
 *
 * 用明確的狀態機逐字掃描，三種狀態：
 * - `normal`：引號外，空白分隔 token，`|`、`>`、`>>`、`;`、`&&` 切成符號 token（`;`、`&&` 多記在輸入裡的位置）。
 * - `singleQuote`：單引號內，一切照抄，直到下一個 `'`。
 * - `doubleQuote`：雙引號內，照抄直到下一個 `"`；
 *   只處理四種跳脫：`\"`、`\\`、`\$`、`` \` `` 變成字面的 `"`、`\`、`$`、`` ` ``，
 *   其他反斜線原樣保留（例如 `"a\b"` 是 `a\b`），跟 bash 在雙引號內的行為一致。
 *
 * 不支援的語法（M13-1）：引號外遇到 `||`、背景執行的 `&`、`<`、`<<`、指定檔案描述元的重導向
 * （`2>`、`2>>`、`2>&1`、`1>`、`&>`、`>&2`、`|&`），或是引號外與雙引號內的指令替換（`$(`、反引號），
 * 直接回傳 `UNSUPPORTED_SYNTAX`，detail 是那個符號，不默默當成一般字元。單引號內與反斜線跳脫過的都是字面值。
 * 檔案描述元只認「整個 word 都是引號外打的數字」緊接 `>`，所以 `a2>b`、`2 > b`、`"2">b` 都是一般重導向。
 *
 * 變數展開（第五章）：有給 `options.env` 時，在 `normal` 與 `doubleQuote` 狀態把
 * `$NAME`、`${NAME}` 換成變數值，沒有這個變數換成空字串；單引號內照抄。
 * `$` 後面不是合法名稱開頭（例如 `$1`、單獨的 `$`）原樣保留。沒給 `env` 時完全不展開。
 * 展開的值直接併進目前的 word，所以值裡的 `|`、`>` 不會變成符號，也不會再切成多個 word。
 * 引號外展開後整個 word 是空字串（例如 `echo $NOPE`）時，這個 word 直接丟掉，跟 bash 一樣；
 * 有引號包住的空字串（例如 `"$NOPE"`）保留。
 *
 * `~` 展開（M13-2）：有給 `options.home` 時，word 開頭沒被引號包住的 `~`（單獨一個，或後面接 `/`、空白、符號）
 * 換成家目錄，展開出來的字元不算引號，所以 `~/*.txt` 照樣做萬用字元展開。`~abin` 這種 `~使用者` 寫法不支援、原樣保留
 * （跟 bash 遇到不存在的帳號一樣）；不在 word 開頭的（`a~`、`NAME=~/x`）也不展開。沒給 `home` 時完全不展開。
 *
 * 引號外的反斜線跳脫下一個字元，跟 bash 一樣：`a\ b` 是一個 token `a b`、`v3\.1` 是 `v3.1`、
 * `\|`、`\>`、`\'`、`\$` 都是字面字元。跳脫過的 word 標成 `quoted`，所以 `\*.log` 不做萬用字元展開
 * （跟引號一樣是整個 word 的簡化：bash 只讓被跳脫的那個字元失去萬用字元意義）。
 * 行尾單獨的反斜線原樣保留，跟 `bash -c 'echo a\'` 一樣。
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

/** 整個 word 都是數字時，緊接的 `>` 是「指定檔案描述元」的重導向（`2>`、`1>`）。 */
const FD_NUMBER_PATTERN = /^[0-9]+$/;

/** `>&` 後面接的檔案描述元或 `-`（`2>&1`、`>&-`）。 */
const FD_TARGET_PATTERN = /[0-9-]/;

/** 緊接在這些字元前面的 `~` 是完整的 `~` 或 `~/`，會展開；其他字元（`~abin`、`~"x"`）不展開。 */
const TILDE_END_CHARS = new Set(["/", " ", "\t", ";", "&", "|", "<", ">"]);

/** `~` 後面是行尾或 `TILDE_END_CHARS` 時才展開。 */
function isTildeEnd(next: string | undefined): boolean {
	return next === undefined || TILDE_END_CHARS.has(next);
}

/**
 * 從 `chars[index]`（一定是 `>`）開始讀出整個重導向符號，接在 `prefix` 後面當錯誤的 detail，
 * 例如 prefix `2` 讀出 `2>`、`2>>`、`2>&1`；prefix 空字串遇到 `>&2` 讀出 `>&2`。
 */
function describeRedirect(chars: string[], index: number, prefix: string): string {
	let detail = `${prefix}>`;
	let cursor = index + 1;

	if (chars[cursor] === ">") {
		return `${detail}>`;
	}

	if (chars[cursor] === "&") {
		detail += "&";
		cursor += 1;
		while (cursor < chars.length && FD_TARGET_PATTERN.test(chars[cursor])) {
			detail += chars[cursor];
			cursor += 1;
		}
	}

	return detail;
}

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
	const home = options.home;
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
	/** 目前的 word 是否有變數展開出來的內容；展開出來的數字不算檔案描述元（`$N>b` 是一般重導向）。 */
	let wordExpanded = false;

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
		wordExpanded = false;
	};

	const unsupported = (detail: string): TokenizeResult => {
		return { ok: false, error: { code: "UNSUPPORTED_SYNTAX", detail } };
	};

	/** `$(` 或反引號（指令替換）回傳那個符號，否則回傳 null。引號外與雙引號內都要擋，bash 在兩處都會執行它。 */
	const commandSubstitutionAt = (index: number): string | null => {
		if (chars[index] === "$" && chars[index + 1] === "(") {
			return "$(";
		}
		if (chars[index] === "`") {
			return "`";
		}
		return null;
	};

	const pushOperator = (kind: Token["kind"], value: string): void => {
		tokens.push({ kind, value, quoted: false, singleQuoted: false });
	};

	/** `;`、`&&` 多記位置，解析器才切得出每一段的原文。 */
	const pushListOperator = (kind: "semicolon" | "and", value: string, offset: number): void => {
		tokens.push({ kind, value, quoted: false, singleQuoted: false, offset });
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
		wordExpanded = true;
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
				if (next === '"' || next === "\\" || next === "$" || next === "`") {
					buffer += next;
					index += 2;
					continue;
				}
			}
			const substitution = commandSubstitutionAt(index);
			if (substitution !== null) {
				return unsupported(substitution);
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
		const escaped = chars[index + 1];
		if (char === "\\" && escaped !== undefined) {
			buffer += escaped;
			hasWord = true;
			wordQuoted = true;
			hasOtherPart = true;
			index += 2;
			continue;
		}

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

		const substitution = commandSubstitutionAt(index);
		if (substitution !== null) {
			return unsupported(substitution);
		}

		if (char === ";") {
			flushWord();
			pushListOperator("semicolon", ";", index);
			index += 1;
			continue;
		}

		if (char === "&") {
			const next = chars[index + 1];
			if (next === "&") {
				flushWord();
				pushListOperator("and", "&&", index);
				index += 2;
				continue;
			}
			if (next === ">") {
				return unsupported(describeRedirect(chars, index + 1, "&"));
			}
			return unsupported("&");
		}

		if (char === "|") {
			const next = chars[index + 1];
			if (next === "|" || next === "&") {
				return unsupported(`|${next}`);
			}
			flushWord();
			pushOperator("pipe", "|");
			index += 1;
			continue;
		}

		if (char === "<") {
			if (chars[index + 1] === "<") {
				return unsupported("<<");
			}
			return unsupported("<");
		}

		if (char === ">") {
			// 整個 word 都是引號外打的數字（`2>`、`1>`）是指定檔案描述元的重導向
			const isFdNumber = hasWord && !wordQuoted && !wordExpanded && FD_NUMBER_PATTERN.test(buffer);
			if (isFdNumber) {
				return unsupported(describeRedirect(chars, index, buffer));
			}
			if (chars[index + 1] === "&") {
				return unsupported(describeRedirect(chars, index, ""));
			}
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

		// word 開頭沒有引號的 `~`、`~/` 換成家目錄，展開出來的字元不算引號，萬用字元照樣展開
		if (char === "~" && !hasWord && home !== undefined && isTildeEnd(chars[index + 1])) {
			buffer += home;
			hasWord = true;
			hasOtherPart = true;
			index += 1;
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
