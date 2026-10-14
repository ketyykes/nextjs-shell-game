// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extraOperand, unknownOption } from "../messages";
import { PLAYER_USER } from "../types";
import { createContext } from "./testFixtures";
import { whoamiCommand } from "./whoami";

describe("whoami", () => {
	it("指令名稱是 whoami", () => {
		expect(whoamiCommand.name).toBe("whoami");
	});

	it("只印一行登入的帳號名稱", () => {
		expect(whoamiCommand.run([], createContext())).toEqual({ ok: true, lines: [PLAYER_USER] });
		expect(PLAYER_USER).toBe("tech");
	});

	it("看的是登入的帳號，不是環境變數 USER", () => {
		const context = createContext({ env: { HOME: "/home/tech", USER: "captain" } });

		expect(whoamiCommand.run([], context).lines).toEqual(["tech"]);
	});

	it("多給參數回 extraOperand", () => {
		expect(whoamiCommand.run(["tech"], createContext())).toEqual({
			ok: false,
			lines: extraOperand("whoami", "tech", "whoami"),
		});
	});

	it("選項回 unknownOption", () => {
		expect(whoamiCommand.run(["-a"], createContext())).toEqual({ ok: false, lines: unknownOption("whoami", "-a") });
	});
});
