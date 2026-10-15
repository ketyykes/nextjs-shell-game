/**
 * 指令列 tokenizer。
 *
 * 用明確的狀態機逐字掃描，三種狀態：
 * - `normal`：引號外，空白分隔 token，下列符號切成符號 token（`;`、`&&`、`||` 多記在輸入裡的位置）：
 *   `|`、`;`、`&&`、`||`、`>`、`>>`、`<`、`2>`、`2>>`、`2>&1`、`&>`、`&>>`、`1>`、`1>>`。
 * - `singleQuote`：單引號內，一切照抄，直到下一個 `'`。
 * - `doubleQuote`：雙引號內，照抄直到下一個 `"`；
 *   只處理四種跳脫：`\"`、`\\`、`\$`、`` \` `` 變成字面的 `"`、`\`、`$`、`` ` ``，
 *   其他反斜線原樣保留（例如 `"a\b"` 是 `a\b`），跟 bash 在雙引號內的行為一致。
 *
 * 不支援的語法（M13-1，第十九場縮小範圍）：引號外遇到背景執行的 `&`、`<<`、`<<<`、`<(`、`<&`、`<>`、
 * `>&2` 這類把輸出接到別的檔案描述元的寫法、`|&`、`1`、`2` 以外的檔案描述元（`3>`、`0<`），
 * 或是引號外與雙引號內的算術 `$((`，直接回傳 `UNSUPPORTED_SYNTAX`，detail 是那個符號，不默默當成一般字元。
 * 單引號內與反斜線跳脫過的都是字面值。
 * 檔案描述元只認「整個 word 都是引號外打的數字」緊接 `>` 或 `<`，所以 `a2>b`、`2 > b`、`"2">b` 都是一般重導向。
 *
 * 指令替換（第十九場）：引號外與雙引號內的 `$( )`、反引號。先找到對應的結尾（裡面的引號、跳脫、
 * 巢狀的 `$( )` 都跳過），找不到回 `UNCLOSED_SUBSTITUTION`；裡面的原文依出現順序記在 `substitutions`
 * （只記最外層，巢狀的由執行時再解析）。反引號裡的 `\\`、`` \` ``、`\$` 先還原成 `\`、`` ` ``、`$`。
 * - 有給 `options.substitute` 時呼叫它執行，拿到的輸出去掉結尾的換行後代入：
 *   引號外照空白、tab、換行切成好幾個 word（前後黏著的字併進第一個與最後一個），雙引號內整段併進目前的 word。
 *   代入的字元不算引號（萬用字元照樣展開），也不會變成符號（`|`、`>` 只是字）。
 * - 沒給時不執行，整段 `$(...)` 原樣併進目前的 word，裡面的 `;`、`|` 不切，給解析器切段落與檢查語法用。
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

export type TokenizeResult =
	| {
			ok: true;
			tokens: Token[];
			/** 這一行最外層的指令替換（`$( )`、反引號）裡的原文，依出現順序；沒有時是空陣列。 */
			substitutions: string[];
	  }
	| { ok: false; error: ParseError };

type TokenizerState = "normal" | "singleQuote" | "doubleQuote";

/** 變數名稱的開頭字元：英文字母或底線。 */
const NAME_START_PATTERN = /[A-Za-z_]/;

/** 變數名稱開頭之後的字元：英文字母、數字或底線。 */
const NAME_CHAR_PATTERN = /[A-Za-z0-9_]/;

/** 整個字串是不是合法的變數名稱。 */
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 整個 word 都是數字時，緊接的 `>`、`<` 是「指定檔案描述元」的重導向（`2>`、`1>`、`0<`）。 */
const FD_NUMBER_PATTERN = /^[0-9]+$/;

/** `>&` 後面接的檔案描述元或 `-`（`2>&1`、`>&-`）。 */
const FD_TARGET_PATTERN = /[0-9-]/;

/** 緊接在這些字元前面的 `~` 是完整的 `~` 或 `~/`，會展開；其他字元（`~abin`、`~"x"`）不展開。 */
const TILDE_END_CHARS = new Set(["/", " ", "\t", ";", "&", "|", "<", ">"]);

/** 指令替換的輸出切 word 用的分隔字元（bash 預設的 IFS：空白、tab、換行）。 */
const FIELD_SEPARATORS = new Set([" ", "\t", "\n"]);

/** `~` 後面是行尾或 `TILDE_END_CHARS` 時才展開。 */
function isTildeEnd(next: string | undefined): boolean {
	return next === undefined || TILDE_END_CHARS.has(next);
}

/**
 * 從 `chars[index]`（一定是 `>`）開始讀出整個重導向符號，接在 `prefix` 後面當錯誤的 detail，
 * 例如 prefix `3` 讀出 `3>`、`3>>`；prefix `2` 遇到 `>&-` 讀出 `2>&-`；prefix 空字串遇到 `>&2` 讀出 `>&2`。
 * 回傳讀到的符號與它佔了幾個字元（從 `>` 算起）。
 */
function readRedirectOperator(chars: string[], index: number, prefix: string): { text: string; length: number } {
	let text = `${prefix}>`;
	let cursor = index + 1;

	if (chars[cursor] === ">") {
		return { text: `${text}>`, length: 2 };
	}

	if (chars[cursor] === "&") {
		text += "&";
		cursor += 1;
		while (cursor < chars.length && FD_TARGET_PATTERN.test(chars[cursor])) {
			text += chars[cursor];
			cursor += 1;
		}
	}

	return { text, length: cursor - index };
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

// ---------------------------------------------------------------------------
// 指令替換：找結尾
// ---------------------------------------------------------------------------

/** 找結尾的結果：成功時是結尾字元（`)`、`"`、`` ` ``）的索引。 */
type ScanResult = { ok: true; end: number } | { ok: false; error: ParseError };

function unclosedSubstitution(detail: "$(" | "`"): ScanResult {
	return { ok: false, error: { code: "UNCLOSED_SUBSTITUTION", detail } };
}

/** 從 `start`（開頭反引號的下一個字元）找下一個沒被跳脫的反引號。 */
function findBacktickEnd(chars: string[], start: number): ScanResult {
	let index = start;
	while (index < chars.length) {
		if (chars[index] === "\\") {
			index += 2;
			continue;
		}
		if (chars[index] === "`") {
			return { ok: true, end: index };
		}
		index += 1;
	}
	return unclosedSubstitution("`");
}

/** 從 `start`（開頭 `"` 的下一個字元）找對應的 `"`，中間的 `$( )` 與反引號整段跳過。 */
function findDoubleQuoteEnd(chars: string[], start: number): ScanResult {
	let index = start;
	while (index < chars.length) {
		const char = chars[index];
		if (char === "\\") {
			index += 2;
			continue;
		}
		if (char === '"') {
			return { ok: true, end: index };
		}
		let nested: ScanResult | null = null;
		if (char === "$" && chars[index + 1] === "(") {
			nested = findParenEnd(chars, index + 2);
		} else if (char === "`") {
			nested = findBacktickEnd(chars, index + 1);
		}
		if (nested === null) {
			index += 1;
			continue;
		}
		if (!nested.ok) {
			return nested;
		}
		index = nested.end + 1;
	}
	return { ok: false, error: { code: "UNCLOSED_QUOTE", detail: '"' } };
}

/**
 * 從 `start`（`$(` 的下一個字元）找對應的 `)`。
 * 裡面的單雙引號、反斜線跳脫、反引號整段跳過；`(` 與巢狀的 `$(` 都讓層數加一，`)` 減一，回到零就是結尾。
 * 裡面的引號或反引號沒關時，`)` 也被吃進去了，一律回報這個 `$(` 沒關（訊息會提醒裡面的引號要成對）：
 * `echo "$(pwd"` 多半是忘了 `)`，說「引號沒關」反而會讓玩家去補錯地方。
 */
function findParenEnd(chars: string[], start: number): ScanResult {
	let depth = 1;
	let index = start;
	while (index < chars.length) {
		const char = chars[index];
		if (char === "\\") {
			index += 2;
			continue;
		}
		let nested: ScanResult | null = null;
		if (char === "'") {
			const close = chars.indexOf("'", index + 1);
			nested = close === -1 ? unclosedSubstitution("$(") : { ok: true, end: close };
		} else if (char === '"') {
			nested = findDoubleQuoteEnd(chars, index + 1);
		} else if (char === "`") {
			nested = findBacktickEnd(chars, index + 1);
		}
		if (nested !== null) {
			if (!nested.ok) {
				return unclosedSubstitution("$(");
			}
			index = nested.end + 1;
			continue;
		}
		if (char === "(") {
			depth += 1;
		} else if (char === ")") {
			depth -= 1;
			if (depth === 0) {
				return { ok: true, end: index };
			}
		}
		index += 1;
	}
	return unclosedSubstitution("$(");
}

/** 反引號裡的原文：`\\`、`` \` ``、`\$` 還原成 `\`、`` ` ``、`$`，其他反斜線原樣保留（bash 行為）。 */
function unescapeBacktickSource(chars: string[]): string {
	let source = "";
	let index = 0;
	while (index < chars.length) {
		const next = chars[index + 1];
		if (chars[index] === "\\" && (next === "\\" || next === "`" || next === "$")) {
			source += next;
			index += 2;
			continue;
		}
		source += chars[index];
		index += 1;
	}
	return source;
}

/** 從 `index` 開始的一段指令替換：原文、整段的原樣寫法與它佔了幾個字元。 */
interface SubstitutionSpan {
	source: string;
	raw: string;
	length: number;
}

type SubstitutionScan = { ok: true; span: SubstitutionSpan | null } | { ok: false; error: ParseError };

/**
 * `chars[index]` 是 `$(` 或反引號時讀出整段指令替換；不是的話 `span` 為 null。
 * `$((` 是算術運算，不支援。
 */
function scanSubstitution(chars: string[], index: number): SubstitutionScan {
	if (chars[index] === "$" && chars[index + 1] === "(") {
		if (chars[index + 2] === "(") {
			return { ok: false, error: { code: "UNSUPPORTED_SYNTAX", detail: "$((" } };
		}
		const scanned = findParenEnd(chars, index + 2);
		if (!scanned.ok) {
			return scanned;
		}
		return {
			ok: true,
			span: {
				source: chars.slice(index + 2, scanned.end).join(""),
				raw: chars.slice(index, scanned.end + 1).join(""),
				length: scanned.end - index + 1,
			},
		};
	}

	if (chars[index] === "`") {
		const scanned = findBacktickEnd(chars, index + 1);
		if (!scanned.ok) {
			return scanned;
		}
		return {
			ok: true,
			span: {
				source: unescapeBacktickSource(chars.slice(index + 1, scanned.end)),
				raw: chars.slice(index, scanned.end + 1).join(""),
				length: scanned.end - index + 1,
			},
		};
	}

	return { ok: true, span: null };
}

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

/**
 * 把一行輸入切成 token。
 * 引號沒關時回傳 `UNCLOSED_QUOTE`，`detail` 是那個引號字元。
 */
export function tokenize(input: string, options: ParseOptions = {}): TokenizeResult {
	const env = options.env;
	const home = options.home;
	const substitute = options.substitute;
	const tokens: Token[] = [];
	const substitutions: string[] = [];
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
	/** 目前的 word 是否有展開（變數、指令替換）出來的內容；展開出來的數字不算檔案描述元（`$N>b` 是一般重導向）。 */
	let wordExpanded = false;

	const resetWord = (): void => {
		buffer = "";
		hasWord = false;
		wordQuoted = false;
		hasSingleQuotedPart = false;
		hasOtherPart = false;
		wordExpanded = false;
	};

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
		resetWord();
	};

	const unsupported = (detail: string): TokenizeResult => {
		return { ok: false, error: { code: "UNSUPPORTED_SYNTAX", detail } };
	};

	const pushOperator = (kind: Token["kind"], value: string): void => {
		tokens.push({ kind, value, quoted: false, singleQuoted: false });
	};

	/** `;`、`&&`、`||` 多記位置，解析器才切得出每一段的原文。 */
	const pushListOperator = (kind: "semicolon" | "and" | "or", value: string, offset: number): void => {
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

	/** 把指令替換的輸出代入目前的 word：雙引號內整段併進去，引號外照空白與換行切開。 */
	const insertSubstitution = (output: string, inDoubleQuote: boolean): void => {
		const trimmed = output.replace(/\n+$/, "");
		if (inDoubleQuote) {
			buffer += trimmed;
			wordExpanded = true;
			return;
		}
		for (const char of trimmed) {
			if (FIELD_SEPARATORS.has(char)) {
				flushWord();
				continue;
			}
			buffer += char;
			hasWord = true;
			hasOtherPart = true;
			wordExpanded = true;
		}
	};

	/**
	 * 目前字元是 `$(` 或反引號時處理整段指令替換，回傳吃掉的字元數；不是的話回傳 0。
	 * 有錯誤（沒關、`$((`）時回傳錯誤。
	 */
	const trySubstitution = (index: number, inDoubleQuote: boolean): number | ParseError => {
		const scanned = scanSubstitution(chars, index);
		if (!scanned.ok) {
			return scanned.error;
		}
		const span = scanned.span;
		if (span === null) {
			return 0;
		}
		substitutions.push(span.source);
		if (substitute === undefined) {
			buffer += span.raw;
			hasWord = true;
			hasOtherPart = true;
			wordExpanded = true;
		} else {
			insertSubstitution(substitute(span.source), inDoubleQuote);
		}
		return span.length;
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
			const substituted = trySubstitution(index, true);
			if (typeof substituted !== "number") {
				return { ok: false, error: substituted };
			}
			if (substituted > 0) {
				index += substituted;
				continue;
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

		const substituted = trySubstitution(index, false);
		if (typeof substituted !== "number") {
			return { ok: false, error: substituted };
		}
		if (substituted > 0) {
			index += substituted;
			continue;
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
				flushWord();
				if (chars[index + 2] === ">") {
					pushOperator("redirectBothAppend", "&>>");
					index += 3;
				} else {
					pushOperator("redirectBoth", "&>");
					index += 2;
				}
				continue;
			}
			return unsupported("&");
		}

		if (char === "|") {
			const next = chars[index + 1];
			if (next === "|") {
				flushWord();
				pushListOperator("or", "||", index);
				index += 2;
				continue;
			}
			if (next === "&") {
				return unsupported("|&");
			}
			flushWord();
			pushOperator("pipe", "|");
			index += 1;
			continue;
		}

		// 整個 word 都是引號外打的數字（`2>`、`1>`、`0<`）是指定檔案描述元的重導向
		const isFdNumber = hasWord && !wordQuoted && !wordExpanded && FD_NUMBER_PATTERN.test(buffer);

		if (char === "<") {
			if (isFdNumber) {
				return unsupported(`${buffer}<`);
			}
			const next = chars[index + 1];
			if (next === "<") {
				if (chars[index + 2] === "<") {
					return unsupported("<<<");
				}
				return unsupported("<<");
			}
			if (next === "(" || next === "&" || next === ">") {
				return unsupported(`<${next}`);
			}
			flushWord();
			pushOperator("redirectIn", "<");
			index += 1;
			continue;
		}

		if (char === ">") {
			if (isFdNumber) {
				const fd = buffer;
				const operator = readRedirectOperator(chars, index, fd);
				let kind: Token["kind"] | null = null;
				if (operator.text === "1>") {
					kind = "redirect";
				} else if (operator.text === "1>>") {
					kind = "redirectAppend";
				} else if (operator.text === "2>") {
					kind = "redirectErr";
				} else if (operator.text === "2>>") {
					kind = "redirectErrAppend";
				} else if (operator.text === "2>&1") {
					kind = "redirectErrToOut";
				}
				if (kind === null) {
					return unsupported(operator.text);
				}
				// 數字是符號的一部分，不是參數
				resetWord();
				pushOperator(kind, operator.text);
				index += operator.length;
				continue;
			}
			if (chars[index + 1] === "&") {
				return unsupported(readRedirectOperator(chars, index, "").text);
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
	return { ok: true, tokens, substitutions };
}
