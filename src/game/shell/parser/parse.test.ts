// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ParsedCommand, ParseResult, Redirect } from "../types";
import { parseCommandLine, parseCommandLineDetailed } from "./parse";

/** 單一指令、沒有管線與重導向時的期望值。 */
function single(name: string, args: string[]): ParseResult {
	const command: ParsedCommand = { name, args };
	return { ok: true, command, pipeline: { commands: [command], redirect: null } };
}

/** 管線的期望值，`command` 是第一個指令。 */
function pipeline(commands: ParsedCommand[], redirect: Redirect | null = null): ParseResult {
	return { ok: true, command: commands[0], pipeline: { commands, redirect } };
}

describe("parseCommandLine", () => {
	it("解析指令名與參數", () => {
		expect(parseCommandLine("ls -la /home")).toEqual(single("ls", ["-la", "/home"]));
	});

	it("沒有參數時 args 是空陣列", () => {
		expect(parseCommandLine("pwd")).toEqual(single("pwd", []));
	});

	it("多個空白與前後空白不影響結果", () => {
		expect(parseCommandLine("   cat    a.txt   b.txt  ")).toEqual(single("cat", ["a.txt", "b.txt"]));
	});

	it("引號參數去掉引號", () => {
		expect(parseCommandLine(`cat "my file.txt" 'x y'`)).toEqual(single("cat", ["my file.txt", "x y"]));
	});

	it("空引號是一個空字串參數", () => {
		expect(parseCommandLine('cd ""')).toEqual(single("cd", [""]));
	});

	it("中文檔名正常解析", () => {
		expect(parseCommandLine("cat 日誌.txt")).toEqual(single("cat", ["日誌.txt"]));
	});

	it("空輸入回傳 command 為 null", () => {
		expect(parseCommandLine("")).toEqual({ ok: true, command: null, pipeline: null });
	});

	it("全空白回傳 command 為 null", () => {
		expect(parseCommandLine("  \t ")).toEqual({ ok: true, command: null, pipeline: null });
	});

	it("全形空白回傳 FULLWIDTH_CHAR", () => {
		expect(parseCommandLine("cd　pod_01")).toEqual({
			ok: false,
			error: { code: "FULLWIDTH_CHAR", detail: "　" },
		});
	});

	it("全形逗號回傳 FULLWIDTH_CHAR", () => {
		expect(parseCommandLine("cat a，b")).toEqual({
			ok: false,
			error: { code: "FULLWIDTH_CHAR", detail: "，" },
		});
	});

	it("全形字元優先於未關引號", () => {
		expect(parseCommandLine("cat 'a　b")).toEqual({
			ok: false,
			error: { code: "FULLWIDTH_CHAR", detail: "　" },
		});
	});

	it("引號內的全形字元也會被攔下", () => {
		expect(parseCommandLine('cat "a，b"')).toEqual({
			ok: false,
			error: { code: "FULLWIDTH_CHAR", detail: "，" },
		});
	});

	it("未關引號回傳 UNCLOSED_QUOTE", () => {
		expect(parseCommandLine("cat 'abc")).toEqual({
			ok: false,
			error: { code: "UNCLOSED_QUOTE", detail: "'" },
		});
	});

	it("引號內的符號只是普通參數", () => {
		expect(parseCommandLine("echo 'a | b'")).toEqual(single("echo", ["a | b"]));
	});
});

describe("parseCommandLine：管線", () => {
	it("用 | 切成多個指令，command 是第一個", () => {
		expect(parseCommandLine("cat log.txt | grep ERROR | wc -l")).toEqual(
			pipeline([
				{ name: "cat", args: ["log.txt"] },
				{ name: "grep", args: ["ERROR"] },
				{ name: "wc", args: ["-l"] },
			]),
		);
	});

	it("黏著的管線也能解析", () => {
		expect(parseCommandLine("ls|cat")).toEqual(
			pipeline([
				{ name: "ls", args: [] },
				{ name: "cat", args: [] },
			]),
		);
	});

	it("引號內的 | 不是管線", () => {
		expect(parseCommandLine("grep 'a|b' log.txt")).toEqual(single("grep", ["a|b", "log.txt"]));
	});
});

describe("parseCommandLine：重導向", () => {
	it("> 是覆寫，target 是後面的檔名", () => {
		expect(parseCommandLine("ls > list.txt")).toEqual(
			pipeline([{ name: "ls", args: [] }], { kind: "overwrite", target: "list.txt" }),
		);
	});

	it(">> 是追加", () => {
		expect(parseCommandLine("pwd >> where.txt")).toEqual(
			pipeline([{ name: "pwd", args: [] }], { kind: "append", target: "where.txt" }),
		);
	});

	it("黏著的重導向也能解析", () => {
		expect(parseCommandLine("ls -a>out")).toEqual(
			pipeline([{ name: "ls", args: ["-a"] }], { kind: "overwrite", target: "out" }),
		);
	});

	it("管線結尾可以接重導向", () => {
		expect(parseCommandLine("cat a.txt | sort > sorted.txt")).toEqual(
			pipeline(
				[
					{ name: "cat", args: ["a.txt"] },
					{ name: "sort", args: [] },
				],
				{ kind: "overwrite", target: "sorted.txt" },
			),
		);
	});

	it("重導向檔名後面的 word 併回最後一個指令的參數", () => {
		expect(parseCommandLine("ls > out.txt -a /home")).toEqual(
			pipeline([{ name: "ls", args: ["-a", "/home"] }], { kind: "overwrite", target: "out.txt" }),
		);
	});

	it("引號包住的檔名去掉引號", () => {
		expect(parseCommandLine('ls > "my list.txt"')).toEqual(
			pipeline([{ name: "ls", args: [] }], { kind: "overwrite", target: "my list.txt" }),
		);
	});
});

describe("parseCommandLine：管線與重導向的錯誤", () => {
	it("| 後面沒有指令回傳 EMPTY_COMMAND", () => {
		expect(parseCommandLine("ls |")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});

	it("| 前面沒有指令回傳 EMPTY_COMMAND", () => {
		expect(parseCommandLine("| sort")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});

	it("兩個 | 中間沒有指令回傳 EMPTY_COMMAND", () => {
		expect(parseCommandLine("ls | | sort")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});

	it("只有 | 回傳 EMPTY_COMMAND", () => {
		expect(parseCommandLine("|")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});

	it("> 後面沒有檔名回傳 MISSING_REDIRECT_TARGET", () => {
		expect(parseCommandLine("ls >")).toEqual({
			ok: false,
			error: { code: "MISSING_REDIRECT_TARGET", detail: ">" },
		});
	});

	it(">> 後面沒有檔名回傳 MISSING_REDIRECT_TARGET，detail 是 >>", () => {
		expect(parseCommandLine("ls >>  ")).toEqual({
			ok: false,
			error: { code: "MISSING_REDIRECT_TARGET", detail: ">>" },
		});
	});

	it("> 後面緊接 | 回傳 MISSING_REDIRECT_TARGET", () => {
		expect(parseCommandLine("ls > | sort")).toEqual({
			ok: false,
			error: { code: "MISSING_REDIRECT_TARGET", detail: ">" },
		});
	});

	it("> > 中間有空白時第一個 > 沒有檔名", () => {
		expect(parseCommandLine("ls > > out")).toEqual({
			ok: false,
			error: { code: "MISSING_REDIRECT_TARGET", detail: ">" },
		});
	});

	it("重導向之後又出現 | 回傳 EMPTY_COMMAND", () => {
		expect(parseCommandLine("ls > a | sort")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});

	it("一行兩個重導向時第二個回傳 EMPTY_COMMAND，detail 是那個符號", () => {
		expect(parseCommandLine("ls > a >> b")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: ">>" } });
	});

	it("> 前面沒有指令回傳 EMPTY_COMMAND，detail 是 >", () => {
		expect(parseCommandLine("> out")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: ">" } });
	});

	it("| 後面直接接 > 回傳 EMPTY_COMMAND，detail 是 |", () => {
		expect(parseCommandLine("ls | > out")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});

	it("全形字元仍然優先於管線錯誤", () => {
		expect(parseCommandLine("ls |　")).toEqual({ ok: false, error: { code: "FULLWIDTH_CHAR", detail: "　" } });
	});

	it("未關引號優先於管線錯誤", () => {
		expect(parseCommandLine("| cat 'a")).toEqual({ ok: false, error: { code: "UNCLOSED_QUOTE", detail: "'" } });
	});
});

describe("parseCommandLine：變數展開", () => {
	const env = { HOME: "/home/tech", NOVA_DIR: "/opt/nova" };

	it("有給 env 時展開參數與重導向檔名", () => {
		expect(parseCommandLine("ls $NOVA_DIR > $HOME/list.txt", { env })).toEqual(
			pipeline([{ name: "ls", args: ["/opt/nova"] }], { kind: "overwrite", target: "/home/tech/list.txt" }),
		);
	});

	it("沒給 env 時 $NAME 原樣保留", () => {
		expect(parseCommandLine("cd $HOME")).toEqual(single("cd", ["$HOME"]));
	});

	it("整行只剩空展開時視為空輸入", () => {
		expect(parseCommandLine("$NOPE", { env })).toEqual({ ok: true, command: null, pipeline: null });
	});
});

describe("parseCommandLineDetailed", () => {
	it("每個參數保留是否被引號包住，給萬用字元展開判斷", () => {
		expect(parseCommandLineDetailed(`cat *.log '*.txt' | grep "a*"`)).toEqual({
			ok: true,
			pipeline: {
				commands: [
					{
						name: { value: "cat", quoted: false },
						args: [
							{ value: "*.log", quoted: false },
							{ value: "*.txt", quoted: true },
						],
					},
					{ name: { value: "grep", quoted: false }, args: [{ value: "a*", quoted: true }] },
				],
				redirect: null,
			},
		});
	});

	it("空輸入回傳 pipeline 為 null", () => {
		expect(parseCommandLineDetailed("  ")).toEqual({ ok: true, pipeline: null });
	});

	it("錯誤與 parseCommandLine 相同", () => {
		expect(parseCommandLineDetailed("ls |")).toEqual({ ok: false, error: { code: "EMPTY_COMMAND", detail: "|" } });
	});
});
