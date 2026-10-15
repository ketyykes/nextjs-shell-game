// @vitest-environment node
import { describe, expect, it } from "vitest";
import { missingOperand, unknownOption, xargsCannotRun, xargsInvalidCount, xargsNeedsPipe } from "../messages";
import type { CommandResult } from "../types";
import { xargsCommand } from "./xargs";
import { createContext } from "./testFixtures";

interface Call {
	name: string;
	args: string[];
	stdin: string[] | null;
}

/** 假的子指令執行：記下每次呼叫，預設回傳「名稱 參數」一行。 */
function createRunner(respond?: (name: string, args: string[]) => CommandResult) {
	const calls: Call[] = [];
	const runCommand = (name: string, args: string[], stdin: string[] | null): CommandResult => {
		calls.push({ name, args, stdin });
		if (respond !== undefined) {
			return respond(name, args);
		}
		return { ok: true, lines: [[name, ...args].join(" ")] };
	};
	return { calls, runCommand };
}

function runXargs(args: string[], stdin: string[] | null, respond?: (name: string, args: string[]) => CommandResult) {
	const runner = createRunner(respond);
	const result = xargsCommand.run(args, createContext({ stdin, runCommand: runner.runCommand }));
	return { result, calls: runner.calls };
}

describe("xargs 把管線輸入接成參數", () => {
	it("指令名稱是 xargs", () => {
		expect(xargsCommand.name).toBe("xargs");
	});

	it("沒給指令時用 echo，空白與換行切成項目，一次全部接上去", () => {
		const { result, calls } = runXargs([], ["a b", "  c  ", ""]);

		expect(calls).toEqual([{ name: "echo", args: ["a", "b", "c"], stdin: null }]);
		expect(result).toEqual({ ok: true, lines: ["echo a b c"] });
	});

	it("指令與它自己的參數放在前面，項目接在後面", () => {
		const { calls } = runXargs(["rm", "-f"], ["a.tmp", "b.tmp"]);

		expect(calls).toEqual([{ name: "rm", args: ["-f", "a.tmp", "b.tmp"], stdin: null }]);
	});

	it("指令後面的選項是那個指令的，不是 xargs 的", () => {
		const { calls } = runXargs(["grep", "-n", "ERROR"], ["a.log"]);

		expect(calls[0]).toMatchObject({ name: "grep", args: ["-n", "ERROR", "a.log"] });
	});

	it("-n N 每 N 個項目執行一次，值可以黏在後面", () => {
		const spaced = runXargs(["-n", "2", "touch"], ["a b c"]);
		const attached = runXargs(["-n1", "touch"], ["a b"]);

		expect(spaced.calls.map((call) => call.args)).toEqual([["a", "b"], ["c"]]);
		expect(attached.calls.map((call) => call.args)).toEqual([["a"], ["b"]]);
		expect(spaced.result.lines).toEqual(["touch a b", "touch c"]);
	});

	it("-I 代換字串：每一行執行一次，參數裡每個代換字串都換成那一行（前後空白去掉）", () => {
		const { calls } = runXargs(["-I", "{}", "cp", "{}", "backup/{}.bak"], ["core.cfg", "  my notes.txt  "]);

		expect(calls.map((call) => call.args)).toEqual([
			["core.cfg", "backup/core.cfg.bak"],
			["my notes.txt", "backup/my notes.txt.bak"],
		]);
	});

	it("-I 的值可以黏在後面，空行略過", () => {
		const { calls } = runXargs(["-IX", "echo", "[X]"], ["a", "", "b"]);

		expect(calls.map((call) => call.args)).toEqual([["[a]"], ["[b]"]]);
	});

	it("沒有任何項目時不執行（GNU 的 -r），-r 也接受", () => {
		expect(runXargs(["rm"], ["", "   "])).toEqual({ result: { ok: true, lines: [] }, calls: [] });
		expect(runXargs(["-r", "rm"], []).calls).toEqual([]);
	});
});

describe("xargs 的結束碼", () => {
	it("有一次失敗：其餘照跑，整個算錯誤，結束碼 123", () => {
		const { result, calls } = runXargs(["-n", "1", "cat"], ["a b c"], (_name, args) => {
			if (args[0] === "b") {
				return { ok: false, lines: ["找不到 b"] };
			}
			return { ok: true, lines: [`內容 ${args[0]}`] };
		});

		expect(calls).toHaveLength(3);
		expect(result).toEqual({ ok: false, lines: ["內容 a", "找不到 b", "內容 c"], exitStatus: 123 });
	});

	it("不算錯誤的失敗（grep 沒符合）：不算錯誤，但結束碼照 GNU 是 123", () => {
		const { result } = runXargs(["grep", "x"], ["a"], () => ({ ok: true, lines: [], exitStatus: 1 }));

		expect(result).toEqual({ ok: true, lines: [], exitStatus: 123 });
	});

	it.each([127, 126])("子指令回 %i（找不到或不能執行）時馬上停下", (status) => {
		const { result, calls } = runXargs(["-n", "1", "nope"], ["a b"], () => ({
			ok: false,
			lines: ["不能執行"],
			exitStatus: status,
		}));

		expect(calls).toHaveLength(1);
		expect(result).toEqual({ ok: false, lines: ["不能執行"], exitStatus: status });
	});
});

describe("xargs 的錯誤", () => {
	it("不在管線裡", () => {
		expect(runXargs(["rm"], null).result).toEqual({ ok: false, lines: xargsNeedsPipe() });
	});

	it("-n 不是正整數", () => {
		expect(runXargs(["-n", "0", "rm"], ["a"]).result).toEqual({ ok: false, lines: xargsInvalidCount("0") });
		expect(runXargs(["-n", "abc", "rm"], ["a"]).result).toEqual({ ok: false, lines: xargsInvalidCount("abc") });
	});

	it("-n、-I 後面沒有值", () => {
		expect(runXargs(["-n"], ["a"]).result).toEqual({
			ok: false,
			lines: missingOperand("xargs", "在 -n 後面接每次要接幾個項目，例如 xargs -n 1 touch"),
		});
		expect(runXargs(["-I"], ["a"]).result).toEqual({
			ok: false,
			lines: missingOperand("xargs", "在 -I 後面接代換字串，例如 xargs -I {} cp {} backup/"),
		});
	});

	it("不支援的選項", () => {
		expect(runXargs(["-p", "rm"], ["a"]).result).toEqual({ ok: false, lines: unknownOption("xargs", "-p") });
		expect(runXargs(["--max-args=1", "rm"], ["a"]).result).toEqual({
			ok: false,
			lines: unknownOption("xargs", "--max-args=1"),
		});
	});

	it("context 沒有子指令執行能力時說明沒辦法執行", () => {
		const result = xargsCommand.run(["rm"], createContext({ stdin: ["a"] }));

		expect(result).toEqual({ ok: false, lines: xargsCannotRun() });
	});
});
