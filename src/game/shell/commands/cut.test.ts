// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "../fs";
import {
	cutConflictingLists,
	cutDelimiterNeedsFields,
	cutInvalidDelimiter,
	cutInvalidList,
	cutMissingList,
	cutSuppressNeedsFields,
	fsError,
	missingOperand,
	noInput,
	unknownOption,
} from "../messages";
import type { CommandContext } from "../types";
import { cutCommand } from "./cut";
import { createFilterContext } from "./filterFixtures";

/** 乘員名冊：逗號分隔，第二行沒有分隔字元，最後一行只有兩欄。 */
const CREW_CSV = ["id,name,role,deck", "# crew roster", "01,阿彬,技師,1", "02,NOVA,AI,6", "03,林"].join("\n") + "\n";

/** 艙門日誌：用空白分隔。 */
const DOOR_LOG = "21:00 A1 OPEN\n21:43 ALL LOCK\n";

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return createFilterContext({
		cwd: "/data",
		fs: VirtualFileSystem.fromSnapshot({
			data: {
				"crew.csv": CREW_CSV,
				"door.log": DOOR_LOG,
				"tabs.tsv": "a\tb\tc\n",
				logs: {},
			},
		}),
		...overrides,
	});
}

describe("cut -f 欄位", () => {
	it("指令名稱是 cut", () => {
		expect(cutCommand.name).toBe("cut");
	});

	it("-d , -f 2 取第二欄；沒有分隔字元的行整行照印", () => {
		const result = cutCommand.run(["-d", ",", "-f", "2", "crew.csv"], createContext());

		expect(result).toEqual({ ok: true, lines: ["name", "# crew roster", "阿彬", "NOVA", "林"] });
	});

	it("-d, -f1,3 黏在一起也可以，欄位用分隔字元接回去，不夠的欄位直接略過", () => {
		const result = cutCommand.run(["-d,", "-f1,3", "crew.csv"], createContext());

		expect(result.lines).toEqual(["id,role", "# crew roster", "01,技師", "02,AI", "03"]);
	});

	it("範圍 2-3、開放範圍 3- 與 -2", () => {
		const middle = cutCommand.run(["-d", ",", "-f", "2-3", "crew.csv"], createContext());
		const tail = cutCommand.run(["-d", ",", "-f", "3-", "crew.csv"], createContext());
		const head = cutCommand.run(["-d", ",", "-f", "-2", "crew.csv"], createContext());

		expect(middle.lines[2]).toBe("阿彬,技師");
		expect(tail.lines[2]).toBe("技師,1");
		expect(tail.lines[4]).toBe("");
		expect(head.lines[2]).toBe("01,阿彬");
	});

	it("欄位照檔案裡的順序輸出，重複的只印一次（3,1 等於 1,3）", () => {
		const result = cutCommand.run(["-d", ",", "-f", "3,1,1-1", "crew.csv"], createContext());

		expect(result.lines[2]).toBe("01,技師");
	});

	it("用空白當分隔字元要加引號", () => {
		const result = cutCommand.run(["-d", " ", "-f", "3", "door.log"], createContext());

		expect(result).toEqual({ ok: true, lines: ["OPEN", "LOCK"] });
	});

	it("沒給 -d 時用 Tab 分隔", () => {
		const result = cutCommand.run(["-f", "2", "tabs.tsv"], createContext());

		expect(result).toEqual({ ok: true, lines: ["b"] });
	});

	it("-s 不印沒有分隔字元的行", () => {
		const result = cutCommand.run(["-s", "-d", ",", "-f", "2", "crew.csv"], createContext());

		expect(result.lines).toEqual(["name", "阿彬", "NOVA", "林"]);
	});
});

describe("cut -c 字元", () => {
	it("-c 1-5 取每行前五個字元", () => {
		const result = cutCommand.run(["-c", "1-5", "door.log"], createContext());

		expect(result).toEqual({ ok: true, lines: ["21:00", "21:43"] });
	});

	it("中文一個字算一個字元", () => {
		const result = cutCommand.run(["-c4-5", "crew.csv"], createContext());

		expect(result.lines[2]).toBe("阿彬");
	});

	it("-c 1,3 與 7- 混用", () => {
		const result = cutCommand.run(["-c", "1,3,7-", "door.log"], createContext());

		expect(result.lines).toEqual(["2:A1 OPEN", "2:ALL LOCK"]);
	});
});

describe("cut 輸入來源", () => {
	it("沒給檔名時讀管線輸入", () => {
		const result = cutCommand.run(["-d", ":", "-f", "1"], createContext({ stdin: ["21:00", "22:15"] }));

		expect(result).toEqual({ ok: true, lines: ["21", "22"] });
	});

	it("沒給檔名也不在管線裡時提示要給輸入", () => {
		const result = cutCommand.run(["-f", "1"], createContext());

		expect(result).toEqual({ ok: false, lines: noInput("cut", "cut -d , -f 2 crew.csv") });
	});

	it("多個檔案依序處理，讀不到的檔案印錯誤、其他照處理，整體算失敗", () => {
		const result = cutCommand.run(["-c", "1-2", "nope.csv", "door.log", "logs"], createContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "nope.csv"), "21", "21", ...fsError("EISDIR", "logs")],
		});
	});
});

describe("cut 用法錯誤", () => {
	it("沒指定 -f 或 -c", () => {
		expect(cutCommand.run(["crew.csv"], createContext())).toEqual({ ok: false, lines: cutMissingList() });
	});

	it("-f 與 -c 同時給", () => {
		expect(cutCommand.run(["-f", "1", "-c", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: cutConflictingLists(),
		});
	});

	it("-d 跟 -c 一起用", () => {
		expect(cutCommand.run(["-d", ",", "-c", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: cutDelimiterNeedsFields(),
		});
	});

	it("-s 跟 -c 一起用", () => {
		expect(cutCommand.run(["-s", "-c", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: cutSuppressNeedsFields(),
		});
	});

	it("分隔字元不是剛好一個字", () => {
		expect(cutCommand.run(["-d", "ab", "-f", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: cutInvalidDelimiter("ab"),
		});
		expect(cutCommand.run(["-d", "", "-f", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: cutInvalidDelimiter(""),
		});
	});

	it.each([
		["0", "zero"],
		["0-2", "zero"],
		["3-1", "decreasing"],
		["x", "invalid"],
		["1,,2", "invalid"],
		["-", "invalid"],
	] as const)("清單 %s 不合法", (list, reason) => {
		expect(cutCommand.run(["-d", ",", "-f", list, "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: cutInvalidList(list, reason),
		});
	});

	it("-f、-d、-c 後面沒有東西", () => {
		expect(cutCommand.run(["crew.csv", "-f"], createContext())).toEqual({
			ok: false,
			lines: missingOperand("cut", "在 -f 後面接要取的欄位，例如 cut -d , -f 2 crew.csv"),
		});
		expect(cutCommand.run(["-f", "1", "-d"], createContext())).toEqual({
			ok: false,
			lines: missingOperand("cut", "在 -d 後面接分隔字元，例如 cut -d , -f 2 crew.csv"),
		});
		expect(cutCommand.run(["-c"], createContext())).toEqual({
			ok: false,
			lines: missingOperand("cut", "在 -c 後面接要取的字元位置，例如 cut -c 1-5 door.log"),
		});
	});

	it("不認得的選項", () => {
		expect(cutCommand.run(["-b", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: unknownOption("cut", "-b"),
		});
		expect(cutCommand.run(["--complement", "-f", "1", "crew.csv"], createContext())).toEqual({
			ok: false,
			lines: unknownOption("cut", "--complement"),
		});
	});
});
