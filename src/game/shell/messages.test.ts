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
	invalidPattern,
	conflictingMatchers,
	extraOperand,
	emptyListCommand,
	unsupportedSyntax,
	unclosedSubstitution,
	cdTooManyArguments,
	similarCommand,
	commandIsLowercase,
	programNotInstalled,
	noSuchUser,
	sudoDenied,
	cannotExit,
	aliasEmptyValue,
	aliasInvalidName,
	aliasNotFound,
	aliasUnsupportedValue,
	dateCannotSet,
	sedEmptyPattern,
	sedExtraCharacters,
	sedInPlaceSuffix,
	sedInvalidLineZero,
	sedInvalidPattern,
	sedInvalidReference,
	sedMissingCommand,
	sedNoInputFiles,
	sedUnexpectedComma,
	sedUnknownSFlag,
	sedUnsupportedCommand,
	sedUnterminatedAddress,
	sedUnterminatedS,
	sedZeroOccurrence,
	subcommandRefused,
	teeNeedsPipe,
	trEmptySet2,
	trExtraOperand,
	trInvalidClass,
	trInvalidRange,
	trNeedsPipe,
	trNeedsTwoSets,
	whichAlias,
	xargsCannotRun,
	xargsInvalidCount,
	xargsNeedsPipe,
} from "./messages";
import type { FsErrorCode, ParseErrorCode, RegexErrorCode } from "./types";

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

	it("similarCommand 說找不到、給最接近的指令，並保留 help 的引導", () => {
		const text = joinLines(similarCommand("gerp", "grep"));
		expect(text).toContain("找不到指令 `gerp`");
		expect(text).toContain("`grep`");
		expect(text).toContain("help");
	});

	it("commandIsLowercase 說明指令名稱要用小寫，並給小寫的寫法", () => {
		const text = joinLines(commandIsLowercase("LS", "ls"));
		expect(text).toContain("`LS`");
		expect(text).toContain("小寫");
		expect(text).toContain("`ls`");
	});

	it("programNotInstalled 說這台終端機沒有那個程式，依種類給替代做法", () => {
		const editor = joinLines(programNotInstalled("vim", { kind: "editor" }));
		expect(editor).toContain("`vim`");
		expect(editor).toContain("echo");
		expect(editor).toContain(">");

		for (const kind of ["package", "language", "network"] as const) {
			const text = joinLines(programNotInstalled("x", { kind }));
			expect(text).toContain("`x`");
			expect(text).toContain("help");
		}

		const windows = joinLines(programNotInstalled("dir", { kind: "windows", equivalent: "ls" }));
		expect(windows).toContain("`dir`");
		expect(windows).toContain("Windows");
		expect(windows).toContain("ls");
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
		["EMPTY_COMMAND", ";", emptyListCommand(";")],
		["EMPTY_COMMAND", "&&", emptyListCommand("&&")],
		["EMPTY_COMMAND", "||", emptyListCommand("||")],
		["EMPTY_COMMAND", "<", missingCommandForRedirect("<")],
		["EMPTY_COMMAND", "2>", missingCommandForRedirect("2>")],
		["EMPTY_COMMAND", "2>&1", missingCommandForRedirect("2>&1")],
		["EMPTY_COMMAND", "&>", missingCommandForRedirect("&>")],
		["EMPTY_COMMAND", "1>>", missingCommandForRedirect("1>>")],
		["MISSING_REDIRECT_TARGET", "<", missingRedirectTarget("<")],
		["UNCLOSED_SUBSTITUTION", "$(", unclosedSubstitution("$(")],
		["UNSUPPORTED_SYNTAX", "&", unsupportedSyntax("&")],
		["UNSUPPORTED_SYNTAX", ">&2", unsupportedSyntax(">&2")],
	];

	it.each(cases)("%s 會分派到對應的訊息", (code, detail, expected) => {
		expect(parseError({ code, detail })).toEqual(expected);
	});
});

describe("; 與 && 的訊息（M13）", () => {
	it("emptyListCommand(;) 說明「做完左邊再做右邊」並給範例", () => {
		const text = joinLines(emptyListCommand(";"));
		expect(text).toContain("`;`");
		expect(text).toContain("做完左邊再做右邊");
		expect(text).toContain("cd logs; ls");
		expect(text).not.toContain("輸出交給右邊");
	});

	it("emptyListCommand(&&) 說明「左邊成功了才做右邊」並給範例", () => {
		const text = joinLines(emptyListCommand("&&"));
		expect(text).toContain("`&&`");
		expect(text).toContain("成功");
		expect(text).toContain("cd logs && ls");
	});

	it("emptyListCommand(||) 說明「左邊失敗了才做右邊」並給範例（第十九場）", () => {
		const text = joinLines(emptyListCommand("||"));
		expect(text).toContain("`||`");
		expect(text).toContain("失敗");
		expect(text).toContain("cd logs || echo");
	});
});

describe("重導向與指令替換的訊息（第十九場）", () => {
	it("missingRedirectTarget 依符號說明檔名的用途並給範例", () => {
		expect(joinLines(missingRedirectTarget("<"))).toContain("sort < data.txt");
		expect(joinLines(missingRedirectTarget("2>"))).toContain("錯誤訊息");
		expect(joinLines(missingRedirectTarget("2>"))).toContain("2>/dev/null");
		expect(joinLines(missingRedirectTarget("2>>"))).toContain("`2>>`");
		expect(joinLines(missingRedirectTarget("&>"))).toContain("ls &> all.txt");
		expect(missingRedirectTarget("1>")).toEqual(missingRedirectTarget(">").map((line) => line.replace("`>`", "`1>`")));
	});

	it("missingCommandForRedirect 依符號說明意思，> 與 >> 維持原本的說法", () => {
		expect(joinLines(missingCommandForRedirect(">"))).toContain("echo MAYDAY > outbox.txt");
		const input = joinLines(missingCommandForRedirect("<"));
		expect(input).toContain("`<`");
		expect(input).toContain("讀");
		expect(input).toContain("sort < data.txt");
		const error = joinLines(missingCommandForRedirect("2>"));
		expect(error).toContain("錯誤訊息");
		expect(error).toContain("2> err.txt");
		expect(joinLines(missingCommandForRedirect("2>&1"))).toContain("> out.txt 2>&1");
		expect(joinLines(missingCommandForRedirect("&>>"))).toContain("`&>>`");
	});

	it("unclosedSubstitution 教怎麼補，反引號建議改用 $( )", () => {
		const paren = joinLines(unclosedSubstitution("$("));
		expect(paren).toContain("`$(`");
		expect(paren).toContain(")");
		expect(paren).toContain("引號");
		const backtick = joinLines(unclosedSubstitution("`"));
		expect(backtick).toContain("反引號");
		expect(backtick).toContain("$(pwd)");
	});
});

describe("cd 參數太多（M13-1）", () => {
	it("cdTooManyArguments 說明一次只能走進一個目錄，並教 / 與引號", () => {
		const text = joinLines(cdTooManyArguments());
		expect(text).toContain("參數太多");
		expect(text).toContain("一次只能走進一個目錄");
		expect(text).toContain("cd logs/2028");
		expect(text).toContain('cd "my dir"');
	});
});

describe("仍不支援的語法（M13-1，第十九場縮小範圍）", () => {
	it.each(["&", "<<", "<<<", "<(", "0<", "<&", ">&2", "1>&2", ">&", "2>&-", "3>", "|&", "2>&1 |", "$(("])(
		"%s 明講「這個遊戲的 shell 不支援」並放進符號",
		(detail) => {
			const text = joinLines(unsupportedSyntax(detail));
			expect(text).toContain("這個遊戲的 shell 不支援");
			expect(text).toContain(detail);
		},
	);

	it("& 建議拿掉，要接著做下一個用 && 或 ;", () => {
		const text = joinLines(unsupportedSyntax("&"));
		expect(text).toContain("背景");
		expect(text).toContain("&&");
		expect(text).toContain(";");
	});

	it("<< 建議改用 < 讀檔，<<< 建議用 echo 接管線", () => {
		const heredoc = joinLines(unsupportedSyntax("<<"));
		expect(heredoc).toContain("sort < data.txt");
		const herestring = joinLines(unsupportedSyntax("<<<"));
		expect(herestring).toContain("echo");
		expect(herestring).toContain("|");
	});

	it("<( ) 建議先把輸出存成檔案", () => {
		expect(joinLines(unsupportedSyntax("<("))).toContain("> ");
	});

	it("|& 與管線中間的 2>&1 說明錯誤訊息不能接進管線，要丟掉或存檔用 2>", () => {
		for (const detail of ["|&", "2>&1 |"]) {
			const text = joinLines(unsupportedSyntax(detail));
			expect(text).toContain("管線");
			expect(text).toContain("2>/dev/null");
			expect(text).toContain("2> ");
		}
	});

	it(">&2、3> 這類別的檔案描述元說明能用的 2>、2>&1 寫法", () => {
		for (const detail of [">&2", "1>&2", "3>", "0<", "2>&-"]) {
			const text = joinLines(unsupportedSyntax(detail));
			expect(text).toContain("2> ");
			expect(text).toContain("2>&1");
		}
	});

	it("$(( 說明不支援數字計算", () => {
		expect(joinLines(unsupportedSyntax("$(("))).toContain("數字計算");
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

describe("chmod 訊息", () => {
	it("invalidMode 會放進寫法，並示範逗號組合與四位數字", () => {
		const text = joinLines(invalidMode("zzz"));
		expect(text).toContain("`zzz`");
		expect(text).toContain("u+x,g-w");
		expect(text).toContain("0644");
	});
});

describe("grep 樣式與用法訊息", () => {
	const codes: RegexErrorCode[] = [
		"TRAILING_BACKSLASH",
		"UNMATCHED_BRACKET",
		"UNMATCHED_PAREN",
		"UNMATCHED_BRACE",
		"INVALID_INTERVAL",
		"INVALID_RANGE",
		"INVALID_CLASS_NAME",
		"CLASS_SYNTAX",
		"INVALID_BACKREF",
	];

	it.each(codes)("invalidPattern(%s) 放進樣式、說明原因，並提示 -F 照字面找", (code) => {
		const text = joinLines(invalidPattern("grep", "a[1", code));
		expect(text).toContain("`a[1`");
		expect(text).toContain("-F");
	});

	it("每種原因的說明都不一樣", () => {
		const reasons = codes.map((code) => invalidPattern("grep", "x", code)[0]);
		expect(new Set(reasons).size).toBe(codes.length);
	});

	it("CLASS_SYNTAX 會示範兩層中括號的寫法", () => {
		expect(joinLines(invalidPattern("grep", "[:digit:]", "CLASS_SYNTAX"))).toContain("[[:digit:]]");
	});

	it("conflictingMatchers 會提到 -E 與 -F", () => {
		const text = joinLines(conflictingMatchers("grep"));
		expect(text).toContain("-E");
		expect(text).toContain("-F");
	});

	it("extraOperand 會放進指令、多出來的參數與用法", () => {
		const text = joinLines(extraOperand("uniq", "c.txt", "uniq [-c] [-d] [輸入檔 [輸出檔]]"));
		expect(text).toContain("`uniq`");
		expect(text).toContain("`c.txt`");
		expect(text).toContain("uniq [-c] [-d] [輸入檔 [輸出檔]]");
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

	it("hintExhausted 不宣稱「上面就是完整答案」，改說已經全部給過、照著一步一步打", () => {
		const text = joinLines(hintExhausted());
		expect(text).not.toContain("完整答案");
		expect(text).toContain("全部給過");
		expect(text).toContain("一步一步");
	});

	it("historyEmpty 會有內容", () => {
		expect(historyEmpty().length).toBeGreaterThan(0);
	});
});

describe("所有訊息的共通規則", () => {
	it("每個訊息都回傳非空陣列，且每一行都不是空字串", () => {
		const all: string[][] = [
			commandNotFound("x"),
			similarCommand("x", "y"),
			commandIsLowercase("X", "x"),
			programNotInstalled("x", { kind: "editor" }),
			programNotInstalled("x", { kind: "windows", equivalent: "y" }),
			noSuchUser("x"),
			sudoDenied("tech"),
			cannotExit("exit"),
			missingSpace("cd", "x"),
			fullwidthChar("，"),
			unclosedQuote('"'),
			emptyCommand("|"),
			missingRedirectTarget(">"),
			missingCommandForRedirect(">"),
			permissionDenied("x"),
			resourceBusy("x"),
			directoryNeedsRecursive("rm", "x", "rm -r x"),
			invalidNumber("head", "abc"),
			noInput("cat", "cat x"),
			invalidAssignment("=x"),
			invalidVariableName("1x"),
			invalidMode("zzz"),
			invalidPid("abc"),
			noSuchProcess(42),
			processIgnoredSignal(42, "nova"),
			processProtected(1, "init"),
			invalidPattern("grep", "x", "UNMATCHED_BRACKET"),
			conflictingMatchers("grep"),
			extraOperand("uniq", "x", "uniq"),
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

describe("帳號與登入（第十七場）", () => {
	it("noSuchUser 放進帳號名稱，並說不加名稱就是查自己", () => {
		const text = joinLines(noSuchUser("captain"));
		expect(text).toContain("`captain`");
		expect(text).toContain("id");
	});

	it("sudoDenied 照真的 sudo 說不在 sudoers 名單、這件事會被回報，再告訴玩家權限問題怎麼處理", () => {
		const text = joinLines(sudoDenied("tech"));
		expect(text).toContain("tech 不在 sudoers 名單中。這件事會被回報。");
		expect(text).toContain("ls -l");
	});

	it("cannotExit 說明這裡要按 Esc", () => {
		const text = joinLines(cannotExit("logout"));
		expect(text).toContain("logout");
		expect(text).toContain("Esc");
	});

	it("不指涉性別", () => {
		const text = joinLines([...noSuchUser("x"), ...sudoDenied("tech"), ...cannotExit("exit")]);
		expect(text).not.toMatch(/[他她]/);
	});
});

describe("pathNotFound 依路徑形態分流", () => {
	it("單純檔名維持「這個目錄下沒有…用 ls 看看」", () => {
		expect(pathNotFound("wake.txt").join("\n")).toContain("這個目錄下沒有");
	});

	it("含斜線的路徑不說「這個目錄下」，改教檢查路徑", () => {
		const text = pathNotFound("/deck2/access.log").join("\n");
		expect(text).not.toContain("這個目錄下");
		expect(text).toContain("找不到");
	});

	it("~ 開頭的路徑同樣不說「這個目錄下」", () => {
		expect(pathNotFound("~/repir/NOTES.txt").join("\n")).not.toContain("這個目錄下");
	});
});

describe("第十九場：tr、tee、xargs、sed、date、alias", () => {
	const all: string[][] = [
		dateCannotSet("0312"),
		trNeedsPipe(),
		trExtraOperand("crew.csv", "tr a-z A-Z"),
		trNeedsTwoSets("a-z"),
		trEmptySet2(),
		trInvalidRange("z-a"),
		trInvalidClass("digits"),
		teeNeedsPipe(),
		xargsNeedsPipe(),
		xargsInvalidCount("0"),
		xargsCannotRun(),
		subcommandRefused("hint"),
		sedUnsupportedCommand("a"),
		sedUnterminatedS("s/a/b"),
		sedUnknownSFlag("x"),
		sedZeroOccurrence(),
		sedInvalidPattern("[a", "UNMATCHED_BRACKET"),
		sedEmptyPattern(),
		sedInvalidReference("\\2", 1),
		sedMissingCommand("3"),
		sedExtraCharacters("p x"),
		sedInvalidLineZero(),
		sedUnexpectedComma(),
		sedUnterminatedAddress("/abc"),
		sedInPlaceSuffix("-i.bak"),
		sedNoInputFiles(),
		aliasInvalidName("a b"),
		aliasInvalidName(""),
		aliasEmptyValue("ll"),
		aliasUnsupportedValue("go"),
		aliasNotFound("ll"),
		whichAlias("ll", "alias ll='ls -l'"),
	];

	it("每個訊息都回傳非空陣列，每一行都不是空字串，也不指涉性別", () => {
		for (const lines of all) {
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(line.trim()).not.toBe("");
				expect(line).not.toMatch(/[他她]/);
			}
		}
	});

	it("tr 把檔名接在後面時教 cat 檔案 | tr 的寫法", () => {
		expect(joinLines(trExtraOperand("crew.csv", "tr a-z A-Z"))).toContain("cat crew.csv | tr a-z A-Z");
	});

	it("sed 的樣式錯誤沿用 grep 的原因說明，但不提 sed 沒有的 -F", () => {
		const text = joinLines(sedInvalidPattern("[a", "UNMATCHED_BRACKET"));
		expect(text).toContain("`[a`");
		expect(text).toContain("[ 沒有對應的 ]");
		expect(text).not.toContain("-F");
	});

	it("alias 名稱是空的（等號兩邊多了空白）時教正確寫法", () => {
		expect(joinLines(aliasInvalidName(""))).toContain("alias ll='ls -l'");
	});

	it("which 查到別名時印出定義", () => {
		expect(joinLines(whichAlias("ll", "alias ll='ls -l'"))).toContain("alias ll='ls -l'");
	});
});
