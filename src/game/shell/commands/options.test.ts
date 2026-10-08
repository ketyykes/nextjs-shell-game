// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unknownOption } from "../messages";
import { parseFlagArgs, splitOptionsAndOperands } from "./options";

describe("parseFlagArgs", () => {
	it("分開選項與一般參數，順序保留", () => {
		const result = parseFlagArgs("rm", ["-r", "a", "b"], "rRf");

		expect(result).toEqual({ ok: true, flags: new Set(["r"]), operands: ["a", "b"] });
	});

	it("合併寫的選項會拆成單一字母", () => {
		const result = parseFlagArgs("rm", ["-rf", "a"], "rRf");

		expect(result).toEqual({ ok: true, flags: new Set(["r", "f"]), operands: ["a"] });
	});

	it("選項可以放在參數後面", () => {
		const result = parseFlagArgs("cp", ["a", "b", "-r"], "rR");

		expect(result).toEqual({ ok: true, flags: new Set(["r"]), operands: ["a", "b"] });
	});

	it("-- 之後全部當成參數，單獨的 - 也是參數", () => {
		const result = parseFlagArgs("rm", ["--", "-r", "-"], "rRf");

		expect(result).toEqual({ ok: true, flags: new Set(), operands: ["-r", "-"] });
	});

	it("不支援的字母回傳 unknownOption", () => {
		expect(parseFlagArgs("rm", ["-rz", "a"], "rRf")).toEqual({ ok: false, lines: unknownOption("rm", "-z") });
	});

	it("長選項回傳 unknownOption", () => {
		expect(parseFlagArgs("mkdir", ["--parents", "a"], "p")).toEqual({
			ok: false,
			lines: unknownOption("mkdir", "--parents"),
		});
	});
});

describe("parseFlagArgs 的 onFlag", () => {
	it("依出現順序對每個合法字母呼叫，重複的也會", () => {
		const seen: string[] = [];
		parseFlagArgs("grep", ["-in", "x", "-i"], "in", (flag) => {
			seen.push(flag);
			return null;
		});

		expect(seen).toEqual(["i", "n", "i"]);
	});

	it("回傳錯誤訊息就中止，後面的未知字母不再檢查", () => {
		const result = parseFlagArgs("grep", ["-E", "-F", "-z"], "EF", (flag) => (flag === "F" ? ["衝突"] : null));

		expect(result).toEqual({ ok: false, lines: ["衝突"] });
	});

	it("不支援的字母不會交給 onFlag", () => {
		const seen: string[] = [];
		parseFlagArgs("rm", ["-z"], "r", (flag) => {
			seen.push(flag);
			return null;
		});

		expect(seen).toEqual([]);
	});
});

describe("splitOptionsAndOperands", () => {
	it("預設：- 開頭是選項、單獨的 - 是操作數、-- 之後全部是操作數", () => {
		expect(splitOptionsAndOperands(["-la", "a", "-", "--", "-r", "--"])).toEqual({
			options: ["-la"],
			operands: ["a", "-", "-r", "--"],
		});
	});

	it("長選項原樣放進 options，交給指令判斷", () => {
		expect(splitOptionsAndOperands(["--all", "a"])).toEqual({ options: ["--all"], operands: ["a"] });
	});

	it("endOfOptions 為 false 時 -- 留在 options", () => {
		expect(splitOptionsAndOperands(["--", "a"], { endOfOptions: false })).toEqual({
			options: ["--"],
			operands: ["a"],
		});
	});

	it("loneDashIsOperand 為 false 時單獨的 - 留在 options", () => {
		expect(splitOptionsAndOperands(["-", "a"], { loneDashIsOperand: false })).toEqual({
			options: ["-"],
			operands: ["a"],
		});
	});

	it("valueOptions 吃掉下一個參數當值，即使它以 - 開頭或是 --", () => {
		expect(splitOptionsAndOperands(["-n", "5", "a", "-n", "--", "b"], { valueOptions: ["-n"] })).toEqual({
			options: ["-n", "5", "-n", "--"],
			operands: ["a", "b"],
		});
	});

	it("valueOptions 是最後一個參數時後面沒有值", () => {
		expect(splitOptionsAndOperands(["a", "-n"], { valueOptions: ["-n"] })).toEqual({
			options: ["-n"],
			operands: ["a"],
		});
	});

	it("黏在一起的值（-n5）不算 valueOption，整個是一個選項", () => {
		expect(splitOptionsAndOperands(["-n5", "a"], { valueOptions: ["-n"] })).toEqual({
			options: ["-n5"],
			operands: ["a"],
		});
	});

	it("-- 之後的 valueOption 也是操作數", () => {
		expect(splitOptionsAndOperands(["--", "-n", "5"], { valueOptions: ["-n"] })).toEqual({
			options: [],
			operands: ["-n", "5"],
		});
	});
});
