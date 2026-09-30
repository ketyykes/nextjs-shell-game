// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseCommandLine } from "./parse";

describe("parseCommandLine", () => {
	it("解析指令名與參數", () => {
		expect(parseCommandLine("ls -la /home")).toEqual({
			ok: true,
			command: { name: "ls", args: ["-la", "/home"] },
		});
	});

	it("沒有參數時 args 是空陣列", () => {
		expect(parseCommandLine("pwd")).toEqual({
			ok: true,
			command: { name: "pwd", args: [] },
		});
	});

	it("多個空白與前後空白不影響結果", () => {
		expect(parseCommandLine("   cat    a.txt   b.txt  ")).toEqual({
			ok: true,
			command: { name: "cat", args: ["a.txt", "b.txt"] },
		});
	});

	it("引號參數去掉引號", () => {
		expect(parseCommandLine(`cat "my file.txt" 'x y'`)).toEqual({
			ok: true,
			command: { name: "cat", args: ["my file.txt", "x y"] },
		});
	});

	it("空引號是一個空字串參數", () => {
		expect(parseCommandLine('cd ""')).toEqual({
			ok: true,
			command: { name: "cd", args: [""] },
		});
	});

	it("中文檔名正常解析", () => {
		expect(parseCommandLine("cat 日誌.txt")).toEqual({
			ok: true,
			command: { name: "cat", args: ["日誌.txt"] },
		});
	});

	it("空輸入回傳 command 為 null", () => {
		expect(parseCommandLine("")).toEqual({ ok: true, command: null });
	});

	it("全空白回傳 command 為 null", () => {
		expect(parseCommandLine("  \t ")).toEqual({ ok: true, command: null });
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

	it("管線回傳 UNSUPPORTED_OPERATOR", () => {
		expect(parseCommandLine("ls | grep a")).toEqual({
			ok: false,
			error: { code: "UNSUPPORTED_OPERATOR", detail: "|" },
		});
	});

	it("黏著的重導向回傳 UNSUPPORTED_OPERATOR", () => {
		expect(parseCommandLine("ls>out")).toEqual({
			ok: false,
			error: { code: "UNSUPPORTED_OPERATOR", detail: ">" },
		});
	});

	it(">> 回傳 UNSUPPORTED_OPERATOR，detail 是 >>", () => {
		expect(parseCommandLine("ls >> out")).toEqual({
			ok: false,
			error: { code: "UNSUPPORTED_OPERATOR", detail: ">>" },
		});
	});

	it("只有符號時也回傳 UNSUPPORTED_OPERATOR", () => {
		expect(parseCommandLine("|")).toEqual({
			ok: false,
			error: { code: "UNSUPPORTED_OPERATOR", detail: "|" },
		});
	});

	it("引號內的符號只是普通參數", () => {
		expect(parseCommandLine("echo 'a | b'")).toEqual({
			ok: true,
			command: { name: "echo", args: ["a | b"] },
		});
	});
});
