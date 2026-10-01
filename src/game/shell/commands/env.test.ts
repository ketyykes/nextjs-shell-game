// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unknownOption } from "../messages";
import { envCommand } from "./env";
import { createSystemContext } from "./systemFixtures";

describe("env", () => {
	it("指令名稱是 env", () => {
		expect(envCommand.name).toBe("env");
	});

	it("依名稱排序列出 名稱=值", () => {
		const result = envCommand.run([], createSystemContext());

		expect(result).toEqual({ ok: true, lines: ["HOME=/home/tech", "PWD=/deck4/comms", "USER=tech"] });
	});

	it("值是空字串時印 名稱=", () => {
		const result = envCommand.run([], createSystemContext({ env: { NOVA_DIR: "" } }));

		expect(result.lines).toEqual(["NOVA_DIR="]);
	});

	it("用 code unit 排序", () => {
		const result = envCommand.run([], createSystemContext({ env: { b: "1", _A: "2", Z: "3" } }));

		expect(result.lines).toEqual(["Z=3", "_A=2", "b=1"]);
	});

	it("沒有任何變數時輸出空陣列", () => {
		expect(envCommand.run([], createSystemContext({ env: {} }))).toEqual({ ok: true, lines: [] });
	});

	it("不回 nextEnv", () => {
		expect(envCommand.run([], createSystemContext()).nextEnv).toBeUndefined();
	});

	it("有參數時回 unknownOption", () => {
		const result = envCommand.run(["NOVA_DIR"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("env", "NOVA_DIR") });
	});
});
