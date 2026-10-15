// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sudoDenied } from "../messages";
import { createSudoCommand, sudoCommand } from "./sudo";
import { createContext } from "./testFixtures";

describe("sudo", () => {
	it("指令名稱是 sudo", () => {
		expect(sudoCommand.name).toBe("sudo");
	});

	it("tech 不在 sudoers 名單裡：被拒絕但不算錯誤（不扣氧），結束碼是 1", () => {
		expect(sudoCommand.run(["cat", "/etc/shadow"], createContext())).toEqual({
			ok: true,
			lines: sudoDenied("tech"),
			exitStatus: 1,
		});
	});

	it("不管後面接什麼（包括什麼都不接）都一樣被拒絕", () => {
		expect(sudoCommand.run([], createContext()).lines).toEqual(sudoDenied("tech"));
		expect(sudoCommand.run(["-l"], createContext()).lines).toEqual(sudoDenied("tech"));
	});
});

describe("createSudoCommand 換拒絕訊息", () => {
	it("用給的訊息，一樣不算錯誤、結束碼 1", () => {
		const command = createSudoCommand((user) => [`${user} 不行`]);

		expect(command.name).toBe("sudo");
		expect(command.run(["kill", "1"], createContext())).toEqual({ ok: true, lines: ["tech 不行"], exitStatus: 1 });
	});
});
