// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "../fs";
import {
	fsError,
	missingOperand,
	noInput,
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
	unknownOption,
} from "../messages";
import type { CommandContext } from "../types";
import { sedCommand } from "./sed";
import { createContext } from "./testFixtures";

/** 艙門日誌，四行。 */
const DOOR_LOG = ["21:00 A1 OPEN", "21:05 A2 OPEN", "21:40 A1 LOCK", "21:43 ALL LOCK by NOVA"];

function toContent(lines: string[]): string {
	return `${lines.join("\n")}\n`;
}

function createSedContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return createContext({
		cwd: "/data",
		fs: VirtualFileSystem.fromSnapshot({
			data: {
				"door.log": toContent(DOOR_LOG),
				"a.txt": "a1\na2\n",
				"b.txt": "b1\nb2\n",
				logs: {},
			},
		}),
		...overrides,
	});
}

function runSed(args: string[], overrides: Partial<CommandContext> = {}) {
	return sedCommand.run(args, createSedContext(overrides));
}

/** 用管線輸入跑 sed，只回傳輸出的行。 */
function sedLines(args: string[], stdin: string[]): string[] {
	return runSed(args, { stdin }).lines;
}

describe("sed s 取代", () => {
	it("指令名稱是 sed", () => {
		expect(sedCommand.name).toBe("sed");
	});

	it("每行只換第一個符合的地方，其他行照印", () => {
		expect(runSed(["s/OPEN/開啟/", "door.log"])).toEqual({
			ok: true,
			lines: ["21:00 A1 開啟", "21:05 A2 開啟", "21:40 A1 LOCK", "21:43 ALL LOCK by NOVA"],
		});
	});

	it("g 整行都換、數字只換第幾個、數字加 g 從第幾個換到最後", () => {
		expect(sedLines(["s/a/b/"], ["a a a"])).toEqual(["b a a"]);
		expect(sedLines(["s/a/b/g"], ["a a a"])).toEqual(["b b b"]);
		expect(sedLines(["s/a/b/2"], ["a a a"])).toEqual(["a b a"]);
		expect(sedLines(["s/a/b/2g"], ["a a a"])).toEqual(["a b b"]);
	});

	it("i 不分大小寫", () => {
		expect(sedLines(["s/open/X/i"], ["21:00 A1 OPEN"])).toEqual(["21:00 A1 X"]);
		expect(sedLines(["s/open/X/I"], ["Open"])).toEqual(["X"]);
	});

	it("分隔字元可以換，\\ 加分隔字元是字面字元", () => {
		expect(sedLines(["s|/deck1|/deck9|"], ["/deck1/medbay"])).toEqual(["/deck9/medbay"]);
		expect(sedLines(["s#a\\#b#X#"], ["a#b"])).toEqual(["X"]);
		expect(sedLines(["s/\\/home/~/"], ["/home/tech"])).toEqual(["~/tech"]);
	});

	it("& 是整個符合的字串，\\& 是字面的 &", () => {
		expect(sedLines(["s/[0-9][0-9]:[0-9][0-9]/[&]/"], ["21:00 A1 OPEN"])).toEqual(["[21:00] A1 OPEN"]);
		expect(sedLines(["s/and/\\&/"], ["A and B"])).toEqual(["A & B"]);
	});

	it("BRE 的 \\( \\) 群組與 \\1 回溯", () => {
		expect(sedLines(["s/\\(A[0-9]\\) \\(OPEN\\)/\\2 \\1/"], ["21:00 A1 OPEN"])).toEqual(["21:00 OPEN A1"]);
	});

	it("-E 用 ERE，括號直接是群組", () => {
		expect(sedLines(["-E", "s/(A[0-9]) (OPEN)/\\2 \\1/"], ["21:00 A1 OPEN"])).toEqual(["21:00 OPEN A1"]);
		expect(sedLines(["-r", "s/O+/0/g"], ["OOPS"])).toEqual(["0PS"]);
	});

	it("BRE 裡 + 是字面字元，\\. 是句點本身", () => {
		expect(sedLines(["s/a+/X/"], ["a+b"])).toEqual(["Xb"]);
		expect(sedLines(["s/\\./,/g"], ["v3.1.2"])).toEqual(["v3,1,2"]);
	});

	it("取代字串裡的 \\n 換行，一行變兩行；\\t 是 Tab", () => {
		expect(sedLines(["s/ /\\n/"], ["a b"])).toEqual(["a", "b"]);
		expect(sedLines(["s/,/\\t/g"], ["a,b"])).toEqual(["a\tb"]);
	});

	it("中文一個字算一個", () => {
		expect(sedLines(["s/艙/室/g"], ["冷凍艙與維生艙"])).toEqual(["冷凍室與維生室"]);
		expect(sedLines(["s/^./X/"], ["冷凍艙"])).toEqual(["X凍艙"]);
	});

	it("g 遇到空字串的符合跟 GNU 一樣，不會緊接在上一個符合後面再換一次", () => {
		expect(sedLines(["s/b*/X/g"], ["abc"])).toEqual(["XaXcX"]);
	});

	it("沒有符合的行照原樣", () => {
		expect(sedLines(["s/NOVA/nova/"], ["21:00 A1 OPEN"])).toEqual(["21:00 A1 OPEN"]);
	});
});

describe("sed 位址、p 與 d", () => {
	it("-n 加 p 只印指定的行：第 N 行、N,M、$、/樣式/", () => {
		expect(runSed(["-n", "2p", "door.log"]).lines).toEqual(["21:05 A2 OPEN"]);
		expect(runSed(["-n", "2,3p", "door.log"]).lines).toEqual(["21:05 A2 OPEN", "21:40 A1 LOCK"]);
		expect(runSed(["-n", "$p", "door.log"]).lines).toEqual(["21:43 ALL LOCK by NOVA"]);
		expect(runSed(["-n", "/LOCK/p", "door.log"]).lines).toEqual(["21:40 A1 LOCK", "21:43 ALL LOCK by NOVA"]);
	});

	it("位址跟指令中間可以有空白", () => {
		expect(runSed(["-n", "2 p", "door.log"]).lines).toEqual(["21:05 A2 OPEN"]);
		expect(runSed(["1,3 d", "door.log"]).lines).toEqual(["21:43 ALL LOCK by NOVA"]);
	});

	it("不加 -n 的 p 會讓那一行印兩次", () => {
		expect(sedLines(["1p"], ["a", "b"])).toEqual(["a", "a", "b"]);
	});

	it("d 刪掉指定的行：第 N 行、N,M、/樣式/、$", () => {
		expect(runSed(["1d", "door.log"]).lines).toEqual(DOOR_LOG.slice(1));
		expect(runSed(["2,3d", "door.log"]).lines).toEqual([DOOR_LOG[0], DOOR_LOG[3]]);
		expect(runSed(["/OPEN/d", "door.log"]).lines).toEqual(DOOR_LOG.slice(2));
		expect(runSed(["$d", "door.log"]).lines).toEqual(DOOR_LOG.slice(0, 3));
		expect(runSed(["3,$d", "door.log"]).lines).toEqual(DOOR_LOG.slice(0, 2));
	});

	it("範圍可以用樣式：從符合第一個樣式的行印到符合第二個的行", () => {
		expect(runSed(["-n", "/A2/,/LOCK/p", "door.log"]).lines).toEqual(["21:05 A2 OPEN", "21:40 A1 LOCK"]);
		expect(runSed(["-n", "2,/NOVA/p", "door.log"]).lines).toEqual(DOOR_LOG.slice(1));
	});

	it("範圍結尾的行號比開頭小時只有開頭那一行", () => {
		expect(runSed(["-n", "3,1p", "door.log"]).lines).toEqual(["21:40 A1 LOCK"]);
	});

	it("s///p 配 -n 只印換過的行", () => {
		expect(runSed(["-n", "s/LOCK/鎖定/p", "door.log"]).lines).toEqual(["21:40 A1 鎖定", "21:43 ALL 鎖定 by NOVA"]);
	});

	it("s 可以加位址", () => {
		expect(runSed(["2s/OPEN/X/", "door.log"]).lines).toEqual([DOOR_LOG[0], "21:05 A2 X", ...DOOR_LOG.slice(2)]);
		expect(runSed(["/A1/s/^/* /", "door.log"]).lines).toEqual([
			"* 21:00 A1 OPEN",
			DOOR_LOG[1],
			"* 21:40 A1 LOCK",
			DOOR_LOG[3],
		]);
	});
});

describe("sed 好幾個指令", () => {
	it("-e 可以給好幾個，依序套用", () => {
		expect(sedLines(["-e", "s/A/B/", "-e", "s/B/C/"], ["A"])).toEqual(["C"]);
	});

	it("一段腳本裡用 ; 隔開", () => {
		expect(runSed(["s/OPEN/開/;s/LOCK/鎖/", "door.log"]).lines).toEqual([
			"21:00 A1 開",
			"21:05 A2 開",
			"21:40 A1 鎖",
			"21:43 ALL 鎖 by NOVA",
		]);
		expect(runSed(["-n", "1p;4p", "door.log"]).lines).toEqual([DOOR_LOG[0], DOOR_LOG[3]]);
	});

	it("-ne 合在一起寫，後面接腳本", () => {
		expect(runSed(["-ne", "2p", "door.log"]).lines).toEqual([DOOR_LOG[1]]);
	});

	it("d 之後同一行不再往下跑；p 印的是換過之後的內容", () => {
		expect(sedLines(["-e", "1d", "-e", "s/.*/X/"], ["a", "b"])).toEqual(["X"]);
		expect(sedLines(["-n", "s/a/b/;p"], ["a"])).toEqual(["b"]);
	});
});

describe("sed 的輸入", () => {
	it("沒給檔名時讀管線輸入", () => {
		expect(runSed(["s/x/y/"], { stdin: ["x1", "x2"] })).toEqual({ ok: true, lines: ["y1", "y2"] });
	});

	it("好幾個檔案接成一串，行號接著數，$ 是最後一個檔案的最後一行", () => {
		expect(runSed(["-n", "3p;$p", "a.txt", "b.txt"]).lines).toEqual(["b1", "b2"]);
	});

	it("讀不到的檔案報錯、其他照跑，整個算錯誤", () => {
		expect(runSed(["s/a/A/", "nope.txt", "a.txt"])).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "nope.txt"), "A1", "A2"],
		});
		expect(runSed(["p", "logs"]).ok).toBe(false);
	});

	it("沒給檔名也不在管線裡", () => {
		expect(runSed(["s/a/b/"])).toEqual({ ok: false, lines: noInput("sed", "sed 's/舊/新/' 檔名") });
	});
});

describe("sed -i 直接改檔", () => {
	it("改寫檔案、畫面不印東西", () => {
		const context = createSedContext();
		const result = sedCommand.run(["-i", "s/OPEN/開啟/", "door.log"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile("/data", "door.log")).toBe(
			toContent(["21:00 A1 開啟", "21:05 A2 開啟", "21:40 A1 LOCK", "21:43 ALL LOCK by NOVA"]),
		);
	});

	it("好幾個檔案各改各的，行號各自從 1 數", () => {
		const context = createSedContext();
		sedCommand.run(["-i", "1d", "a.txt", "b.txt"], context);

		expect(context.fs.readFile("/data", "a.txt")).toBe("a2\n");
		expect(context.fs.readFile("/data", "b.txt")).toBe("b2\n");
	});

	it("-n -i 沒有 p 的話檔案會變空的（跟真的 sed 一樣）", () => {
		const context = createSedContext();
		sedCommand.run(["-n", "-i", "s/a/b/", "a.txt"], context);

		expect(context.fs.readFile("/data", "a.txt")).toBe("");
	});

	it("讀不到的檔案報錯，其他照改", () => {
		const context = createSedContext();
		const result = sedCommand.run(["-i", "s/a/A/", "nope.txt", "a.txt"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.txt") });
		expect(context.fs.readFile("/data", "a.txt")).toBe("A1\nA2\n");
	});

	it("-i 一定要有檔名，管線輸入不能改", () => {
		expect(runSed(["-i", "s/a/b/"], { stdin: ["a"] })).toEqual({ ok: false, lines: sedNoInputFiles() });
	});

	it("-i 後面黏著字是備份副檔名，這裡不支援", () => {
		expect(runSed(["-i.bak", "s/a/b/", "a.txt"])).toEqual({ ok: false, lines: sedInPlaceSuffix("-i.bak") });
	});
});

describe("sed 的錯誤", () => {
	it("沒給腳本", () => {
		expect(runSed([])).toEqual({ ok: false, lines: missingOperand("sed", "一段腳本，例如 sed 's/舊/新/' 檔名") });
		expect(runSed(["-e"])).toEqual({ ok: false, lines: missingOperand("sed", "在 -e 後面接一段腳本，例如 sed -e 's/舊/新/' 檔名") });
	});

	it.each([
		["a 新的一行", "a"],
		["i\\ 插入", "i"],
		["c 換掉", "c"],
		["y/abc/xyz/", "y"],
		["h", "h"],
		["w out.txt", "w"],
		["3!d", "!"],
		["q", "q"],
	])("不支援的指令 %s", (script, command) => {
		expect(runSed([script, "a.txt"])).toEqual({ ok: false, lines: sedUnsupportedCommand(command) });
	});

	it("s 沒寫完", () => {
		expect(runSed(["s/a/b", "a.txt"])).toEqual({ ok: false, lines: sedUnterminatedS("s/a/b") });
		expect(runSed(["s/a", "a.txt"])).toEqual({ ok: false, lines: sedUnterminatedS("s/a") });
	});

	it("s 後面不認得的旗標，或 w 這類不支援的旗標", () => {
		expect(runSed(["s/a/b/x", "a.txt"])).toEqual({ ok: false, lines: sedUnknownSFlag("x") });
		expect(runSed(["s/a/b/w out.txt", "a.txt"])).toEqual({ ok: false, lines: sedUnknownSFlag("w") });
	});

	it("s 的數字是 0", () => {
		expect(runSed(["s/a/b/0", "a.txt"])).toEqual({ ok: false, lines: sedZeroOccurrence() });
	});

	it("樣式不合法", () => {
		expect(runSed(["s/[a/b/", "a.txt"])).toEqual({ ok: false, lines: sedInvalidPattern("[a", "UNMATCHED_BRACKET") });
		expect(runSed(["-n", "/\\(/p", "a.txt"])).toEqual({ ok: false, lines: sedInvalidPattern("\\(", "UNMATCHED_PAREN") });
	});

	it("空的樣式（沿用上一個樣式）不支援", () => {
		expect(runSed(["s//x/", "a.txt"])).toEqual({ ok: false, lines: sedEmptyPattern() });
	});

	it("取代字串用了不存在的群組", () => {
		expect(runSed(["s/a/\\1/", "a.txt"])).toEqual({ ok: false, lines: sedInvalidReference("\\1", 0) });
		expect(runSed(["s/\\(a\\)/\\2/", "a.txt"])).toEqual({ ok: false, lines: sedInvalidReference("\\2", 1) });
	});

	it("位址後面少了指令", () => {
		expect(runSed(["3", "a.txt"])).toEqual({ ok: false, lines: sedMissingCommand("3") });
		expect(runSed(["-n", "/a/", "a.txt"])).toEqual({ ok: false, lines: sedMissingCommand("/a/") });
	});

	it("指令後面多了東西", () => {
		expect(runSed(["-n", "p x", "a.txt"])).toEqual({ ok: false, lines: sedExtraCharacters("p x") });
	});

	it("沒有第 0 行", () => {
		expect(runSed(["-n", "0p", "a.txt"])).toEqual({ ok: false, lines: sedInvalidLineZero() });
	});

	it("逗號後面沒有範圍結尾", () => {
		expect(runSed(["-n", "2,p", "a.txt"])).toEqual({ ok: false, lines: sedUnexpectedComma() });
	});

	it("位址的樣式沒有結尾的 /", () => {
		expect(runSed(["-n", "/abc", "a.txt"])).toEqual({ ok: false, lines: sedUnterminatedAddress("/abc") });
	});

	it("不支援的選項", () => {
		expect(runSed(["-z", "p", "a.txt"])).toEqual({ ok: false, lines: unknownOption("sed", "-z") });
		expect(runSed(["--quiet", "p", "a.txt"])).toEqual({ ok: false, lines: unknownOption("sed", "--quiet") });
	});
});
