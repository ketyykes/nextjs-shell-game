// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	alreadyExists,
	commandNotFound,
	fsError,
	fullwidthChar,
	hintExhausted,
	historyEmpty,
	isADirectory,
	manNotFound,
	missingOperand,
	missingSpace,
	notADirectory,
	notLearnedYet,
	parseError,
	pathNotFound,
	unclosedQuote,
	unknownOption,
	emptyCommand,
	missingRedirectTarget,
	missingCommandForRedirect,
	permissionDenied,
	resourceBusy,
	directoryNeedsRecursive,
	invalidNumber,
	noInput,
	invalidAssignment,
	invalidVariableName,
	invalidMode,
	invalidPid,
	noSuchProcess,
	processIgnoredSignal,
	processProtected,
} from "./messages";
import type { FsErrorCode, ParseErrorCode } from "./types";

/** 把多行訊息接成一個字串，方便用 toContain 檢查。 */
function joinLines(lines: string[]): string {
	return lines.join("\n");
}

describe("解析階段的訊息", () => {
	it("commandNotFound 會放進指令名並提示 help", () => {
		const text = joinLines(commandNotFound("xyz"));
		expect(text).toContain("`xyz`");
		expect(text).toContain("help");
	});

	it("missingSpace 會組出建議的完整指令", () => {
		const text = joinLines(missingSpace("cd", "medbay"));
		expect(text).toContain("`cd medbay`");
		expect(text).toContain("空格");
	});

	it("fullwidthChar 會把偵測到的字元放進句子", () => {
		const text = joinLines(fullwidthChar("　"));
		expect(text).toContain("「　」");
		expect(text).toContain("英文輸入法");
	});

	it("unclosedQuote 會提到引號本身", () => {
		expect(joinLines(unclosedQuote('"'))).toContain('"');
		expect(joinLines(unclosedQuote("'"))).toContain("'");
	});

	it("emptyCommand 會提到符號並給管線範例", () => {
		const text = joinLines(emptyCommand("|"));
		expect(text).toContain("`|`");
		expect(text).toContain("grep");
	});

	it("missingRedirectTarget 與 missingCommandForRedirect 會提到符號", () => {
		expect(joinLines(missingRedirectTarget(">>"))).toContain("`>>`");
		expect(joinLines(missingCommandForRedirect(">"))).toContain("`>`");
	});
});

describe("檔案系統訊息", () => {
	it("pathNotFound 會放進路徑並提示 ls", () => {
		const text = joinLines(pathNotFound("foo"));
		expect(text).toContain("`foo`");
		expect(text).toContain("ls");
	});

	it("notADirectory 會說明檔案與目錄的差別並提示 cat", () => {
		const text = joinLines(notADirectory("wake_up.txt"));
		expect(text).toContain("`wake_up.txt`");
		expect(text).toContain("檔案");
		expect(text).toContain("目錄");
		expect(text).toContain("cat");
	});

	it("isADirectory 會提示用 cd 進去或 ls 看內容", () => {
		const text = joinLines(isADirectory("pod_06"));
		expect(text).toContain("`pod_06`");
		expect(text).toContain("cd");
		expect(text).toContain("ls");
	});

	it("alreadyExists 會放進路徑並說已經存在", () => {
		const text = joinLines(alreadyExists("logs"));
		expect(text).toContain("`logs`");
		expect(text).toContain("已經存在");
	});
});

describe("fsError 依代碼分派", () => {
	const cases: Array<[FsErrorCode, string[]]> = [
		["ENOENT", pathNotFound("target")],
		["ENOTDIR", notADirectory("target")],
		["EISDIR", isADirectory("target")],
		["EEXIST", alreadyExists("target")],
	];

	it.each(cases)("%s 會分派到對應的訊息", (code, expected) => {
		expect(fsError(code, "target")).toEqual(expected);
	});

	it("EEXIST 會提到已經存在", () => {
		expect(joinLines(fsError("EEXIST", "target"))).toContain("已經存在");
	});

	it("EACCES 會提到權限與 chmod，EBUSY 會提到不能搬或刪", () => {
		const denied = joinLines(fsError("EACCES", "sealed.txt"));
		expect(denied).toContain("權限");
		expect(denied).toContain("chmod");
		expect(joinLines(fsError("EBUSY", "/"))).toContain("不能");
	});
});

describe("parseError 依代碼分派", () => {
	const cases: Array<[ParseErrorCode, string, string[]]> = [
		["FULLWIDTH_CHAR", "　", fullwidthChar("　")],
		["UNCLOSED_QUOTE", '"', unclosedQuote('"')],
		["EMPTY_COMMAND", "|", emptyCommand("|")],
		["EMPTY_COMMAND", ">", missingCommandForRedirect(">")],
		["EMPTY_COMMAND", ">>", missingCommandForRedirect(">>")],
		["MISSING_REDIRECT_TARGET", ">", missingRedirectTarget(">")],
	];

	it.each(cases)("%s 會分派到對應的訊息", (code, detail, expected) => {
		expect(parseError({ code, detail })).toEqual(expected);
	});
});

describe("指令用法訊息", () => {
	it("missingOperand 會放進指令名與缺少的東西", () => {
		const text = joinLines(missingOperand("cat", "一個檔名，例如 cat wake_up.txt"));
		expect(text).toContain("cat");
		expect(text).toContain("一個檔名");
		expect(text).toContain("wake_up.txt");
		expect(text).toContain("man cat");
	});

	it("unknownOption 會放進指令與選項", () => {
		const text = joinLines(unknownOption("ls", "-z"));
		expect(text).toContain("`ls`");
		expect(text).toContain("`-z`");
		expect(text).toContain("man ls");
	});
});

describe("man、hint、history 相關訊息", () => {
	it("manNotFound 會放進指令名並提示 help", () => {
		const text = joinLines(manNotFound("foo"));
		expect(text).toContain("`foo`");
		expect(text).toContain("help");
	});

	it("notLearnedYet 會放進指令名", () => {
		expect(joinLines(notLearnedYet("grep"))).toContain("`grep`");
	});

	it("hintExhausted 會說明提示已經給完", () => {
		expect(joinLines(hintExhausted())).toContain("提示");
	});

	it("historyEmpty 會有內容", () => {
		expect(historyEmpty().length).toBeGreaterThan(0);
	});
});

describe("所有訊息的共通規則", () => {
	it("每個訊息都回傳非空陣列，且每一行都不是空字串", () => {
		const all: string[][] = [
			commandNotFound("x"),
			missingSpace("cd", "x"),
			fullwidthChar("，"),
			unclosedQuote('"'),
			emptyCommand("|"),
			missingRedirectTarget(">"),
			missingCommandForRedirect(">"),
			permissionDenied("x"),
			resourceBusy("x"),
			directoryNeedsRecursive("rm", "x"),
			invalidNumber("head", "abc"),
			noInput("cat", "cat x"),
			invalidAssignment("=x"),
			invalidVariableName("1x"),
			invalidMode("zzz"),
			invalidPid("abc"),
			noSuchProcess(42),
			processIgnoredSignal(42, "nova"),
			processProtected(1, "init"),
			pathNotFound("x"),
			notADirectory("x"),
			isADirectory("x"),
			alreadyExists("x"),
			missingOperand("cat", "一個檔名"),
			unknownOption("ls", "-z"),
			manNotFound("x"),
			notLearnedYet("x"),
			hintExhausted(),
			historyEmpty(),
		];
		for (const lines of all) {
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(line.trim()).not.toBe("");
			}
		}
	});
});
