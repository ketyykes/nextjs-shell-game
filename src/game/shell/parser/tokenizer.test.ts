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


	it("沒給 env 時雙引號內的 $ 照抄，不做變數展開", () => {
		expect(tokensOf('echo "$HOME"')).toEqual([word("echo"), word("$HOME", true)]);
	});
});

describe("tokenize：引號外的反斜線跳脫", () => {
	const env = { HOME: "/home/crew" };

	it("反斜線加空白是字面空白，不切 token", () => {
		expect(tokensOf("cat a\\ b")).toEqual([word("cat"), word("a b", true)]);
	});

	it("反斜線加普通字元就是那個字元本身", () => {
		expect(tokensOf("grep v3\\.1")).toEqual([word("grep"), word("v3.1", true)]);
	});

	it("兩個反斜線是一個字面反斜線", () => {
		expect(tokensOf("echo a\\\\b")).toEqual([word("echo"), word("a\\b", true)]);
	});

	it("跳脫的管線與重導向符號是一般字元", () => {
		expect(tokensOf("echo a\\|b \\> c")).toEqual([word("echo"), word("a|b", true), word(">", true), word("c")]);
	});

	it("跳脫的引號是字面引號，不開始引號段落", () => {
		expect(tokensOf("echo \\'hi\\\"")).toEqual([word("echo"), word("'hi\"", true)]);
	});

	it("跳脫的 $ 不做變數展開", () => {
		expect(tokensOf("echo \\$HOME $HOME", { env })).toEqual([word("echo"), word("$HOME", true), word("/home/crew")]);
	});

	it("跳脫的萬用字元標成 quoted，不做萬用字元展開", () => {
		expect(tokensOf("ls \\*.log")).toEqual([word("ls"), word("*.log", true)]);
	});

	it("單獨跳脫空白也是一個 token", () => {
		expect(tokensOf("echo \\ ")).toEqual([word("echo"), word(" ", true)]);
	});

	it("結尾的反斜線原樣保留（bash -c 的行為）", () => {
		expect(tokensOf("echo a\\")).toEqual([word("echo"), word("a\\")]);
	});

	it("雙引號內 \\$ 是字面的 $，不展開", () => {
		expect(tokensOf('echo "\\$HOME"', { env })).toEqual([word("echo"), word("$HOME", true)]);
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

/** `;` token，`offset` 是它在輸入裡的字元位置。 */
function semicolon(offset: number): Token {
	return { kind: "semicolon", value: ";", quoted: false, singleQuoted: false, offset };
}

/** `&&` token，`offset` 是第一個 `&` 在輸入裡的字元位置。 */
function and(offset: number): Token {
	return { kind: "and", value: "&&", quoted: false, singleQuoted: false, offset };
}

describe("tokenize：; 與 &&", () => {
	it("; 切成 semicolon token 並記下位置", () => {
		expect(tokensOf("cd a ; ls")).toEqual([word("cd"), word("a"), semicolon(5), word("ls")]);
	});

	it("黏著的 ; 也要切開", () => {
		expect(tokensOf("cd a;ls")).toEqual([word("cd"), word("a"), semicolon(4), word("ls")]);
	});

	it("&& 切成 and token 並記下位置", () => {
		expect(tokensOf("cd a && ls")).toEqual([word("cd"), word("a"), and(5), word("ls")]);
	});

	it("黏著的 && 也要切開", () => {
		expect(tokensOf("cd a&&ls")).toEqual([word("cd"), word("a"), and(4), word("ls")]);
	});

	it("位置以字元計，中文字算一個", () => {
		expect(tokensOf("cat 日誌;ls")).toEqual([word("cat"), word("日誌"), semicolon(6), word("ls")]);
	});

	it("引號內的 ; 與 && 是字面值", () => {
		expect(tokensOf(`echo 'a;b' "c && d"`)).toEqual([word("echo"), word("a;b", true, true), word("c && d", true)]);
	});

	it("反斜線跳脫的 ; 與 & 是字面值", () => {
		expect(tokensOf("echo a\\;b \\&\\&")).toEqual([word("echo"), word("a;b", true), word("&&", true)]);
	});

	it("展開出來的 ; 與 && 不會變成符號", () => {
		expect(tokensOf("echo $SYM", { env: { SYM: "a;b&&c" } })).toEqual([word("echo"), word("a;b&&c")]);
	});
});

/** 斷言 tokenize 回傳「不支援的語法」錯誤，回傳 detail。 */
function unsupportedDetailOf(input: string, options?: ParseOptions): string {
	const result = tokenize(input, options);
	if (result.ok) {
		throw new Error(`預期 UNSUPPORTED_SYNTAX，卻成功切出 ${result.tokens.length} 個 token`);
	}
	expect(result.error.code).toBe("UNSUPPORTED_SYNTAX");
	return result.error.detail;
}

describe("tokenize：仍不支援的語法回傳 UNSUPPORTED_SYNTAX（M13-1，第十九場縮小範圍）", () => {
	it.each([
		["sleep 5 &", "&"],
		["ls & pwd", "&"],
		["cat << EOF", "<<"],
		["cat <<< hi", "<<<"],
		["diff <(ls) x", "<("],
		["sort 0< data.txt", "0<"],
		["sort <& 3", "<&"],
		["sort <> data.txt", "<>"],
		["echo oops >&2", ">&2"],
		["echo oops 1>&2", "1>&2"],
		["ls >& out.txt", ">&"],
		["ls 2>&- x", "2>&-"],
		["ls 2>&2", "2>&2"],
		["ls 3> out.txt", "3>"],
		["ls |& cat", "|&"],
		["echo $((1+2))", "$(("],
		['echo "$((1+2))"', "$(("],
	])("%s → %s", (input, detail) => {
		expect(unsupportedDetailOf(input)).toBe(detail);
	});

	it("單引號內全部是字面值", () => {
		expect(tokensOf("echo '|| & < 2> $(pwd) `x`'")).toEqual([word("echo"), word("|| & < 2> $(pwd) `x`", true, true)]);
	});

	it("雙引號內的 || & < 2> 是字面值", () => {
		expect(tokensOf('echo "a || b & c < d 2> e"')).toEqual([word("echo"), word("a || b & c < d 2> e", true)]);
	});

	it("雙引號內的 \\` 是字面的反引號", () => {
		expect(tokensOf('echo "\\`"')).toEqual([word("echo"), word("`", true)]);
	});

	it("反斜線跳脫的符號是字面值", () => {
		expect(tokensOf("echo \\| \\& \\< \\` \\$(pwd)")).toEqual([
			word("echo"),
			word("|", true),
			word("&", true),
			word("<", true),
			word("`", true),
			word("$(pwd)", true),
		]);
	});

	it("數字黏在其他字後面時不是檔案描述元，> 照常是重導向", () => {
		expect(tokensOf("echo a2>b")).toEqual([word("echo"), word("a2"), redirect, word("b")]);
	});

	it("數字跟 > 之間有空白時，數字是參數", () => {
		expect(tokensOf("echo 2 > b")).toEqual([word("echo"), word("2"), redirect, word("b")]);
	});

	it("引號包住或變數展開出來的數字不是檔案描述元", () => {
		expect(tokensOf('echo "2">b')).toEqual([word("echo"), word("2", true), redirect, word("b")]);
		expect(tokensOf("echo $N>b", { env: { N: "2" } })).toEqual([word("echo"), word("2"), redirect, word("b")]);
	});
});

/** `||` token，`offset` 是第一個 `|` 在輸入裡的字元位置。 */
function or(offset: number): Token {
	return { kind: "or", value: "||", quoted: false, singleQuoted: false, offset };
}

/** 重導向類的符號 token（沒有 offset）。 */
function operator(kind: Token["kind"], value: string): Token {
	return { kind, value, quoted: false, singleQuoted: false };
}

const redirectIn = operator("redirectIn", "<");
const redirectErr = operator("redirectErr", "2>");
const redirectErrAppend = operator("redirectErrAppend", "2>>");
const redirectErrToOut = operator("redirectErrToOut", "2>&1");
const redirectBoth = operator("redirectBoth", "&>");
const redirectBothAppend = operator("redirectBothAppend", "&>>");

describe("tokenize：||（第十九場）", () => {
	it("|| 切成 or token 並記下位置", () => {
		expect(tokensOf("ls || echo no")).toEqual([word("ls"), or(3), word("echo"), word("no")]);
	});

	it("黏著的 || 也要切開", () => {
		expect(tokensOf("ls||echo no")).toEqual([word("ls"), or(2), word("echo"), word("no")]);
	});

	it("引號內與跳脫的 || 是字面值", () => {
		expect(tokensOf("echo 'a||b' \\|\\|")).toEqual([word("echo"), word("a||b", true, true), word("||", true)]);
	});

	it("跟 ; 與 && 一起出現時各自記下位置", () => {
		expect(tokensOf("a && b || c ; d")).toEqual([
			word("a"),
			and(2),
			word("b"),
			or(7),
			word("c"),
			semicolon(12),
			word("d"),
		]);
	});
});

describe("tokenize：輸入重導向 <（第十九場）", () => {
	it("< 切成 redirectIn", () => {
		expect(tokensOf("sort < data.txt")).toEqual([word("sort"), redirectIn, word("data.txt")]);
	});

	it("黏著的 < 也要切開", () => {
		expect(tokensOf("wc -l<data.txt")).toEqual([word("wc"), word("-l"), redirectIn, word("data.txt")]);
	});

	it("< 可以寫在指令前面", () => {
		expect(tokensOf("< data.txt sort")).toEqual([redirectIn, word("data.txt"), word("sort")]);
	});

	it("緊接在 < 後面的 ~ 也展開", () => {
		expect(tokensOf("sort <~/x", { home: "/home/tech" })).toEqual([word("sort"), redirectIn, word("/home/tech/x")]);
	});
});

describe("tokenize：錯誤輸出重導向（第十九場）", () => {
	it("2> 與 2>> 切成 redirectErr、redirectErrAppend", () => {
		expect(tokensOf("ls 2> err.txt")).toEqual([word("ls"), redirectErr, word("err.txt")]);
		expect(tokensOf("ls 2>err.txt")).toEqual([word("ls"), redirectErr, word("err.txt")]);
		expect(tokensOf("ls 2>> err.txt")).toEqual([word("ls"), redirectErrAppend, word("err.txt")]);
	});

	it("2>/dev/null 的目標是一般 word", () => {
		expect(tokensOf("find / -name x 2>/dev/null")).toEqual([
			word("find"),
			word("/"),
			word("-name"),
			word("x"),
			redirectErr,
			word("/dev/null"),
		]);
	});

	it("2>&1 是一個 token，可以接在 > 後面或前面", () => {
		expect(tokensOf("ls 2>&1")).toEqual([word("ls"), redirectErrToOut]);
		expect(tokensOf("ls > out 2>&1")).toEqual([word("ls"), redirect, word("out"), redirectErrToOut]);
		expect(tokensOf("ls 2>&1>out")).toEqual([word("ls"), redirectErrToOut, redirect, word("out")]);
	});

	it("&> 與 &>> 切成 redirectBoth、redirectBothAppend", () => {
		expect(tokensOf("ls &> all.txt")).toEqual([word("ls"), redirectBoth, word("all.txt")]);
		expect(tokensOf("ls &>>all.txt")).toEqual([word("ls"), redirectBothAppend, word("all.txt")]);
	});

	it("1> 與 1>> 就是 > 與 >>，符號保留玩家的寫法", () => {
		expect(tokensOf("ls 1> out")).toEqual([word("ls"), operator("redirect", "1>"), word("out")]);
		expect(tokensOf("ls 1>>out")).toEqual([word("ls"), operator("redirectAppend", "1>>"), word("out")]);
	});

	it("&& 與 &> 分得開", () => {
		expect(tokensOf("ls&&ls&>x")).toEqual([word("ls"), and(2), word("ls"), redirectBoth, word("x")]);
	});
});

/** 斷言 tokenize 成功並回傳 tokens 與指令替換的原文清單。 */
function resultOf(input: string, options?: ParseOptions): { tokens: Token[]; substitutions: string[] } {
	const result = tokenize(input, options);
	if (!result.ok) {
		throw new Error(`預期成功，卻得到錯誤：${result.error.code} ${result.error.detail}`);
	}
	return { tokens: result.tokens, substitutions: result.substitutions };
}

describe("tokenize：指令替換，沒給 substitute 時原樣保留（第十九場）", () => {
	it("$( ) 整段併進目前的 word，裡面的 | 與 ; 不切", () => {
		expect(resultOf("cat $(ls | head -n 1) ; ls")).toEqual({
			tokens: [word("cat"), word("$(ls | head -n 1)"), semicolon(22), word("ls")],
			substitutions: ["ls | head -n 1"],
		});
	});

	it("反引號整段併進目前的 word", () => {
		expect(resultOf("kill `ps | grep nova`")).toEqual({
			tokens: [word("kill"), word("`ps | grep nova`")],
			substitutions: ["ps | grep nova"],
		});
	});

	it("雙引號內的 $( ) 也記下來", () => {
		expect(resultOf('echo "今天是 $(cat date.txt)"')).toEqual({
			tokens: [word("echo"), word("今天是 $(cat date.txt)", true)],
			substitutions: ["cat date.txt"],
		});
	});

	it("巢狀的 $( ) 只記最外層，裡面的交給執行時再解析", () => {
		expect(resultOf("echo $(ls $(echo /))")).toEqual({
			tokens: [word("echo"), word("$(ls $(echo /))")],
			substitutions: ["ls $(echo /)"],
		});
	});

	it("裡面引號內的 ) 不算結尾", () => {
		expect(resultOf(`echo $(echo ")" ')') x`)).toEqual({
			tokens: [word("echo"), word(`$(echo ")" ')')`), word("x")],
			substitutions: [`echo ")" ')'`],
		});
	});

	it("有給 env 時 $( ) 裡面的變數也不展開，原樣留給執行時", () => {
		expect(resultOf("echo $(cd $HOME) $HOME", { env: { HOME: "/home/tech" } }).tokens).toEqual([
			word("echo"),
			word("$(cd $HOME)"),
			word("/home/tech"),
		]);
	});

	it("沒有指令替換時 substitutions 是空陣列", () => {
		expect(resultOf("ls").substitutions).toEqual([]);
	});

	it("$( 沒關回傳 UNCLOSED_SUBSTITUTION", () => {
		expect(tokenize("echo $(pwd")).toEqual({ ok: false, error: { code: "UNCLOSED_SUBSTITUTION", detail: "$(" } });
		expect(tokenize('echo "$(pwd"')).toEqual({ ok: false, error: { code: "UNCLOSED_SUBSTITUTION", detail: "$(" } });
	});

	it("反引號沒關回傳 UNCLOSED_SUBSTITUTION", () => {
		expect(tokenize("echo `pwd")).toEqual({ ok: false, error: { code: "UNCLOSED_SUBSTITUTION", detail: "`" } });
	});

	it("$( ) 裡面的引號沒關時 ) 也被吃進引號，一樣回 $( 沒關（訊息會提醒引號要成對）", () => {
		expect(tokenize("echo $(echo 'a)")).toEqual({ ok: false, error: { code: "UNCLOSED_SUBSTITUTION", detail: "$(" } });
	});
});

describe("tokenize：指令替換，有給 substitute 時代入輸出（第十九場）", () => {
	/** 固定回傳 `output` 的 substitute，順便記下被要求執行的原文。 */
	function fixed(output: string): { substitute: (source: string) => string; calls: string[] } {
		const calls: string[] = [];
		return {
			calls,
			substitute: (source) => {
				calls.push(source);
				return output;
			},
		};
	}

	it("引號外的輸出照空白與換行切成好幾個 word", () => {
		const { substitute, calls } = fixed("a b\nc\n");
		expect(tokensOf("echo $(ls)", { substitute })).toEqual([word("echo"), word("a"), word("b"), word("c")]);
		expect(calls).toEqual(["ls"]);
	});

	it("雙引號內不切，整段一個 word，去掉結尾的換行", () => {
		const { substitute } = fixed("a b\nc\n\n");
		expect(tokensOf('echo "[$(ls)]"', { substitute })).toEqual([word("echo"), word("[a b\nc]", true)]);
	});

	it("前後黏著的字併進第一個與最後一個 word", () => {
		const { substitute } = fixed("a b");
		expect(tokensOf("echo pre$(x)post", { substitute })).toEqual([word("echo"), word("prea"), word("bpost")]);
	});

	it("引號外輸出是空的時這個 word 直接丟掉，雙引號內保留空字串", () => {
		const { substitute } = fixed("\n");
		expect(tokensOf("echo $(x) y", { substitute })).toEqual([word("echo"), word("y")]);
		expect(tokensOf('echo "$(x)" y', { substitute })).toEqual([word("echo"), word("", true), word("y")]);
	});

	it("代入的輸出不算引號，萬用字元照樣會展開；裡面的符號不會變成管線", () => {
		const { substitute } = fixed("*.txt|a>b");
		expect(tokensOf("ls $(x)", { substitute })).toEqual([word("ls"), word("*.txt|a>b")]);
	});

	it("代入的數字不算檔案描述元", () => {
		const { substitute } = fixed("2");
		expect(tokensOf("echo $(x)>f", { substitute })).toEqual([word("echo"), word("2"), redirect, word("f")]);
	});

	it("依出現順序執行，反引號裡的 \\` 還原成反引號", () => {
		const { substitute, calls } = fixed("v");
		tokensOf('echo $(a) `b \\`c\\`` "$(d)"', { substitute });
		expect(calls).toEqual(["a", "b `c`", "d"]);
	});

	it("單引號內與跳脫過的不執行", () => {
		const { substitute, calls } = fixed("v");
		expect(tokensOf("echo '$(a)' \\$(b) \\`c\\`", { substitute })).toEqual([
			word("echo"),
			word("$(a)", true, true),
			word("$(b)", true),
			word("`c`", true),
		]);
		expect(calls).toEqual([]);
	});
});

describe("tokenize：開頭的 ~ 展開成家目錄（M13-2）", () => {
	const home = "/home/tech";

	it("單獨的 ~ 展開", () => {
		expect(tokensOf("echo ~", { home })).toEqual([word("echo"), word("/home/tech")]);
	});

	it("~/ 開頭的路徑展開", () => {
		expect(tokensOf("cd ~/pod_06", { home })).toEqual([word("cd"), word("/home/tech/pod_06")]);
	});

	it("展開後仍算沒有引號，萬用字元照樣會展開", () => {
		expect(tokensOf("ls ~/*.txt", { home })).toEqual([word("ls"), word("/home/tech/*.txt")]);
	});

	it("緊接符號時也展開", () => {
		expect(tokensOf("ls ~|cat;cd ~&&ls>~/out", { home })).toEqual([
			word("ls"),
			word("/home/tech"),
			pipe,
			word("cat"),
			semicolon(8),
			word("cd"),
			word("/home/tech"),
			and(13),
			word("ls"),
			redirect,
			word("/home/tech/out"),
		]);
	});

	it("不在 word 開頭的 ~ 不展開", () => {
		expect(tokensOf("echo a~ a/~ NAME=~/x", { home })).toEqual([word("echo"), word("a~"), word("a/~"), word("NAME=~/x")]);
	});

	it("~user 寫法不支援，原樣保留", () => {
		expect(tokensOf("ls ~abin ~abin/x ~~ ~+", { home })).toEqual([
			word("ls"),
			word("~abin"),
			word("~abin/x"),
			word("~~"),
			word("~+"),
		]);
	});

	it("引號包住或跳脫的 ~ 不展開", () => {
		expect(tokensOf(`echo '~' "~/x" \\~ ~"/x"`, { home })).toEqual([
			word("echo"),
			word("~", true, true),
			word("~/x", true),
			word("~", true),
			word("~/x", true),
		]);
	});

	it("沒給 home 時不展開", () => {
		expect(tokensOf("cd ~/pod_06")).toEqual([word("cd"), word("~/pod_06")]);
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
