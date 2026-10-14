// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cannotExit } from "../messages";
import { exitCommand, logoutCommand } from "./exit";
import { createContext } from "./testFixtures";

describe("exit 與 logout", () => {
	it("指令名稱是 exit 與 logout", () => {
		expect(exitCommand.name).toBe("exit");
		expect(logoutCommand.name).toBe("logout");
	});

	it("關不掉終端機：說明要按 Esc，不算錯誤，結束碼是 1", () => {
		expect(exitCommand.run([], createContext())).toEqual({ ok: true, lines: cannotExit("exit"), exitStatus: 1 });
		expect(logoutCommand.run([], createContext())).toEqual({ ok: true, lines: cannotExit("logout"), exitStatus: 1 });
	});

	it("帶結束碼也一樣", () => {
		expect(exitCommand.run(["0"], createContext()).lines).toEqual(cannotExit("exit"));
	});
});
