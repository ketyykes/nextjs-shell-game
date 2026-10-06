/**
 * `grep` 的樣式編譯：把 POSIX 正規表示式（BRE／ERE）轉成 JavaScript 的 `RegExp`。
 *
 * 三種語法對照 GNU grep：
 * - `basic`（預設，BRE）：`.` `*` `^` `$` `[...]` `[^...]` 有特殊意義；`+ ? | ( ) { }` 是字面字元，
 *   前面加反斜線（`\+ \? \| \( \) \{ \}`）才有特殊意義（GNU 延伸）。
 *   `^` 只有在開頭（或 `\(`、`\|` 後面）才是行首，`$` 只有在結尾（或 `\)`、`\|` 前面）才是行尾，其他位置是字面字元；
 *   開頭（或 `\(`、`\|`、`^` 後面）的 `*` 也是字面字元。
 * - `extended`（`-E`，ERE）：`+ ? | ( ) { }` 直接有特殊意義，加反斜線變成字面字元；`^`、`$` 在任何位置都是錨點；
 *   開頭的 `*`、`+`、`?`、次數會被忽略（GNU 只給警告）；不是次數寫法的 `{` 與沒有對應 `(` 的 `)` 是字面字元。
 * - `fixed`（`-F`）：整串照字面比對，不會有樣式錯誤。
 *
 * 兩種正規表示式語法都支援 `\1` 到 `\9` 回頭參照，以及 GNU 的 `\w \W \s \S \< \> \b \B`；
 * 其他「反斜線加普通字元」就是那個字元本身（例如 `\a` 是 `a`）。
 * 中括號裡的反斜線是字面字元（POSIX 規定），`[[:digit:]]` 這類字元類別照 UTF-8 語系對應到 Unicode 類別。
 * 不支援的：`[.ch.]` 與 `[=e=]`（這裡的 `[` 當一般字元）、反斜線的其他 GNU 延伸（例如 `\'`）。
 *
 * 轉換時每個片段都只產生一個 JS 原子，連續的次數（`a**`、`a+*`、`a{2}{3}`）能合併成一個就合併，
 * 不會由轉換本身做出 `(?:a*)*` 這種會指數爆炸的巢狀次數；玩家自己寫的巢狀群組（例如 `(a+)+`）照寫照轉，
 * 遊戲裡的檔案很小，可以接受。
 */

import type { RegexErrorCode } from "../types";

/** 樣式語法：`basic` 是預設的 BRE、`extended` 是 `-E`、`fixed` 是 `-F`。 */
export type GrepSyntax = "basic" | "extended" | "fixed";

/** 編譯結果：成功時帶判斷一行是否符合的函式，失敗時帶錯誤代碼。 */
export type GrepPatternResult = { ok: true; test: (line: string) => boolean } | { ok: false; error: RegexErrorCode };

// ---------------------------------------------------------------------------
// 常數
// ---------------------------------------------------------------------------

/** 次數上限，跟 GNU 的 RE_DUP_MAX 一樣。 */
const MAX_REPEAT = 32767;

/** JS 正規表示式的語法字元，當字面字元用時要加反斜線。 */
const JS_SYNTAX_CHARS = new Set(["^", "$", "\\", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|", "/"]);

/** JS 中括號裡要加反斜線的字元。 */
const JS_CLASS_SPECIAL_CHARS = new Set(["\\", "]", "[", "^", "-"]);

/** GNU 的「文字字元」：字母、數字與底線，放在 JS 中括號裡用。 */
const WORD_CHARS = "\\p{L}\\p{N}_";

/** 單字開頭：前面不是文字字元、後面是。 */
const WORD_START = `(?<![${WORD_CHARS}])(?=[${WORD_CHARS}])`;

/** 單字結尾：前面是文字字元、後面不是。 */
const WORD_END = `(?<=[${WORD_CHARS}])(?![${WORD_CHARS}])`;

/** 不是單字邊界：前後都是文字字元，或前後都不是。 */
const NOT_WORD_BOUNDARY = `(?:(?<=[${WORD_CHARS}])(?=[${WORD_CHARS}])|(?<![${WORD_CHARS}])(?![${WORD_CHARS}]))`;

/** `[[:名稱:]]` 對應到 JS 中括號裡的內容（`u` 旗標下可用 `\p{...}`）。 */
const POSIX_CLASSES: Record<string, string> = {
	alpha: "\\p{L}",
	digit: "0-9",
	alnum: "\\p{L}\\p{Nd}",
	upper: "\\p{Lu}",
	lower: "\\p{Ll}",
	space: "\\s",
	blank: " \\t",
	punct: "\\p{P}\\p{S}",
	graph: "\\p{L}\\p{M}\\p{N}\\p{P}\\p{S}",
	print: "\\p{L}\\p{M}\\p{N}\\p{P}\\p{S}\\p{Zs}",
	cntrl: "\\p{Cc}",
	xdigit: "0-9A-Fa-f",
};

/** 反斜線加字母的字元類別（可以加次數）。 */
const ESCAPE_CLASSES: Record<string, string> = {
	w: `[${WORD_CHARS}]`,
	W: `[^${WORD_CHARS}]`,
	s: "\\s",
	S: "\\S",
};

/** 反斜線加符號的位置錨點（不能加次數）。 */
const ESCAPE_ANCHORS: Record<string, string> = {
	"<": WORD_START,
	">": WORD_END,
	b: `(?:${WORD_START}|${WORD_END})`,
	B: NOT_WORD_BOUNDARY,
};

// ---------------------------------------------------------------------------
// 次數
// ---------------------------------------------------------------------------

/** 次數範圍，`max` 是 `Infinity` 代表沒有上限。 */
interface Repeat {
	min: number;
	max: number;
}

const ZERO_OR_MORE: Repeat = { min: 0, max: Infinity };
const ONE_OR_MORE: Repeat = { min: 1, max: Infinity };
const ZERO_OR_ONE: Repeat = { min: 0, max: 1 };

/** 次數相乘，`0 × 無限` 當成 0（重複零次就是什麼都沒有）。 */
function multiply(count: number, limit: number): number {
	if (count === 0 || limit === 0) {
		return 0;
	}

	return count * limit;
}

/**
 * 內層次數 `{a,b}` 再套外層次數 `{c,d}` 時，能配的總次數是不是連續的一段。
 * 外層重複 k 次時內層總共配 `[k*a, k*b]` 次，相鄰兩個 k 的範圍接得起來才連續。
 * 外層沒有上限時，這個條件只會隨 k 變寬鬆（或與 k 無關），所以只要檢查 k = c。
 */
function isContiguous(inner: Repeat, outer: Repeat): boolean {
	const fits = (k: number): boolean => (k + 1) * inner.min <= multiply(k, inner.max) + 1;

	if (outer.max === Infinity) {
		return fits(outer.min);
	}

	for (let k = outer.min; k < outer.max; k += 1) {
		if (!fits(k)) {
			return false;
		}
	}

	return true;
}

/** 把兩層次數合併成一層；合併後不連續（例如 `a{2}{1,3}` 是 2、4、6 次）回傳 null。 */
function combineRepeats(inner: Repeat, outer: Repeat): Repeat | null {
	if (!isContiguous(inner, outer)) {
		return null;
	}

	return { min: inner.min * outer.min, max: multiply(inner.max, outer.max) };
}

/** 次數轉成 JS 寫法。 */
function renderRepeat(repeat: Repeat): string {
	const { min, max } = repeat;

	if (min === 0 && max === Infinity) {
		return "*";
	}

	if (min === 1 && max === Infinity) {
		return "+";
	}

	if (min === 0 && max === 1) {
		return "?";
	}

	if (min === max) {
		return `{${min}}`;
	}

	if (max === Infinity) {
		return `{${min},}`;
	}

	return `{${min},${max}}`;
}

// ---------------------------------------------------------------------------
// 片段與群組
// ---------------------------------------------------------------------------

/** 轉換中的一個片段：字元、中括號、群組、回頭參照（可以加次數），或錨點（不能加次數）。 */
interface Piece {
	source: string;
	quantifiable: boolean;
	repeat: Repeat | null;
}

/** 一層群組：已經寫完的分支、正在寫的分支，以及這個群組的編號（最外層是 0）。 */
interface Frame {
	branches: string[];
	pieces: Piece[];
	groupNumber: number;
}

function renderPiece(piece: Piece): string {
	if (piece.repeat === null) {
		return piece.source;
	}

	return `${piece.source}${renderRepeat(piece.repeat)}`;
}

function renderFrame(frame: Frame): string {
	const current = frame.pieces.map(renderPiece).join("");
	return [...frame.branches, current].join("|");
}

/** 字面字元轉成 JS 寫法。 */
function escapeLiteral(char: string): string {
	if (JS_SYNTAX_CHARS.has(char)) {
		return `\\${char}`;
	}

	return char;
}

/** 中括號裡的字面字元轉成 JS 寫法。 */
function escapeClassChar(char: string): string {
	if (JS_CLASS_SPECIAL_CHARS.has(char)) {
		return `\\${char}`;
	}

	return char;
}

/** 轉換失敗時丟出的內部錯誤，`compileGrepPattern` 會接住換成回傳值。 */
class PatternError extends Error {
	readonly code: RegexErrorCode;

	constructor(code: RegexErrorCode) {
		super(code);
		this.code = code;
	}
}

/** 解析出來的次數寫法，以及它在原樣式裡的字面寫法（BRE 開頭的次數要當字面字元用）。 */
interface ParsedInterval {
	repeat: Repeat;
	literal: string;
	/** 次數寫法結束後的下一個位置。 */
	next: number;
}

// ---------------------------------------------------------------------------
// 轉換器
// ---------------------------------------------------------------------------

/** 把 BRE 或 ERE 逐字轉成 JS 正規表示式的原始碼。一個實例只轉一次。 */
class PatternTranslator {
	private readonly chars: string[];
	private readonly extended: boolean;
	private index = 0;
	private readonly frames: Frame[] = [{ branches: [], pieces: [], groupNumber: 0 }];
	private groupCount = 0;
	private readonly closedGroups = new Set<number>();

	constructor(pattern: string, extended: boolean) {
		// 用 Array.from 逐「字」處理，中文與表情符號都算一個字元
		this.chars = Array.from(pattern);
		this.extended = extended;
	}

	translate(): string {
		while (this.index < this.chars.length) {
			this.step();
		}

		if (this.frames.length > 1) {
			throw new PatternError("UNMATCHED_PAREN");
		}

		return renderFrame(this.frames[0]);
	}

	private get frame(): Frame {
		return this.frames[this.frames.length - 1];
	}

	/** 處理目前位置的一個語法單位，並把 `index` 往後推。 */
	private step(): void {
		const char = this.chars[this.index];

		if (char === "\\") {
			this.handleEscape();
			return;
		}

		if (char === "[") {
			this.handleBracket();
			return;
		}

		this.index += 1;

		if (char === ".") {
			this.pushAtom(".");
		} else if (char === "*") {
			this.applyRepeat(ZERO_OR_MORE, "*");
		} else if (char === "^") {
			this.handleCaret();
		} else if (char === "$") {
			this.handleDollar();
		} else if (this.extended) {
			this.handleExtendedChar(char);
		} else {
			this.pushLiteral(char);
		}
	}

	/** ERE 才有特殊意義的字元：`+ ? | ( ) {`；其他照字面。 */
	private handleExtendedChar(char: string): void {
		if (char === "+") {
			this.applyRepeat(ONE_OR_MORE, "+");
		} else if (char === "?") {
			this.applyRepeat(ZERO_OR_ONE, "?");
		} else if (char === "|") {
			this.alternate();
		} else if (char === "(") {
			this.openGroup();
		} else if (char === ")") {
			// 沒有對應的 ( 時，ERE 的 ) 是字面字元（GNU 行為）
			if (this.frames.length === 1) {
				this.pushLiteral(")");
			} else {
				this.closeGroup();
			}
		} else if (char === "{") {
			this.handleExtendedBrace();
		} else {
			this.pushLiteral(char);
		}
	}

	/** `^`：ERE 一律是行首；BRE 只有在分支開頭才是，其他位置是字面字元。 */
	private handleCaret(): void {
		if (this.extended || this.frame.pieces.length === 0) {
			this.pushAnchor("^");
		} else {
			this.pushLiteral("^");
		}
	}

	/** `$`：ERE 一律是行尾；BRE 只有在結尾或 `\)`、`\|` 前面才是，其他位置是字面字元。 */
	private handleDollar(): void {
		if (this.extended || this.isBasicBranchEnd()) {
			this.pushAnchor("$");
		} else {
			this.pushLiteral("$");
		}
	}

	/** BRE 裡目前位置（`$` 的下一個字元）是不是分支結尾。 */
	private isBasicBranchEnd(): boolean {
		if (this.index >= this.chars.length) {
			return true;
		}

		const next = this.chars[this.index + 1];
		return this.chars[this.index] === "\\" && (next === ")" || next === "|");
	}

	/** ERE 的 `{`：是合法的次數寫法就套用，否則當字面字元。 */
	private handleExtendedBrace(): void {
		const interval = this.parseInterval(this.index, false);

		if (interval === null) {
			this.pushLiteral("{");
			return;
		}

		this.index = interval.next;
		this.applyRepeat(interval.repeat, interval.literal);
	}

	/** 反斜線開頭的寫法。 */
	private handleEscape(): void {
		const next = this.chars[this.index + 1];

		if (next === undefined) {
			throw new PatternError("TRAILING_BACKSLASH");
		}

		this.index += 2;

		if (next >= "1" && next <= "9") {
			this.pushBackReference(Number(next));
			return;
		}

		if (next in ESCAPE_CLASSES) {
			this.pushAtom(ESCAPE_CLASSES[next]);
			return;
		}

		if (next in ESCAPE_ANCHORS) {
			this.pushAnchor(ESCAPE_ANCHORS[next]);
			return;
		}

		if (this.extended) {
			// ERE 裡反斜線把特殊字元變回字面字元
			this.pushLiteral(next);
			return;
		}

		this.handleBasicEscape(next);
	}

	/** BRE 裡 `\( \) \| \{ \+ \?` 有特殊意義，其他反斜線字元是字面字元。 */
	private handleBasicEscape(char: string): void {
		if (char === "(") {
			this.openGroup();
		} else if (char === ")") {
			if (this.frames.length === 1) {
				throw new PatternError("UNMATCHED_PAREN");
			}

			this.closeGroup();
		} else if (char === "|") {
			this.alternate();
		} else if (char === "+") {
			this.applyRepeat(ONE_OR_MORE, "+");
		} else if (char === "?") {
			this.applyRepeat(ZERO_OR_ONE, "?");
		} else if (char === "{") {
			const interval = this.parseInterval(this.index, true);

			// BRE 的 \{ 一定要是合法的次數寫法，parseInterval 失敗時已經丟錯
			if (interval !== null) {
				this.index = interval.next;
				this.applyRepeat(interval.repeat, interval.literal);
			}
		} else {
			this.pushLiteral(char);
		}
	}

	/**
	 * 解析 `{` 之後的次數寫法：`{n}`、`{n,}`、`{,m}`、`{n,m}`，`start` 是 `{` 後面第一個字元。
	 * BRE（`basic` 為 true）的結尾是 `\}`，寫法不對直接丟錯；ERE 的結尾是 `}`，寫法不對回傳 null（當字面字元）。
	 * 兩種語法的前大後小、超過上限都丟 `INVALID_INTERVAL`。
	 */
	private parseInterval(start: number, basic: boolean): ParsedInterval | null {
		let position = start;
		let minText = "";
		let maxText = "";
		let hasComma = false;

		while (this.isDigit(position)) {
			minText += this.chars[position];
			position += 1;
		}

		if (this.chars[position] === ",") {
			hasComma = true;
			position += 1;

			while (this.isDigit(position)) {
				maxText += this.chars[position];
				position += 1;
			}
		}

		const closed = this.isIntervalClose(position, basic);

		if (!closed || (minText === "" && !hasComma)) {
			if (!basic) {
				return null;
			}

			if (this.findBasicIntervalClose(start) === -1) {
				throw new PatternError("UNMATCHED_BRACE");
			}

			throw new PatternError("INVALID_INTERVAL");
		}

		const min = minText === "" ? 0 : Number(minText);
		let max = min;

		if (hasComma) {
			max = maxText === "" ? Infinity : Number(maxText);
		}

		if (min > max || min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT)) {
			throw new PatternError("INVALID_INTERVAL");
		}

		const literal = `{${minText}${hasComma ? "," : ""}${maxText}}`;
		const closeLength = basic ? 2 : 1;

		return { repeat: { min, max }, literal, next: position + closeLength };
	}

	private isDigit(position: number): boolean {
		const char = this.chars[position];
		return char !== undefined && char >= "0" && char <= "9";
	}

	private isIntervalClose(position: number, basic: boolean): boolean {
		if (basic) {
			return this.chars[position] === "\\" && this.chars[position + 1] === "}";
		}

		return this.chars[position] === "}";
	}

	/** 從 `start` 往後找 BRE 的 `\}`，找不到回傳 -1。 */
	private findBasicIntervalClose(start: number): number {
		for (let position = start; position < this.chars.length - 1; position += 1) {
			if (this.chars[position] === "\\" && this.chars[position + 1] === "}") {
				return position;
			}
		}

		return -1;
	}

	/**
	 * 中括號：`[abc]`、`[^abc]`、`[a-z]`、`[[:digit:]]`。
	 * 緊跟在 `[` 或 `[^` 後面的 `]` 是字面字元，開頭或結尾的 `-` 是字面字元，裡面的反斜線也是字面字元。
	 */
	private handleBracket(): void {
		let position = this.index + 1;
		let negated = false;

		if (this.chars[position] === "^") {
			negated = true;
			position += 1;
		}

		const contentStart = position;
		const items: string[] = [];
		let first = true;

		while (first || this.chars[position] !== "]") {
			const char = this.chars[position];

			if (char === undefined) {
				throw new PatternError("UNMATCHED_BRACKET");
			}

			first = false;

			if (char === "[" && this.chars[position + 1] === ":") {
				const classEnd = this.findClassEnd(position + 2);

				if (classEnd !== -1) {
					items.push(this.lookupClass(position + 2, classEnd));
					position = classEnd + 2;
					continue;
				}
			}

			const rangeEnd = this.chars[position + 2];

			if (this.chars[position + 1] === "-" && rangeEnd !== undefined && rangeEnd !== "]") {
				if ((char.codePointAt(0) ?? 0) > (rangeEnd.codePointAt(0) ?? 0)) {
					throw new PatternError("INVALID_RANGE");
				}

				items.push(`${escapeClassChar(char)}-${escapeClassChar(rangeEnd)}`);
				position += 3;
				continue;
			}

			items.push(escapeClassChar(char));
			position += 1;
		}

		// GNU 對 `[:digit:]` 這種少一層中括號的寫法直接報錯，提醒要寫成 `[[:digit:]]`
		const content = this.chars.slice(contentStart, position).join("");

		if (!negated && content.length >= 2 && content.startsWith(":") && content.endsWith(":")) {
			throw new PatternError("CLASS_SYNTAX");
		}

		this.index = position + 1;
		this.pushAtom(`[${negated ? "^" : ""}${items.join("")}]`);
	}

	/** 從 `start` 往後找字元類別結尾的 `:]`，回傳 `:` 的位置，找不到回傳 -1。 */
	private findClassEnd(start: number): number {
		for (let position = start; position < this.chars.length - 1; position += 1) {
			if (this.chars[position] === ":" && this.chars[position + 1] === "]") {
				return position;
			}
		}

		return -1;
	}

	/** 取出 `[:名稱:]` 的名稱並換成 JS 中括號內容，不認得的名稱丟錯。 */
	private lookupClass(start: number, end: number): string {
		const name = this.chars.slice(start, end).join("");
		const source = POSIX_CLASSES[name];

		if (source === undefined) {
			throw new PatternError("INVALID_CLASS_NAME");
		}

		return source;
	}

	private pushAtom(source: string): void {
		this.frame.pieces.push({ source, quantifiable: true, repeat: null });
	}

	private pushLiteral(char: string): void {
		this.pushAtom(escapeLiteral(char));
	}

	private pushAnchor(source: string): void {
		this.frame.pieces.push({ source, quantifiable: false, repeat: null });
	}

	/** `\1` 到 `\9`：只能參照已經寫完（關起來）的群組。包一層避免後面接數字時被 JS 當成 `\10`。 */
	private pushBackReference(groupNumber: number): void {
		if (!this.closedGroups.has(groupNumber)) {
			throw new PatternError("INVALID_BACKREF");
		}

		this.pushAtom(`(?:\\${groupNumber})`);
	}

	/**
	 * 套用次數到前一個片段。
	 * 前面沒有可以加次數的東西（開頭、群組或分支開頭、錨點後面）時：BRE 把它當字面字元，ERE 忽略它（GNU 行為）。
	 * 前一個片段已經有次數時合併成一個；合併後不連續才包一層非擷取群組。
	 */
	private applyRepeat(repeat: Repeat, literal: string): void {
		const pieces = this.frame.pieces;
		const last = pieces[pieces.length - 1];

		if (last === undefined || !last.quantifiable) {
			if (!this.extended) {
				for (const char of Array.from(literal)) {
					this.pushLiteral(char);
				}
			}

			return;
		}

		if (last.repeat === null) {
			last.repeat = repeat;
			return;
		}

		const combined = combineRepeats(last.repeat, repeat);

		if (combined !== null) {
			last.repeat = combined;
			return;
		}

		last.source = `(?:${renderPiece(last)})`;
		last.repeat = repeat;
	}

	private alternate(): void {
		const frame = this.frame;
		frame.branches.push(frame.pieces.map(renderPiece).join(""));
		frame.pieces = [];
	}

	private openGroup(): void {
		this.groupCount += 1;
		this.frames.push({ branches: [], pieces: [], groupNumber: this.groupCount });
	}

	private closeGroup(): void {
		const frame = this.frames.pop();

		if (frame === undefined) {
			throw new PatternError("UNMATCHED_PAREN");
		}

		this.closedGroups.add(frame.groupNumber);
		this.pushAtom(`(${renderFrame(frame)})`);
	}
}

// ---------------------------------------------------------------------------
// 公開函式
// ---------------------------------------------------------------------------

/** 字面比對：`-i` 時兩邊都轉小寫。 */
function compileFixed(pattern: string, ignoreCase: boolean): GrepPatternResult {
	if (ignoreCase) {
		const lowered = pattern.toLowerCase();
		return { ok: true, test: (line) => line.toLowerCase().includes(lowered) };
	}

	return { ok: true, test: (line) => line.includes(pattern) };
}

/**
 * 編譯 `grep` 的樣式。樣式不合法時回傳錯誤代碼，訊息由 `messages.invalidPattern` 組。
 *
 * @example compileGrepPattern("ERROR|WARN", "extended", false) // test("WARN x") 為 true
 */
export function compileGrepPattern(pattern: string, syntax: GrepSyntax, ignoreCase: boolean): GrepPatternResult {
	if (syntax === "fixed") {
		return compileFixed(pattern, ignoreCase);
	}

	let source: string;

	try {
		source = new PatternTranslator(pattern, syntax === "extended").translate();
	} catch (error) {
		if (error instanceof PatternError) {
			return { ok: false, error: error.code };
		}

		throw error;
	}

	// `u` 讓 `.` 與中括號以「字」為單位、可以用 `\p{...}`；`-i` 對應 JS 的 `i`。不加 `g`，test 才沒有狀態
	const flags = ignoreCase ? "iu" : "u";
	const regex = new RegExp(source, flags);

	return { ok: true, test: (line) => regex.test(line) };
}
