// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { isTerminalSessionRecord } from "./sessionRecord";
import type { TerminalSessionRecord } from "./types";

/** 用真的 Shell 做一筆合法的 session，跟遊戲寫進存檔的格式一致。 */
function createValidRecord(): TerminalSessionRecord {
	const shell = new Shell({
		fs: VirtualFileSystem.fromSnapshot({ home: { tech: { "note.txt": "hello\n", logs: { "a.log": "x\n" } } } }),
		terminalId: "ch1-t1",
		hints: ["一", "二", "三"],
		learnedCommands: ["pwd", "ls"],
		processes: [{ pid: 1, user: "root", cpu: 0.1, mem: 0.2, started: "2031-03-10T00:00:00Z", command: "init", protected: true }],
	});
	shell.execute("cd logs");
	return {
		shell: shell.toState(),
		transcript: [
			{ kind: "system", id: "banner-ch1-t1", lines: ["歡迎"] },
			{ kind: "command", id: "entry-1", prompt: "crew@kepler9:~$", input: "cd logs", lines: [], isError: false },
			{ kind: "dialogue", id: "nova-open-ch1-t1-0", speaker: "NOVA", text: "你醒了。" },
		],
		errorCount: 2,
	};
}

/** 深拷貝一份再讓測試改壞，避免互相影響。 */
function cloneRecord(): Record<string, unknown> {
	return JSON.parse(JSON.stringify(createValidRecord()));
}

describe("isTerminalSessionRecord", () => {
	it("遊戲自己寫出的 session 是合法的", () => {
		expect(isTerminalSessionRecord(cloneRecord())).toBe(true);
	});

	it("舊存檔沒有 env、processes、errorCount 也算合法", () => {
		const record = cloneRecord();
		const shell = record.shell as Record<string, unknown>;
		delete shell.env;
		delete shell.processes;
		delete record.errorCount;

		expect(isTerminalSessionRecord(record)).toBe(true);
	});

	it("不是物件就不合法", () => {
		expect(isTerminalSessionRecord(null)).toBe(false);
		expect(isTerminalSessionRecord("ch1-t1")).toBe(false);
		expect(isTerminalSessionRecord([])).toBe(false);
	});

	it("shell.fs 缺 root 不合法", () => {
		const record = cloneRecord();
		const fs = (record.shell as Record<string, unknown>).fs as Record<string, unknown>;
		delete fs.root;

		expect(isTerminalSessionRecord(record)).toBe(false);
	});

	it("檔案系統深處的檔案缺 content 不合法", () => {
		const record = cloneRecord();
		interface LooseDir {
			children: Record<string, LooseDir & { content?: string }>;
		}
		const root = ((record.shell as Record<string, unknown>).fs as { root: LooseDir }).root;
		delete root.children.home.children.tech.children["note.txt"].content;

		expect(isTerminalSessionRecord(record)).toBe(false);
	});

	it("cwd 或歷史的型別不對不合法", () => {
		const badCwd = cloneRecord();
		(badCwd.shell as Record<string, unknown>).cwd = 42;
		const badHistory = cloneRecord();
		(badHistory.shell as Record<string, unknown>).history = "ls";

		expect(isTerminalSessionRecord(badCwd)).toBe(false);
		expect(isTerminalSessionRecord(badHistory)).toBe(false);
	});

	it("輸出紀錄不是陣列，或混進不認得的區塊，不合法", () => {
		const notArray = cloneRecord();
		notArray.transcript = { kind: "system" };
		const unknownKind = cloneRecord();
		(unknownKind.transcript as unknown[]).push({ kind: "video", id: "x" });

		expect(isTerminalSessionRecord(notArray)).toBe(false);
		expect(isTerminalSessionRecord(unknownKind)).toBe(false);
	});

	it("errorCount 不是數字不合法", () => {
		const record = cloneRecord();
		record.errorCount = "3";

		expect(isTerminalSessionRecord(record)).toBe(false);
	});

	it("劇本雜湊（v3）是字串才合法，沒有也合法", () => {
		const record = cloneRecord();
		record.scriptHash = "0123456789abcdef";
		expect(isTerminalSessionRecord(record)).toBe(true);
		record.scriptHash = 42;
		expect(isTerminalSessionRecord(record)).toBe(false);
	});

	it("程序清單缺欄位不合法", () => {
		const record = cloneRecord();
		(record.shell as Record<string, unknown>).processes = [{ pid: 1 }];

		expect(isTerminalSessionRecord(record)).toBe(false);
	});
});
