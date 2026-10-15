// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	missingOperand,
	trEmptySet2,
	trExtraOperand,
	trInvalidClass,
	trInvalidRange,
	trNeedsPipe,
	trNeedsTwoSets,
	unknownOption,
} from "../messages";
import { trCommand } from "./tr";
import { createContext } from "./testFixtures";

function runTr(args: string[], stdin: string[] | null) {
	return trCommand.run(args, createContext({ stdin }));
}

describe("tr 換字", () => {
	it("指令名稱是 tr", () => {
		expect(trCommand.name).toBe("tr");
	});

	it("a-z 換成 A-Z，中文照原樣", () => {
		expect(runTr(["a-z", "A-Z"], ["hello world", "冷凍艙 pod_06"])).toEqual({
			ok: true,
			lines: ["HELLO WORLD", "冷凍艙 POD_06"],
		});
	});

	it("[:lower:] 換成 [:upper:]，反過來也可以", () => {
		expect(runTr(["[:lower:]", "[:upper:]"], ["Abin"]).lines).toEqual(["ABIN"]);
		expect(runTr(["[:upper:]", "[:lower:]"], ["NOVA Core"]).lines).toEqual(["nova core"]);
	});

	it("第二組比較短時用最後一個字補齊（GNU 行為）", () => {
		expect(runTr(["abc", "x"], ["aabbcc"]).lines).toEqual(["xxxxxx"]);
		expect(runTr(["abc", "xy"], ["abc"]).lines).toEqual(["xyy"]);
	});

	it("中文一個字算一個", () => {
		expect(runTr(["艙", "室"], ["冷凍艙"]).lines).toEqual(["冷凍室"]);
		expect(runTr(["冷凍", "AB"], ["冷凍艙"]).lines).toEqual(["AB艙"]);
	});

	it("空白換成換行，一行拆成好幾行", () => {
		expect(runTr([" ", "\\n"], ["a b c"]).lines).toEqual(["a", "b", "c"]);
	});

	it("換行換成空白，好幾行接成一行", () => {
		expect(runTr(["\\n", " "], ["a", "b"]).lines).toEqual(["a b "]);
	});

	it("跳脫 \\t 與 \\\\", () => {
		expect(runTr(["\\t", ","], ["a\tb"]).lines).toEqual(["a,b"]);
		expect(runTr(["\\\\", "/"], ["C:\\deck\\logs"]).lines).toEqual(["C:/deck/logs"]);
	});

	it("單獨的 - 當成字元", () => {
		expect(runTr(["-", "_"], ["2031-03-12"]).lines).toEqual(["2031_03_12"]);
	});

	it("沒有輸入時沒有輸出", () => {
		expect(runTr(["a", "b"], [])).toEqual({ ok: true, lines: [] });
	});
});

describe("tr -d 刪除", () => {
	it("刪掉數字", () => {
		expect(runTr(["-d", "[:digit:]"], ["pod_06 at 08:15"]).lines).toEqual(["pod_ at :"]);
	});

	it("刪掉換行，全部接成一行", () => {
		expect(runTr(["-d", "\\n"], ["a", "b"]).lines).toEqual(["ab"]);
	});

	it("[:space:]、[:alpha:]、[:alnum:] 只認英文字母與數字（跟 GNU tr 一樣，中文不算）", () => {
		expect(runTr(["-d", "[:space:]"], ["a b\tc"]).lines).toEqual(["abc"]);
		expect(runTr(["-d", "[:alpha:]"], ["ab12冷"]).lines).toEqual(["12冷"]);
		expect(runTr(["-d", "[:alnum:]"], ["a-1_冷"]).lines).toEqual(["-_冷"]);
	});

	it("刪掉中文字", () => {
		expect(runTr(["-d", "冷"], ["冷凍艙"]).lines).toEqual(["凍艙"]);
	});
});

describe("tr -s 壓縮重複", () => {
	it("連續的空白壓成一個", () => {
		expect(runTr(["-s", " "], ["a   b    c"]).lines).toEqual(["a b c"]);
	});

	it("連續的換行壓成一個，空行就不見了", () => {
		expect(runTr(["-s", "\\n"], ["a", "", "", "b"]).lines).toEqual(["a", "b"]);
	});

	it("給兩組時先換字，再壓縮第二組的字", () => {
		expect(runTr(["-s", "a-z", "A-Z"], ["aabbcc"]).lines).toEqual(["ABC"]);
	});

	it("-ds 先刪第一組，再壓縮第二組", () => {
		expect(runTr(["-ds", "0-9", " "], ["a1  2b"]).lines).toEqual(["a b"]);
	});
});

describe("tr 的錯誤", () => {
	it("沒給字元", () => {
		expect(runTr([], ["x"])).toEqual({
			ok: false,
			lines: missingOperand("tr", "兩組字元，例如 cat 檔名 | tr a-z A-Z"),
		});
	});

	it("不在管線裡：tr 只讀管線輸入", () => {
		expect(runTr(["a-z", "A-Z"], null)).toEqual({ ok: false, lines: trNeedsPipe() });
	});

	it("把檔名接在後面：照 GNU 報多一個參數，並提示用 cat 檔案 | tr", () => {
		expect(runTr(["a-z", "A-Z", "crew.csv"], null)).toEqual({
			ok: false,
			lines: trExtraOperand("crew.csv", "tr a-z A-Z"),
		});
		expect(runTr(["-d", " ", "crew.csv"], ["x"])).toEqual({
			ok: false,
			lines: trExtraOperand("crew.csv", "tr -d ' '"),
		});
	});

	it("換字只給一組", () => {
		expect(runTr(["a-z"], ["x"])).toEqual({ ok: false, lines: trNeedsTwoSets("a-z") });
	});

	it("第二組是空的", () => {
		expect(runTr(["a", ""], ["x"])).toEqual({ ok: false, lines: trEmptySet2() });
	});

	it("範圍寫反", () => {
		expect(runTr(["z-a", "A-Z"], ["x"])).toEqual({ ok: false, lines: trInvalidRange("z-a") });
	});

	it("不認得的字元類別", () => {
		expect(runTr(["-d", "[:digits:]"], ["x"])).toEqual({ ok: false, lines: trInvalidClass("digits") });
	});

	it("不支援的選項", () => {
		expect(runTr(["-c", "a", "b"], ["x"])).toEqual({ ok: false, lines: unknownOption("tr", "-c") });
	});
});
