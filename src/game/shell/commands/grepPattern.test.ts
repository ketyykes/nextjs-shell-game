// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RegexErrorCode } from "../types";
import { compileGrepPattern } from "./grepPattern";
import type { GrepSyntax } from "./grepPattern";

/** 編譯樣式後挑出符合的行；編譯失敗直接讓測試掛掉。 */
function matching(pattern: string, lines: string[], syntax: GrepSyntax = "basic", ignoreCase = false): string[] {
	const result = compileGrepPattern(pattern, syntax, ignoreCase);

	if (!result.ok) {
		throw new Error(`樣式 ${pattern} 編譯失敗：${result.error}`);
	}

	return lines.filter((line) => result.test(line));
}

/** 編譯樣式，回傳錯誤代碼；編譯成功回傳 null。 */
function errorOf(pattern: string, syntax: GrepSyntax = "basic"): RegexErrorCode | null {
	const result = compileGrepPattern(pattern, syntax, false);

	if (result.ok) {
		return null;
	}

	return result.error;
}

describe("基本正規表示式（BRE，grep 預設）", () => {
	it(". 配任意一個字元，中文也算一個字", () => {
		expect(matching("a.c", ["abc", "a.c", "ac", "a中c"])).toEqual(["abc", "a.c", "a中c"]);
	});

	it("\\. 是句點本身", () => {
		expect(matching("v3\\.1", ["v3.1", "v321"])).toEqual(["v3.1"]);
	});

	it("* 是前一個字重複零次以上，.* 配任意長度", () => {
		expect(matching("ab*c", ["ac", "abc", "abbbc", "adc"])).toEqual(["ac", "abc", "abbbc"]);
		expect(matching("ERROR.*C2", ["21:42 ERROR 艙門 C2 無回應", "ERROR C3", "C2 ERROR"])).toEqual([
			"21:42 ERROR 艙門 C2 無回應",
		]);
	});

	it("^ 是行首、$ 是行尾，^$ 配空行", () => {
		expect(matching("^21:4", ["21:40 開始", "時間 21:40"])).toEqual(["21:40 開始"]);
		expect(matching("OPEN$", ["A1 OPEN", "OPEN A1"])).toEqual(["A1 OPEN"]);
		expect(matching("^$", ["", "a"])).toEqual([""]);
	});

	it("^ 不在開頭、$ 不在結尾時是字面字元", () => {
		expect(matching("a^b", ["a^b", "ab"])).toEqual(["a^b"]);
		expect(matching("a$b", ["a$b", "ab"])).toEqual(["a$b"]);
	});

	it("[...] 配其中一個字，[^...] 配不在裡面的字，可以寫範圍", () => {
		expect(matching("C[23]", ["C1", "C2", "C3"])).toEqual(["C2", "C3"]);
		expect(matching("^[^0-9]", ["123", "a12"])).toEqual(["a12"]);
		expect(matching("[a-c]x", ["bx", "dx"])).toEqual(["bx"]);
	});

	it("] 放在 [ 後第一個、- 放在最後時是字面字元", () => {
		expect(matching("[]a]", ["]", "b"])).toEqual(["]"]);
		expect(matching("[^]a]", ["]", "a", "b"])).toEqual(["b"]);
		expect(matching("x[a-]", ["x-", "xb"])).toEqual(["x-"]);
	});

	it("[[:digit:]] 這類 POSIX 字元類別", () => {
		expect(matching("^[[:digit:]][[:digit:]]:", ["21:40", "ab:"])).toEqual(["21:40"]);
		expect(matching("[[:upper:]]", ["abc", "aBc"])).toEqual(["aBc"]);
		expect(matching("a[[:space:]]b", ["a b", "ab"])).toEqual(["a b"]);
		expect(matching("[[:alpha:]]", ["中", "1"])).toEqual(["中"]);
	});

	it("中括號裡的反斜線是字面字元", () => {
		expect(matching("[\\.]", ["\\", ".", "a"])).toEqual(["\\", "."]);
	});

	it("+ ? | ( ) { } 在 BRE 裡是字面字元", () => {
		expect(matching("a+b", ["a+b", "aab"])).toEqual(["a+b"]);
		expect(matching("ab?", ["ab?", "a"])).toEqual(["ab?"]);
		expect(matching("a|b", ["a|b", "a", "b"])).toEqual(["a|b"]);
		expect(matching("(x)", ["(x)", "x"])).toEqual(["(x)"]);
		expect(matching("a{2}", ["a{2}", "aa"])).toEqual(["a{2}"]);
	});

	it("GNU 延伸：\\+ \\? \\| \\( \\) \\{ \\} 有特殊意義", () => {
		expect(matching("a\\+b", ["aab", "b", "a+b"])).toEqual(["aab"]);
		expect(matching("colou\\?r", ["color", "colour", "colouur"])).toEqual(["color", "colour"]);
		expect(matching("ERROR\\|WARN", ["ERROR x", "WARN y", "INFO z"])).toEqual(["ERROR x", "WARN y"]);
		expect(matching("^\\(ab\\)\\{2\\}$", ["abab", "ab", "ababab"])).toEqual(["abab"]);
	});

	it("開頭、\\( 後面、^ 後面的 * 是字面字元", () => {
		expect(matching("*abc", ["*abc", "xabc"])).toEqual(["*abc"]);
		expect(matching("^*b", ["*b", "b"])).toEqual(["*b"]);
		expect(matching("\\(*a\\)", ["*a", "a"])).toEqual(["*a"]);
	});

	it("\\1 回頭參照前面的群組", () => {
		expect(matching("\\(ab\\)\\1", ["abab", "abcd"])).toEqual(["abab"]);
	});

	it("反斜線接普通字元時就是那個字元", () => {
		expect(matching("\\a", ["a", "b"])).toEqual(["a"]);
	});

	it("\\w 配文字字元、\\< \\> 是單字邊界", () => {
		expect(matching("^\\w\\+$", ["door", "艙門", "a b"])).toEqual(["door", "艙門"]);
		expect(matching("\\<door\\>", ["door", "indoor", "the door", "doors"])).toEqual(["door", "the door"]);
	});

	it("連續的 * 等於一個 *", () => {
		expect(matching("^ab**c$", ["ac", "abbc", "adc"])).toEqual(["ac", "abbc"]);
	});

	it("-i 不分大小寫", () => {
		expect(matching("error", ["ERROR", "error", "Err"], "basic", true)).toEqual(["ERROR", "error"]);
	});
});

describe("延伸正規表示式（ERE，grep -E）", () => {
	it("+ ? | ( ) { } 有特殊意義", () => {
		expect(matching("a+b", ["aab", "b", "a+b"], "extended")).toEqual(["aab"]);
		expect(matching("colou?r", ["color", "colour"], "extended")).toEqual(["color", "colour"]);
		expect(matching("ERROR|WARN", ["ERROR x", "WARN y", "INFO z"], "extended")).toEqual(["ERROR x", "WARN y"]);
		expect(matching("^(INFO|WARN) ", ["INFO a", "WARN b", "ERROR c"], "extended")).toEqual(["INFO a", "WARN b"]);
		expect(matching("^(ab){2}$", ["abab", "ab"], "extended")).toEqual(["abab"]);
	});

	it("加了反斜線的 \\+ \\( \\| \\{ 是字面字元", () => {
		expect(matching("a\\+b", ["a+b", "aab"], "extended")).toEqual(["a+b"]);
		expect(matching("\\(x\\)", ["(x)", "x"], "extended")).toEqual(["(x)"]);
		expect(matching("a\\|b", ["a|b", "a"], "extended")).toEqual(["a|b"]);
		expect(matching("a\\{", ["a{", "a"], "extended")).toEqual(["a{"]);
	});

	it("不是次數寫法的 { 與單獨的 ) 是字面字元", () => {
		expect(matching("a{", ["a{", "a"], "extended")).toEqual(["a{"]);
		expect(matching("a{1,x}", ["a{1,x}", "a"], "extended")).toEqual(["a{1,x}"]);
		expect(matching("a)", ["a)", "a"], "extended")).toEqual(["a)"]);
	});

	it("開頭或 | 後面的 * 會被忽略（跟 GNU grep 一樣）", () => {
		expect(matching("*abc", ["*abc", "xabc", "ab"], "extended")).toEqual(["*abc", "xabc"]);
		expect(matching("a|*b", ["*b", "b", "c"], "extended")).toEqual(["*b", "b"]);
	});

	it("^ 與 $ 在任何位置都是錨點", () => {
		expect(matching("a^b", ["a^b", "ab"], "extended")).toEqual([]);
	});

	it("疊在一起的次數會相乘，{,n} 代表零到 n 次", () => {
		expect(matching("^a{2}{3}$", ["aaaaaa", "aaaa"], "extended")).toEqual(["aaaaaa"]);
		expect(matching("^a{,2}b$", ["b", "ab", "aab", "aaab"], "extended")).toEqual(["b", "ab", "aab"]);
	});

	it("空群組與空分支配所有行", () => {
		expect(matching("()", ["x"], "extended")).toEqual(["x"]);
		expect(matching("a|", ["x"], "extended")).toEqual(["x"]);
	});

	it("疊很多層的次數不會讓比對變慢", () => {
		const line = `${"a".repeat(40)}b`;
		expect(matching("^a+*+*+*+*c$", [line], "extended")).toEqual([]);
		expect(matching("^a**********c$", [line])).toEqual([]);
	});
});

describe("字面比對（grep -F）", () => {
	it("所有字元都照字面", () => {
		expect(matching("a.c", ["abc", "a.c"], "fixed")).toEqual(["a.c"]);
		expect(matching("a[1", ["a[1]", "a1"], "fixed")).toEqual(["a[1]"]);
		expect(matching("x\\", ["x\\", "x"], "fixed")).toEqual(["x\\"]);
	});

	it("-i 不分大小寫", () => {
		expect(matching("lock", ["LOCK", "Lock", "lok"], "fixed", true)).toEqual(["LOCK", "Lock"]);
	});

	it("不會有樣式錯誤", () => {
		expect(errorOf("[a", "fixed")).toBeNull();
		expect(errorOf("\\", "fixed")).toBeNull();
	});
});

describe("不合法的樣式", () => {
	it.each<[string, GrepSyntax, RegexErrorCode]>([
		["a\\", "basic", "TRAILING_BACKSLASH"],
		["a\\", "extended", "TRAILING_BACKSLASH"],
		["[a", "basic", "UNMATCHED_BRACKET"],
		["[[:digit:]", "basic", "UNMATCHED_BRACKET"],
		["a[]", "basic", "UNMATCHED_BRACKET"],
		["\\(a", "basic", "UNMATCHED_PAREN"],
		["a\\)", "basic", "UNMATCHED_PAREN"],
		["(a", "extended", "UNMATCHED_PAREN"],
		["a\\{", "basic", "UNMATCHED_BRACE"],
		["a\\{1", "basic", "UNMATCHED_BRACE"],
		["a\\{x\\}", "basic", "INVALID_INTERVAL"],
		["a\\{3,1\\}", "basic", "INVALID_INTERVAL"],
		["a{3,1}", "extended", "INVALID_INTERVAL"],
		["a{99999}", "extended", "INVALID_INTERVAL"],
		["[z-a]", "basic", "INVALID_RANGE"],
		["[[:foo:]]", "basic", "INVALID_CLASS_NAME"],
		["[:alpha:]", "basic", "CLASS_SYNTAX"],
		["\\(ab\\)\\2", "basic", "INVALID_BACKREF"],
		["\\1", "basic", "INVALID_BACKREF"],
		["(a)\\2", "extended", "INVALID_BACKREF"],
	])("%s（%s）回報 %s", (pattern, syntax, code) => {
		expect(errorOf(pattern, syntax)).toBe(code);
	});
});
