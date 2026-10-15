// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aliasNotFound, missingOperand, unknownOption } from "../messages";
import { unaliasCommand } from "./unalias";
import { createContext } from "./testFixtures";

const ALIASES = { ll: "ls -l", la: "ls -a" };

function runUnalias(args: string[], aliases: Record<string, string> | undefined = ALIASES) {
	return unaliasCommand.run(args, createContext({ aliases }));
}

describe("unalias", () => {
	it("指令名稱是 unalias", () => {
		expect(unaliasCommand.name).toBe("unalias");
	});

	it("拿掉指定的別名，回傳剩下的", () => {
		expect(runUnalias(["ll"])).toEqual({ ok: true, lines: [], nextAliases: { la: "ls -a" } });
		expect(runUnalias(["ll", "la"]).nextAliases).toEqual({});
	});

	it("沒有這個別名：說明一下，不算錯誤，結束碼 1；其他的照樣拿掉", () => {
		expect(runUnalias(["nope", "ll"])).toEqual({
			ok: true,
			lines: aliasNotFound("nope"),
			exitStatus: 1,
			nextAliases: { la: "ls -a" },
		});
	});

	it("-a 全部拿掉", () => {
		expect(runUnalias(["-a"])).toEqual({ ok: true, lines: [], nextAliases: {} });
		expect(runUnalias(["-a"], undefined)).toEqual({ ok: true, lines: [], nextAliases: {} });
	});

	it("沒給名稱", () => {
		expect(runUnalias([])).toEqual({
			ok: false,
			lines: missingOperand("unalias", "要拿掉的別名名稱，例如 unalias ll；全部拿掉用 unalias -a"),
		});
	});

	it("不支援的選項", () => {
		expect(runUnalias(["-x", "ll"])).toEqual({ ok: false, lines: unknownOption("unalias", "-x") });
	});
});
