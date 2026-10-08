// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cdTooManyArguments, fsError } from "../messages";
import { cdCommand } from "./cd";
import { createContext } from "./testFixtures";

describe("cd", () => {
	it("指令名稱是 cd", () => {
		expect(cdCommand.name).toBe("cd");
	});

	it("無參數時回到家目錄", () => {
		const result = cdCommand.run([], createContext({ cwd: "/deck1/systems" }));

		expect(result).toEqual({ ok: true, lines: [], nextCwd: "/home/tech" });
	});

	it("無參數時使用 context.home 而不是寫死的路徑", () => {
		const result = cdCommand.run([], createContext({ cwd: "/", home: "/home/abin" }));

		expect(result.nextCwd).toBe("/home/abin");
	});

	it("cd .. 退回上一層", () => {
		const result = cdCommand.run([".."], createContext());

		expect(result).toEqual({ ok: true, lines: [], nextCwd: "/home" });
	});

	it("在根目錄 cd .. 仍停在根目錄", () => {
		const result = cdCommand.run([".."], createContext({ cwd: "/" }));

		expect(result.nextCwd).toBe("/");
	});

	it("cd ~ 回到家目錄", () => {
		const result = cdCommand.run(["~"], createContext({ cwd: "/deck1" }));

		expect(result.nextCwd).toBe("/home/tech");
	});

	it("cd ~/xxx 走到家目錄底下的子目錄", () => {
		const result = cdCommand.run(["~/pod_06"], createContext({ cwd: "/deck1" }));

		expect(result.nextCwd).toBe("/home/tech/pod_06");
	});

	it("用絕對路徑一次走到 B3", () => {
		const result = cdCommand.run(["/deck1/systems/power/breakers/B3"], createContext());

		expect(result).toEqual({ ok: true, lines: [], nextCwd: "/deck1/systems/power/breakers/B3" });
	});

	it("用相對路徑走進子目錄", () => {
		const result = cdCommand.run(["pod_06"], createContext());

		expect(result.nextCwd).toBe("/home/tech/pod_06");
	});

	it("nextCwd 是正規化後的絕對路徑", () => {
		const result = cdCommand.run(["./pod_01/../../abin/"], createContext());

		expect(result).toEqual({ ok: true, lines: [], nextCwd: "/home/abin" });
	});

	it("目標是檔案時回報 ENOTDIR 訊息，ok 為 false", () => {
		const result = cdCommand.run(["wake_up.txt"], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(fsError("ENOTDIR", "wake_up.txt"));
		expect(result.nextCwd).toBeUndefined();
	});

	it("目標不存在時回報 ENOENT 訊息，ok 為 false", () => {
		const result = cdCommand.run(["medbay"], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(fsError("ENOENT", "medbay"));
		expect(result.nextCwd).toBeUndefined();
	});

	it("超過一個參數時跟 bash 一樣報「參數太多」，不換目錄（M13-1）", () => {
		const result = cdCommand.run(["pod_01", "pod_02"], createContext());

		expect(result).toEqual({ ok: false, lines: cdTooManyArguments() });
	});

	it("參數太多時就算第一個不存在也只報參數太多（bash 先檢查參數個數）", () => {
		const result = cdCommand.run(["nope", "pod_02"], createContext());

		expect(result.lines).toEqual(cdTooManyArguments());
	});
});
