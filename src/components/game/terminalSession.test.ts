// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { TerminalDefinition } from "@/game/story";
import type { TerminalSessionRecord } from "@/game/store/types";
import { createDialogueEntries, createTerminalSession, toCommandName } from "./terminalSession";

const DEFINITION: TerminalDefinition = {
	id: "ch1-t1",
	title: "冷凍艙控制台",
	roomId: "cryo",
	teaches: ["pwd"],
	fs: { home: { tech: { "wake_up.txt": "喚醒排程\n", pod_06: { "status.txt": "ok\n" } } } },
	hints: ["一", "二", "三"],
	banner: ["KEPLER-9 冷凍艙控制台"],
	objective: { title: "讀喚醒排程", check: () => false },
};

/** 玩過幾步的合法存檔：cwd 換到 pod_06，歷史有兩筆，檔案系統多一個檔案。 */
function createPlayedRecord(): TerminalSessionRecord {
	const shell = new Shell({
		fs: VirtualFileSystem.fromSnapshot(DEFINITION.fs),
		terminalId: DEFINITION.id,
		hints: DEFINITION.hints,
		learnedCommands: ["pwd"],
	});
	shell.execute("cd pod_06");
	shell.execute("echo hi > mine.txt");
	return {
		shell: shell.toState(),
		transcript: [{ kind: "system", id: "banner-ch1-t1", lines: ["KEPLER-9 冷凍艙控制台"] }],
		errorCount: 4,
	};
}

/** 存檔 JSON 化再改壞，模擬讀回來的資料。 */
function corrupt(mutate: (record: Record<string, unknown>) => void): unknown {
	const record = JSON.parse(JSON.stringify(createPlayedRecord())) as Record<string, unknown>;
	mutate(record);
	return record;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createTerminalSession", () => {
	it("沒有存檔：用劇本初始快照建 Shell，回傳第一筆 session（帶 banner）", () => {
		const { shell, freshRecord } = createTerminalSession(DEFINITION, ["pwd", "ls"], undefined);

		expect(shell.cwd).toBe("/home/tech");
		expect(shell.learnedCommands).toEqual(["pwd", "ls"]);
		expect(freshRecord).not.toBeNull();
		expect(freshRecord?.transcript).toEqual([{ kind: "system", id: "banner-ch1-t1", lines: ["KEPLER-9 冷凍艙控制台"] }]);
		expect(freshRecord?.shell).toEqual(shell.toState());
		expect(freshRecord).not.toHaveProperty("errorCount");
	});

	it("合法存檔：從存檔還原 cwd、歷史與改過的檔案，不需要另存", () => {
		const { shell, freshRecord } = createTerminalSession(DEFINITION, ["pwd", "cat"], createPlayedRecord());

		expect(freshRecord).toBeNull();
		expect(shell.cwd).toBe("/home/tech/pod_06");
		expect(shell.historyEntries).toEqual(["cd pod_06", "echo hi > mine.txt"]);
		expect(shell.fs.exists("/home/tech/pod_06", "mine.txt")).toBe(true);
		expect(shell.learnedCommands).toContain("cat");
	});

	it("存檔的檔案系統缺欄位：警告後丟掉，用劇本初始狀態重建並把計數歸零", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = corrupt((record) => {
			delete ((record.shell as Record<string, unknown>).fs as Record<string, unknown>).root;
		});

		const { shell, freshRecord } = createTerminalSession(DEFINITION, ["pwd"], broken);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain("ch1-t1");
		expect(shell.cwd).toBe("/home/tech");
		expect(shell.historyEntries).toEqual([]);
		expect(freshRecord?.transcript).toEqual([{ kind: "system", id: "banner-ch1-t1", lines: ["KEPLER-9 冷凍艙控制台"] }]);
		expect(freshRecord?.errorCount).toBe(0);
	});

	it("檔案系統序列化版本不支援（還原時才丟例外）：一樣丟掉重建", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = corrupt((record) => {
			((record.shell as Record<string, unknown>).fs as Record<string, unknown>).version = 99;
		});

		const { shell, freshRecord } = createTerminalSession(DEFINITION, ["pwd"], broken);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(shell.cwd).toBe("/home/tech");
		expect(freshRecord?.errorCount).toBe(0);
	});

	it("輸出紀錄壞掉：整台丟掉重建，不留下會讓畫面炸掉的紀錄", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = corrupt((record) => {
			record.transcript = "not-an-array";
		});

		const { freshRecord } = createTerminalSession(DEFINITION, ["pwd"], broken);

		expect(Array.isArray(freshRecord?.transcript)).toBe(true);
	});
});

describe("toCommandName", () => {
	it("帶參數的已學指令只取指令名", () => {
		expect(toCommandName("ls -a")).toBe("ls");
		expect(toCommandName("cd ~")).toBe("cd");
		expect(toCommandName("pwd")).toBe("pwd");
	});
});

describe("createDialogueEntries", () => {
	it("每句一個 NOVA 對話區塊，id 是前綴加序號", () => {
		expect(createDialogueEntries("nova-open-ch1-t1", ["甲", "乙"])).toEqual([
			{ kind: "dialogue", id: "nova-open-ch1-t1-0", speaker: "NOVA", text: "甲" },
			{ kind: "dialogue", id: "nova-open-ch1-t1-1", speaker: "NOVA", text: "乙" },
		]);
	});
});
