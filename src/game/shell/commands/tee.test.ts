// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, teeNeedsPipe, unknownOption } from "../messages";
import type { CommandContext } from "../types";
import { teeCommand } from "./tee";
import { createContext } from "./testFixtures";

const LISTING = ["pod_06/", "wake_up.txt"];

function runTee(args: string[], overrides: Partial<CommandContext> = {}) {
	const context = createContext({ stdin: LISTING, ...overrides });
	return { result: teeCommand.run(args, context), context };
}

describe("tee", () => {
	it("指令名稱是 tee", () => {
		expect(teeCommand.name).toBe("tee");
	});

	it("管線輸入照樣印出，同時寫進檔案", () => {
		const { result, context } = runTee(["list.txt"]);

		expect(result).toEqual({ ok: true, lines: LISTING });
		expect(context.fs.readFile(context.cwd, "list.txt")).toBe("pod_06/\nwake_up.txt\n");
	});

	it("一次寫進好幾個檔案，路徑照目前目錄解析", () => {
		const { result, context } = runTee(["a.txt", "/deck1/systems/b.txt"]);

		expect(result.ok).toBe(true);
		expect(context.fs.readFile(context.cwd, "a.txt")).toBe("pod_06/\nwake_up.txt\n");
		expect(context.fs.readFile("/", "/deck1/systems/b.txt")).toBe("pod_06/\nwake_up.txt\n");
	});

	it("預設覆寫，-a 接在檔案結尾", () => {
		const { context } = runTee(["log.txt"]);
		teeCommand.run(["log.txt"], { ...context, stdin: ["first"] });
		teeCommand.run(["-a", "log.txt"], { ...context, stdin: ["second"] });

		expect(context.fs.readFile(context.cwd, "log.txt")).toBe("first\nsecond\n");
	});

	it("不給檔名就只是原樣印出", () => {
		expect(runTee([]).result).toEqual({ ok: true, lines: LISTING });
	});

	it("沒有輸入時建立空檔、不印東西", () => {
		const { result, context } = runTee(["empty.txt"], { stdin: [] });

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "empty.txt")).toBe("");
	});

	it("有檔案寫不到算錯誤，但畫面照樣印出內容，其他檔案照寫", () => {
		const { result, context } = runTee(["nope/x.txt", "ok.txt"]);

		expect(result).toEqual({ ok: false, lines: [...fsError("ENOENT", "nope/x.txt"), ...LISTING] });
		expect(context.fs.readFile(context.cwd, "ok.txt")).toBe("pod_06/\nwake_up.txt\n");
	});

	it("目標是目錄", () => {
		expect(runTee(["pod_06"]).result).toEqual({ ok: false, lines: [...fsError("EISDIR", "pod_06"), ...LISTING] });
	});

	it("不在管線裡", () => {
		expect(runTee(["list.txt"], { stdin: null }).result).toEqual({ ok: false, lines: teeNeedsPipe() });
	});

	it("不支援的選項", () => {
		expect(runTee(["-i", "list.txt"]).result).toEqual({ ok: false, lines: unknownOption("tee", "-i") });
	});
});
