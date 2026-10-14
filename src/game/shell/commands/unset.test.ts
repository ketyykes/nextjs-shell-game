// @vitest-environment node
import { describe, expect, it } from "vitest";
import { invalidVariableName, unknownOption } from "../messages";
import { createSystemContext } from "./systemFixtures";
import { unsetCommand } from "./unset";

/** 帶 `GREETING`、`PLANET` 兩個練習用變數的 context。 */
function createContext() {
	return createSystemContext({ env: { HOME: "/home/tech", USER: "tech", GREETING: "hello", PLANET: "Jupiter" } });
}

describe("unset 移除變數", () => {
	it("指令名稱是 unset", () => {
		expect(unsetCommand.name).toBe("unset");
	});

	it("unset 名稱 把變數拿掉，不印任何行並回整份新的 nextEnv", () => {
		const result = unsetCommand.run(["GREETING"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: [],
			nextEnv: { HOME: "/home/tech", USER: "tech", PLANET: "Jupiter" },
		});
	});

	it("一次可以拿掉好幾個", () => {
		const result = unsetCommand.run(["GREETING", "PLANET"], createContext());

		expect(result.nextEnv).toEqual({ HOME: "/home/tech", USER: "tech" });
	});

	it("不存在的名稱靜默成功（bash 行為），環境不變", () => {
		expect(unsetCommand.run(["NOPE"], createContext())).toEqual({ ok: true, lines: [] });
	});

	it("沒有參數時什麼都不做，也不算錯", () => {
		expect(unsetCommand.run([], createContext())).toEqual({ ok: true, lines: [] });
	});

	it("nextEnv 是新物件，不會改到原本的 context.env", () => {
		const context = createContext();
		const before = { ...context.env };
		const result = unsetCommand.run(["GREETING"], context);

		expect(result.nextEnv).not.toBe(context.env);
		expect(context.env).toEqual(before);
	});
});

describe("unset 的選項", () => {
	it("-v 是預設行為（拿掉變數），照樣接受", () => {
		const result = unsetCommand.run(["-v", "GREETING"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: [],
			nextEnv: { HOME: "/home/tech", USER: "tech", PLANET: "Jupiter" },
		});
	});

	it("-f（拿掉函式）這個 shell 沒有，回 unknownOption，什麼都不動", () => {
		expect(unsetCommand.run(["-f", "GREETING"], createContext())).toEqual({
			ok: false,
			lines: unknownOption("unset", "-f"),
		});
	});

	it("別的選項也回 unknownOption", () => {
		expect(unsetCommand.run(["-x"], createContext())).toEqual({ ok: false, lines: unknownOption("unset", "-x") });
	});
});

describe("unset 不合法的名稱", () => {
	it("名稱不合法時回 invalidVariableName，算錯誤", () => {
		expect(unsetCommand.run(["1ABC"], createContext())).toEqual({
			ok: false,
			lines: invalidVariableName("1ABC"),
		});
	});

	it("寫成 名稱=值 也不是合法的名稱", () => {
		expect(unsetCommand.run(["GREETING=hello"], createContext()).lines).toEqual(invalidVariableName("GREETING=hello"));
	});

	it("不合法的不影響合法的（跟 bash 一樣），但整體算錯誤", () => {
		const result = unsetCommand.run(["GREETING", "1ABC", "PLANET"], createContext());

		expect(result).toEqual({
			ok: false,
			lines: invalidVariableName("1ABC"),
			nextEnv: { HOME: "/home/tech", USER: "tech" },
		});
	});
});
