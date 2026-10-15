// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from ".";
import { unknownOption } from "../messages";
import type { CommandResult, ProcessInfo } from "../types";
import { COMMAND_DOCS } from "./docs";
import { CONCEPT_DOCS } from "./docsConcepts";
import { COMMAND_ARGS, optionSpellings as spellings, syntaxSummary } from "./docsOptions";
import type { CommandArgsDoc, OptionDoc } from "./docsOptions";
import { createContext } from "./testFixtures";

/**
 * 一致性守門：`docsOptions.ts` 的選項表要跟每個指令的實作對得上。
 * 表裡的選項真的執行時不能回「沒有這個選項」，表外的單字母選項一定要被擋下，
 * 接值與不接值也用「後面接一個 `-Z`」實際跑一次確認。
 */

const COMMANDS = new Map(ALL_COMMANDS.map((command) => [command.name, command]));
const COMMAND_NAMES = ALL_COMMANDS.map((command) => command.name);

const PROCESSES: ProcessInfo[] = [
	{ pid: 42, user: "tech", cpu: 0.1, mem: 0.1, started: "2031-03-12T08:15:00Z", command: "-sh" },
];

/** 接值選項的範例值，依「指令 選項」查；有 `values` 的選項改用 `values` 裡的每一種。 */
const SAMPLE_VALUES: Record<string, string> = {
	"head -n": "3",
	"tail -n": "3",
	"tree -L": "2",
	"cut -d": ",",
	"cut -f": "1",
	"cut -c": "1",
	"find -name": "*.txt",
	"find -iname": "*.TXT",
};

/** 用測試的檔案系統執行一個指令，管線輸入給一行，讓讀輸入的指令不會因為沒輸入而先失敗。 */
function run(name: string, args: string[]): CommandResult {
	const command = COMMANDS.get(name);
	if (command === undefined) {
		throw new Error(`沒有註冊 ${name}`);
	}
	return command.run(args, createContext({ availableCommands: COMMAND_NAMES, processes: PROCESSES, stdin: ["a,b"] }));
}

/** 結果是不是「`name` 沒有 `option` 這個選項」。 */
function rejectsOption(result: CommandResult, name: string, option: string): boolean {
	const [message] = unknownOption(name, option);
	return result.lines.includes(message);
}

/** 這個選項要實際試的幾組參數：不接值的只有它自己，接值的接一個範例值（有 `values` 時每一種都試）。 */
function sampleArgs(name: string, option: OptionDoc, spelling: string): string[][] {
	if (option.value === undefined) {
		return [[spelling]];
	}
	if (option.values !== undefined) {
		return Object.keys(option.values).map((value) => [spelling, value]);
	}
	const sample = SAMPLE_VALUES[`${name} ${option.short}`];
	if (sample === undefined) {
		throw new Error(`${name} ${option.short} 沒有範例值，請補進 SAMPLE_VALUES`);
	}
	return [[spelling, sample]];
}

/** 會照一般規則擋下不認得選項的指令（不是不看參數、不是只認開頭、不是整串都當參數）。 */
function rejectsUnknownOptions(doc: CommandArgsDoc): boolean {
	return doc.ignoresArgs !== true && doc.leadingOptionsOnly !== true && doc.nestedCommand !== true && doc.style !== "none";
}

const ENTRIES = Object.entries(COMMAND_ARGS);

describe("COMMAND_ARGS 涵蓋全部指令", () => {
	it("每個已註冊的指令都有一份，沒有多出沒註冊的", () => {
		expect(Object.keys(COMMAND_ARGS).sort()).toEqual([...COMMAND_NAMES].sort());
	});

	it.each(ENTRIES)("%s 的選項格式正確、名稱不重複", (_name, doc) => {
		const seen = new Set<string>();
		for (const option of doc.options) {
			expect(option.summary.trim()).not.toBe("");
			if (doc.style === "letters") {
				expect(option.short).toMatch(/^-[A-Za-z]$/);
			} else {
				expect(option.short).toMatch(/^-\S+$/);
			}
			if (option.long !== undefined) {
				expect(option.long).toMatch(/^--\S+$/);
			}
			if (option.values !== undefined) {
				expect(option.value).toBeDefined();
			}
			for (const spelling of spellings(option)) {
				expect(seen.has(spelling)).toBe(false);
				seen.add(spelling);
			}
		}
	});

	it.each(ENTRIES)("%s 的 man 用法裡寫到的選項都在表裡", (name, doc) => {
		const usage = COMMAND_DOCS[name]?.usage ?? "";
		const mentioned = Array.from(usage.matchAll(/(?:^|[\s[|])(-{1,2}[A-Za-z0-9]+)/g), (match) => match[1]);
		const listed = doc.options.flatMap(spellings);
		for (const option of mentioned) {
			expect(listed).toContain(option);
		}
	});
});

describe("COMMAND_ARGS 跟實作一致", () => {
	it.each(ENTRIES)("%s：表裡的選項真的執行時都不會回「沒有這個選項」", (name, doc) => {
		for (const option of doc.options) {
			for (const spelling of spellings(option)) {
				for (const args of sampleArgs(name, option, spelling)) {
					const result = run(name, args);
					expect(rejectsOption(result, name, spelling), `${name} ${args.join(" ")}：${result.lines.join("\n")}`).toBe(false);
				}
			}
		}
	});

	it.each(ENTRIES)("%s：接值的選項把下一個參數當值，不接值的不會", (name, doc) => {
		if (!rejectsUnknownOptions(doc)) {
			return;
		}
		for (const option of doc.options) {
			const result = run(name, [option.short, "-Z"]);
			const expectRejected = option.value === undefined;
			expect(rejectsOption(result, name, "-Z"), `${name} ${option.short} -Z：${result.lines.join("\n")}`).toBe(
				expectRejected,
			);
		}
	});

	it.each(ENTRIES)("%s：values 以外的值不接受", (name, doc) => {
		for (const option of doc.options) {
			if (option.values === undefined) {
				continue;
			}
			const result = run(name, [option.short, "zz"]);
			expect(result.ok).toBe(false);
		}
	});

	it.each(ENTRIES)("%s：表外的單字母選項都會失敗", (name, doc) => {
		if (!rejectsUnknownOptions(doc)) {
			return;
		}
		const listed = new Set(doc.options.flatMap(spellings));
		let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		if (doc.numericShorthand === undefined) {
			characters += "0123456789";
		}
		for (const character of characters) {
			const option = `-${character}`;
			if (listed.has(option)) {
				continue;
			}
			expect(run(name, [option]).ok, `${name} ${option} 應該失敗`).toBe(false);
		}
	});

	it.each(ENTRIES)("%s：不看參數的指令加了參數照樣成功，不接參數的給了會失敗", (name, doc) => {
		if (doc.ignoresArgs === true) {
			expect(run(name, ["-Z", "zz"]).ok).toBe(true);
		}
		if (doc.operands !== undefined && doc.operands.length === 0 && doc.ignoresArgs !== true) {
			expect(run(name, ["zz"]).ok).toBe(false);
		}
	});

	it("純數字簡寫真的被接受（head -5、tail -5）", () => {
		for (const [name, doc] of ENTRIES) {
			if (doc.numericShorthand === undefined) {
				continue;
			}
			expect(run(name, ["-5"]).ok, name).toBe(true);
		}
	});

	it("只認開頭選項的指令（echo）：開頭的選項吃掉，後面的照原樣印", () => {
		expect(run("echo", ["-n", "hi", "-n"]).lines).toEqual(["hi -n"]);
		expect(run("echo", ["-Z", "hi"]).lines).toEqual(["-Z hi"]);
		expect(COMMAND_ARGS.echo.leadingOptionsOnly).toBe(true);
	});

	it("chmod 沒有選項：-r 是權限寫法，不是選項", () => {
		expect(COMMAND_ARGS.chmod.style).toBe("none");
		expect(run("chmod", ["-r", "wake_up.txt"]).ok).toBe(true);
	});
});

describe("syntaxSummary", () => {
	it("概念字典有的符號直接用它的一句話，$ 查的是 $變數", () => {
		for (const symbol of ["|", ">", ">>", "*", "~", ".."] as const) {
			expect(syntaxSummary(symbol)).toBe(CONCEPT_DOCS[symbol].summary);
		}
		expect(syntaxSummary("$")).toBe(CONCEPT_DOCS.$變數.summary);
	});

	it("概念字典沒有的 ;、&&、? 也各有一句", () => {
		for (const symbol of [";", "&&", "?"] as const) {
			expect(Object.hasOwn(CONCEPT_DOCS, symbol)).toBe(false);
			expect(syntaxSummary(symbol).trim()).not.toBe("");
		}
	});
});
