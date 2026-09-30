// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pwdCommand } from "./pwd";
import { createContext } from "./testFixtures";

describe("pwd", () => {
	it("指令名稱是 pwd", () => {
		expect(pwdCommand.name).toBe("pwd");
	});

	it("印出目前工作目錄", () => {
		const result = pwdCommand.run([], createContext());

		expect(result).toEqual({ ok: true, lines: ["/home/tech"] });
	});

	it("在其他目錄時印出該目錄", () => {
		const result = pwdCommand.run([], createContext({ cwd: "/deck1/systems/power" }));

		expect(result.lines).toEqual(["/deck1/systems/power"]);
	});

	it("多餘的參數直接忽略，不算錯誤", () => {
		const result = pwdCommand.run(["extra", "-x"], createContext());

		expect(result).toEqual({ ok: true, lines: ["/home/tech"] });
	});
});
