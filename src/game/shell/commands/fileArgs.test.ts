// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unknownOption } from "../messages";
import { parseFlagArgs } from "./fileArgs";

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
