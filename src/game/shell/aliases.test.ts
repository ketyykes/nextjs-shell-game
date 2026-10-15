// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkAliasValue, expandAliases } from "./aliases";
import type { DetailedCommand, ParsedWord } from "./parser";
import { parseCommandLineDetailed } from "./parser";

const HOME = "/home/tech";

/** 解析一行，回傳管線裡的指令（測試用，解析失敗直接讓測試掛掉）。 */
function commandsOf(input: string): DetailedCommand[] {
	const parsed = parseCommandLineDetailed(input, { env: {}, home: HOME });
	if (!parsed.ok || parsed.pipeline === null) {
		throw new Error(`解析失敗：${input}`);
	}
	return parsed.pipeline.commands;
}

/** 指令只留名稱與參數字串，比對比較好讀。 */
function plain(commands: DetailedCommand[]): string[][] {
	return commands.map((command) => [command.name.value, ...command.args.map((arg) => arg.value)]);
}

function expand(input: string, aliases: Record<string, string>, env: Record<string, string> = {}): DetailedCommand[] {
	return expandAliases(commandsOf(input), aliases, { env, home: HOME });
}

describe("expandAliases", () => {
	it("第一個 word 是別名時換成別名的內容，後面的參數接在後面", () => {
		expect(plain(expand("ll -a pod_06", { ll: "ls -l" }))).toEqual([["ls", "-l", "-a", "pod_06"]]);
	});

	it("沒有別名的指令照原樣", () => {
		const commands = commandsOf("ls -l");
		expect(expandAliases(commands, { ll: "ls -l" }, { env: {}, home: HOME })).toEqual(commands);
	});

	it("只展開每段管線的第一個 word，參數裡的同名字不展開", () => {
		expect(plain(expand("echo ll | ll", { ll: "ls -l" }))).toEqual([
			["echo", "ll"],
			["ls", "-l"],
		]);
	});

	it("引號包住或反斜線跳脫的指令名不展開", () => {
		expect(plain(expand("'ll'", { ll: "ls -l" }))).toEqual([["ll"]]);
		expect(plain(expand("\\ll", { ll: "ls -l" }))).toEqual([["ll"]]);
	});

	it("不遞迴展開同名的別名", () => {
		expect(plain(expand("ls", { ls: "ls -a" }))).toEqual([["ls", "-a"]]);
	});

	it("展開結果的第一個 word 是別的別名時再展開；互相指來指去時停在已經展開過的名字", () => {
		expect(plain(expand("l /tmp", { l: "ll", ll: "ls -l" }))).toEqual([["ls", "-l", "/tmp"]]);
		expect(plain(expand("a", { a: "b", b: "a" }))).toEqual([["a"]]);
	});

	it("別名裡有 |：變成好幾段，原本的參數接在最後一段", () => {
		expect(plain(expand("errs sensors.log", { errs: "grep ERROR | wc -l" }))).toEqual([
			["grep", "ERROR"],
			["wc", "-l", "sensors.log"],
		]);
	});

	it("別名內容裡的 | 後面那一段也會再展開別名", () => {
		expect(plain(expand("top3", { top3: "sort | h3", h3: "head -n 3" }))).toEqual([
			["sort"],
			["head", "-n", "3"],
		]);
	});

	it("變數在使用時才展開（單引號定義的別名）", () => {
		expect(plain(expand("hi", { hi: "echo $GREETING" }, { GREETING: "你好" }))).toEqual([["echo", "你好"]]);
	});

	it("~ 展開成家目錄", () => {
		expect(plain(expand("home", { home: "cd ~" }))).toEqual([["cd", HOME]]);
	});

	it("保留每個 word 有沒有引號，萬用字元展開才判斷得對", () => {
		const [command] = expand("lt '*.log'", { lt: "ls *.txt" });
		const args: ParsedWord[] = command.args;
		expect(args).toEqual([
			{ value: "*.txt", quoted: false },
			{ value: "*.log", quoted: true },
		]);
	});

	it("內容不是單純指令或管線的別名（不該存進來）照原樣不展開", () => {
		expect(plain(expand("x", { x: "ls; pwd" }))).toEqual([["x"]]);
	});
});

describe("checkAliasValue", () => {
	it.each(["ls -l", "grep -i error | wc -l", "echo '$HOME'", "cd ~"])("%s 可以當別名", (value) => {
		expect(checkAliasValue(value)).toBeNull();
	});

	it("空的或只有空白", () => {
		expect(checkAliasValue("")).toEqual({ kind: "empty" });
		expect(checkAliasValue("   ")).toEqual({ kind: "empty" });
	});

	it.each(["ls; pwd", "cd logs && ls", "ls > out.txt", "ls >> out.txt", "| wc -l", "ls |"])(
		"%s 不是單純的指令或管線",
		(value) => {
			expect(checkAliasValue(value)).toEqual({ kind: "unsupported" });
		},
	);

	it("語法錯誤帶解析錯誤", () => {
		expect(checkAliasValue("echo 'hi")).toEqual({ kind: "parse", error: { code: "UNCLOSED_QUOTE", detail: "'" } });
	});
});
