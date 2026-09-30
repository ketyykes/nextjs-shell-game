// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Token } from "../types";
import { tokenize } from "./tokenizer";

/** 建立 word token 的小工具，讓期望值好讀。 */
function word(value: string, quoted = false): Token {
	return { kind: "word", value, quoted };
}

const pipe: Token = { kind: "pipe", value: "|", quoted: false };
const redirect: Token = { kind: "redirect", value: ">", quoted: false };
const redirectAppend: Token = { kind: "redirectAppend", value: ">>", quoted: false };

/** 斷言 tokenize 成功並回傳 tokens。 */
function tokensOf(input: string): Token[] {
	const result = tokenize(input);
	if (!result.ok) {
		throw new Error(`預期成功，卻得到錯誤：${result.error.code}`);
	}
	return result.tokens;
}

describe("tokenize：空白分隔", () => {
	it("以單一空格分隔", () => {
		expect(tokensOf("cat wake_up.txt")).toEqual([word("cat"), word("wake_up.txt")]);
	});

	it("連續多個空白視為一個", () => {
		expect(tokensOf("ls    -la     /home")).toEqual([word("ls"), word("-la"), word("/home")]);
	});

	it("tab 也是分隔字元", () => {
		expect(tokensOf("ls\t-a \t /")).toEqual([word("ls"), word("-a"), word("/")]);
	});

	it("忽略前後空白", () => {
		expect(tokensOf("   pwd   ")).toEqual([word("pwd")]);
	});

	it("空輸入回傳空陣列", () => {
		expect(tokensOf("")).toEqual([]);
	});

	it("全空白回傳空陣列", () => {
		expect(tokensOf(" \t  ")).toEqual([]);
	});

	it("中文檔名照常切分", () => {
		expect(tokensOf("cat 日誌.txt")).toEqual([word("cat"), word("日誌.txt")]);
	});
});

describe("tokenize：引號", () => {
	it("單引號內的空格保留", () => {
		expect(tokensOf("cat 'my file.txt'")).toEqual([word("cat"), word("my file.txt", true)]);
	});

	it("雙引號內的空格保留", () => {
		expect(tokensOf('cat "my file.txt"')).toEqual([word("cat"), word("my file.txt", true)]);
	});

	it("單引號內的雙引號與反斜線照抄", () => {
		expect(tokensOf(`echo 'a"b\\c'`)).toEqual([word("echo"), word('a"b\\c', true)]);
	});

	it("雙引號內的單引號照抄", () => {
		expect(tokensOf(`echo "it's"`)).toEqual([word("echo"), word("it's", true)]);
	});

	it("引號在 token 中間時與前後字接成一個 token", () => {
		expect(tokensOf('ab"c d"e')).toEqual([word("abc de", true)]);
	});

	it("單雙引號可以串接", () => {
		expect(tokensOf(`'a b'"c d"`)).toEqual([word("a bc d", true)]);
	});

	it("空的雙引號產生一個空字串 token", () => {
		expect(tokensOf('cat ""')).toEqual([word("cat"), word("", true)]);
	});

	it("空的單引號產生一個空字串 token", () => {
		expect(tokensOf("cat '' x")).toEqual([word("cat"), word("", true), word("x")]);
	});

	it("雙引號內 \\\" 視為字面雙引號", () => {
		expect(tokensOf('echo "say \\"hi\\""')).toEqual([word("echo"), word('say "hi"', true)]);
	});

	it("雙引號內 \\\\ 視為一個反斜線", () => {
		expect(tokensOf('echo "a\\\\b"')).toEqual([word("echo"), word("a\\b", true)]);
	});

	it("雙引號內其他反斜線原樣保留", () => {
		expect(tokensOf('echo "a\\nb"')).toEqual([word("echo"), word("a\\nb", true)]);
	});

	it("引號外的反斜線原樣保留，不當跳脫", () => {
		expect(tokensOf("cat a\\ b")).toEqual([word("cat"), word("a\\"), word("b")]);
	});

	it("雙引號內的 $ 照抄，不做變數展開", () => {
		expect(tokensOf('echo "$HOME"')).toEqual([word("echo"), word("$HOME", true)]);
	});
});

describe("tokenize：未關引號", () => {
	it("單引號沒關回傳 UNCLOSED_QUOTE，detail 是單引號", () => {
		expect(tokenize("cat 'abc")).toEqual({
			ok: false,
			error: { code: "UNCLOSED_QUOTE", detail: "'" },
		});
	});

	it("雙引號沒關回傳 UNCLOSED_QUOTE，detail 是雙引號", () => {
		expect(tokenize('cat "abc')).toEqual({
			ok: false,
			error: { code: "UNCLOSED_QUOTE", detail: '"' },
		});
	});

	it("結尾的 \\\" 被跳脫，雙引號仍算沒關", () => {
		expect(tokenize('cat "abc\\"')).toEqual({
			ok: false,
			error: { code: "UNCLOSED_QUOTE", detail: '"' },
		});
	});

	it("雙引號內的單引號不影響配對", () => {
		expect(tokenize(`cat "it's`)).toEqual({
			ok: false,
			error: { code: "UNCLOSED_QUOTE", detail: '"' },
		});
	});
});

describe("tokenize：管線與重導向", () => {
	it("前後有空白的管線", () => {
		expect(tokensOf("ls | grep a")).toEqual([word("ls"), pipe, word("grep"), word("a")]);
	});

	it("黏著的管線也要切開", () => {
		expect(tokensOf("ls|grep a")).toEqual([word("ls"), pipe, word("grep"), word("a")]);
	});

	it("前後有空白的重導向", () => {
		expect(tokensOf("ls > out")).toEqual([word("ls"), redirect, word("out")]);
	});

	it("黏著的重導向切成三個 token", () => {
		expect(tokensOf("ls>out")).toEqual([word("ls"), redirect, word("out")]);
	});

	it(">> 產生 redirectAppend", () => {
		expect(tokensOf("ls >> out")).toEqual([word("ls"), redirectAppend, word("out")]);
	});

	it("黏著的 >> 也要切開", () => {
		expect(tokensOf("ls>>out")).toEqual([word("ls"), redirectAppend, word("out")]);
	});

	it("> > 中間有空白時是兩個 redirect", () => {
		expect(tokensOf("ls > > out")).toEqual([word("ls"), redirect, redirect, word("out")]);
	});

	it("單引號內的符號不切", () => {
		expect(tokensOf("echo 'a|b>c>>d'")).toEqual([word("echo"), word("a|b>c>>d", true)]);
	});

	it("雙引號內的符號不切", () => {
		expect(tokensOf('echo "a | b > c"')).toEqual([word("echo"), word("a | b > c", true)]);
	});

	it("引號後緊接符號時先結束 word", () => {
		expect(tokensOf('echo "a"|cat')).toEqual([word("echo"), word("a", true), pipe, word("cat")]);
	});
});
