// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Token } from "../types";
import type { ParseOptions } from "../types";
import { tokenize } from "./tokenizer";

/** 建立 word token 的小工具，讓期望值好讀。 */
function word(value: string, quoted = false, singleQuoted = false): Token {
	return { kind: "word", value, quoted, singleQuoted };
}

const pipe: Token = { kind: "pipe", value: "|", quoted: false, singleQuoted: false };
const redirect: Token = { kind: "redirect", value: ">", quoted: false, singleQuoted: false };
const redirectAppend: Token = { kind: "redirectAppend", value: ">>", quoted: false, singleQuoted: false };

/** 斷言 tokenize 成功並回傳 tokens。 */
function tokensOf(input: string, options?: ParseOptions): Token[] {
	const result = tokenize(input, options);
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
		expect(tokensOf("cat 'my file.txt'")).toEqual([word("cat"), word("my file.txt", true, true)]);
	});

	it("雙引號內的空格保留", () => {
		expect(tokensOf('cat "my file.txt"')).toEqual([word("cat"), word("my file.txt", true)]);
	});

	it("單引號內的雙引號與反斜線照抄", () => {
		expect(tokensOf(`echo 'a"b\\c'`)).toEqual([word("echo"), word('a"b\\c', true, true)]);
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
		expect(tokensOf("cat '' x")).toEqual([word("cat"), word("", true, true), word("x")]);
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

	it("沒給 env 時雙引號內的 $ 照抄，不做變數展開", () => {
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
		expect(tokensOf("echo 'a|b>c>>d'")).toEqual([word("echo"), word("a|b>c>>d", true, true)]);
	});

	it("雙引號內的符號不切", () => {
		expect(tokensOf('echo "a | b > c"')).toEqual([word("echo"), word("a | b > c", true)]);
	});

	it("引號後緊接符號時先結束 word", () => {
		expect(tokensOf('echo "a"|cat')).toEqual([word("echo"), word("a", true), pipe, word("cat")]);
	});
});

describe("tokenize：singleQuoted", () => {
	it("整個 token 都在單引號內時 singleQuoted 為 true", () => {
		expect(tokensOf("echo 'a b'")).toEqual([word("echo"), word("a b", true, true)]);
	});

	it("連續兩段單引號仍算整個在單引號內", () => {
		expect(tokensOf("echo 'a''b'")).toEqual([word("echo"), word("ab", true, true)]);
	});

	it("單引號與引號外字元混合時 singleQuoted 為 false", () => {
		expect(tokensOf("echo 'a'b")).toEqual([word("echo"), word("ab", true, false)]);
	});

	it("單引號與雙引號串接時 singleQuoted 為 false", () => {
		expect(tokensOf(`echo 'a'"b"`)).toEqual([word("echo"), word("ab", true, false)]);
	});

	it("雙引號的 token singleQuoted 為 false", () => {
		expect(tokensOf('echo "a"')).toEqual([word("echo"), word("a", true, false)]);
	});
});

describe("tokenize：變數展開", () => {
	const env = { HOME: "/home/tech", USER: "tech", NOVA_DIR: "/opt/nova", EMPTY: "" };

	it("引號外的 $NAME 換成變數值", () => {
		expect(tokensOf("cd $HOME", { env })).toEqual([word("cd"), word("/home/tech")]);
	});

	it("變數可以接在路徑中間", () => {
		expect(tokensOf("cat $HOME/wake_up.txt", { env })).toEqual([word("cat"), word("/home/tech/wake_up.txt")]);
	});

	it("名稱遇到不合法字元就結束", () => {
		expect(tokensOf("echo $USER-log", { env })).toEqual([word("echo"), word("tech-log")]);
	});

	it("雙引號內的 $NAME 也會展開", () => {
		expect(tokensOf('echo "dir: $NOVA_DIR"', { env })).toEqual([word("echo"), word("dir: /opt/nova", true)]);
	});

	it("單引號內的 $NAME 照抄", () => {
		expect(tokensOf("echo '$HOME'", { env })).toEqual([word("echo"), word("$HOME", true, true)]);
	});

	it("${NAME} 寫法可以接在字母前面", () => {
		expect(tokensOf("echo ${USER}_log", { env })).toEqual([word("echo"), word("tech_log")]);
	});

	it("雙引號內的 ${NAME} 也會展開", () => {
		expect(tokensOf('echo "${HOME}/x"', { env })).toEqual([word("echo"), word("/home/tech/x", true)]);
	});

	it("未定義的變數換成空字串", () => {
		expect(tokensOf("echo a$NOPE.txt", { env })).toEqual([word("echo"), word("a.txt")]);
	});

	it("$ 後面不是合法名稱開頭時原樣保留", () => {
		expect(tokensOf("echo $1 $ a$", { env })).toEqual([word("echo"), word("$1"), word("$"), word("a$")]);
	});

	it("${ 後面不是合法名稱時原樣保留", () => {
		expect(tokensOf("echo ${1} ${", { env })).toEqual([word("echo"), word("${1}"), word("${")]);
	});

	it("沒有引號且展開後是空字串的 token 直接丟掉", () => {
		expect(tokensOf("echo $NOPE x $EMPTY", { env })).toEqual([word("echo"), word("x")]);
	});

	it("有引號包住的空展開保留成空字串 token", () => {
		expect(tokensOf('echo "$NOPE" x', { env })).toEqual([word("echo"), word("", true), word("x")]);
	});

	it("展開出來的符號不會變成管線或重導向", () => {
		expect(tokensOf("echo $SYM", { env: { SYM: "a|b>c" } })).toEqual([word("echo"), word("a|b>c")]);
	});

	it("變數與管線、重導向一起用", () => {
		expect(tokensOf("ls $HOME|cat>$USER.txt", { env })).toEqual([
			word("ls"),
			word("/home/tech"),
			pipe,
			word("cat"),
			redirect,
			word("tech.txt"),
		]);
	});

	it("沒給 env 時引號外的 $NAME 也不展開", () => {
		expect(tokensOf("cd $HOME")).toEqual([word("cd"), word("$HOME")]);
	});
});
