// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aliasEmptyValue, aliasInvalidName, aliasNotFound, aliasUnsupportedValue, parseError, unknownOption } from "../messages";
import { aliasCommand, formatAlias } from "./alias";
import { createContext } from "./testFixtures";

function runAlias(args: string[], aliases?: Record<string, string>) {
	return aliasCommand.run(args, createContext({ aliases }));
}

describe("alias 列出與查詢", () => {
	it("指令名稱是 alias", () => {
		expect(aliasCommand.name).toBe("alias");
	});

	it("沒有別名時什麼都不印", () => {
		expect(runAlias([])).toEqual({ ok: true, lines: [] });
		expect(runAlias([], undefined)).toEqual({ ok: true, lines: [] });
	});

	it("不加參數照名稱排序，用 alias 名稱='內容' 的格式列出全部；-p 一樣", () => {
		const aliases = { ll: "ls -l", la: "ls -a" };
		const expected = ["alias la='ls -a'", "alias ll='ls -l'"];

		expect(runAlias([], aliases)).toEqual({ ok: true, lines: expected });
		expect(runAlias(["-p"], aliases)).toEqual({ ok: true, lines: expected });
	});

	it("內容裡的單引號照 bash 寫成 '\\''", () => {
		expect(formatAlias("say", "echo it's")).toBe("alias say='echo it'\\''s'");
	});

	it("alias 名稱 印那一條", () => {
		expect(runAlias(["ll"], { ll: "ls -l", la: "ls -a" })).toEqual({ ok: true, lines: ["alias ll='ls -l'"] });
	});

	it("查不到的別名說明一下，不算錯誤，結束碼 1", () => {
		expect(runAlias(["nope"], { ll: "ls -l" })).toEqual({ ok: true, lines: aliasNotFound("nope"), exitStatus: 1 });
	});
});

describe("alias 定義", () => {
	it("名稱=內容 定義一個別名，不印東西，回傳整份新的別名", () => {
		expect(runAlias(["ll=ls -l"], { la: "ls -a" })).toEqual({
			ok: true,
			lines: [],
			nextAliases: { la: "ls -a", ll: "ls -l" },
		});
	});

	it("同名的蓋掉舊的，一次可以定義好幾個", () => {
		expect(runAlias(["ll=ls -la", "c=clear"], { ll: "ls -l" }).nextAliases).toEqual({ ll: "ls -la", c: "clear" });
	});

	it("內容可以有 | 與等號", () => {
		expect(runAlias(["errs=grep -c ERROR | head -n 1", "e=echo a=b"]).nextAliases).toEqual({
			errs: "grep -c ERROR | head -n 1",
			e: "echo a=b",
		});
	});

	it("定義與查詢可以混著寫", () => {
		expect(runAlias(["ll=ls -l", "la"], { la: "ls -a" })).toEqual({
			ok: true,
			lines: ["alias la='ls -a'"],
			nextAliases: { la: "ls -a", ll: "ls -l" },
		});
	});

	it("名稱不合法算錯誤，合法的照樣定義", () => {
		expect(runAlias(["a b=ls", "ok=pwd"])).toEqual({
			ok: false,
			lines: aliasInvalidName("a b"),
			nextAliases: { ok: "pwd" },
		});
		expect(runAlias(["=ls"]).lines).toEqual(aliasInvalidName(""));
		expect(runAlias(["a/b=ls"]).lines).toEqual(aliasInvalidName("a/b"));
	});

	it("等號兩邊有空白（alias ll = 'ls -l'）時提醒等號兩邊不能有空白", () => {
		const result = runAlias(["ll", "=", "ls -l"]);

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual([...aliasNotFound("ll"), ...aliasInvalidName(""), ...aliasNotFound("ls -l")]);
		expect(aliasInvalidName("").join("\n")).toContain("等號兩邊不能有空白");
	});

	it("內容是空的：要拿掉別名請用 unalias", () => {
		expect(runAlias(["ll="])).toEqual({ ok: false, lines: aliasEmptyValue("ll") });
	});

	it("內容不是單純的指令或管線", () => {
		expect(runAlias(["go=cd logs; ls"])).toEqual({ ok: false, lines: aliasUnsupportedValue("go") });
		expect(runAlias(["save=ls > out.txt"])).toEqual({ ok: false, lines: aliasUnsupportedValue("save") });
	});

	it("內容有語法錯誤時說明是哪裡錯", () => {
		expect(runAlias(["x=echo 'hi"])).toEqual({
			ok: false,
			lines: parseError({ code: "UNCLOSED_QUOTE", detail: "'" }),
		});
	});

	it("不支援的選項", () => {
		expect(runAlias(["-x"])).toEqual({ ok: false, lines: unknownOption("alias", "-x") });
	});
});
