// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "@/game/chapters";
import type { TerminalDefinition } from "./types";
import { fnv1a64, fnv1a64Bytes, stableStringify, terminalScriptHash } from "./scriptHash";

const BASE: TerminalDefinition = {
	id: "ch1-t1",
	title: "冷凍艙控制台",
	roomId: "cryo",
	teaches: ["pwd"],
	fs: { home: { tech: { "wake_up.txt": "喚醒排程\n", logs: { "day_001.txt": "第一天\n" } } } },
	initialCwd: "/home/tech",
	hints: ["一", "二", "三"],
	banner: ["KEPLER-9 冷凍艙控制台"],
	objective: { title: "讀喚醒排程", check: () => false },
	env: { LOG_DIR: "/home/tech/logs" },
	processes: [{ pid: 1, user: "root", cpu: 0, mem: 0, started: "00:00", command: "init", protected: true }],
};

describe("terminalScriptHash", () => {
	it("同樣的內容算出同樣的雜湊，而且是固定長度的十六進位字串", () => {
		const copy: TerminalDefinition = JSON.parse(JSON.stringify({ ...BASE, objective: undefined }));
		const hash = terminalScriptHash(BASE);

		expect(hash).toMatch(/^[0-9a-f]{16}$/);
		expect(terminalScriptHash({ ...copy, objective: BASE.objective })).toBe(hash);
	});

	it("雜湊演算法是標準的 FNV-1a 64 位元（UTF-8），跨重整、跨瀏覽器結果一致", () => {
		// 官方測試向量：http://www.isthe.com/chongo/tech/comp/fnv/
		expect(fnv1a64("")).toBe("cbf29ce484222325");
		expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
		expect(fnv1a64("foobar")).toBe("85944171f73967e8");
	});

	it("中文走 UTF-8 位元組：「技」是 E6 8A 80 三個位元組", () => {
		expect(fnv1a64("技")).toBe(fnv1a64Bytes([0xe6, 0x8a, 0x80]));
		expect(fnv1a64("技")).not.toBe(fnv1a64Bytes([0x80, 0x62]));
	});

	it("內容序列化成 key 排序過的 JSON 再雜湊，undefined 的欄位略過", () => {
		expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined, e: "x" }] })).toBe('{"a":[{"d":2,"e":"x"}],"b":1}');
	});

	it("物件 key 的順序不影響結果", () => {
		const reordered: TerminalDefinition = {
			...BASE,
			fs: { home: { tech: { logs: { "day_001.txt": "第一天\n" }, "wake_up.txt": "喚醒排程\n" } } },
			env: { LOG_DIR: "/home/tech/logs" },
		};

		expect(terminalScriptHash(reordered)).toBe(terminalScriptHash(BASE));
	});

	it.each([
		["檔案內容", { fs: { home: { tech: { "wake_up.txt": "喚醒排程（潤稿）\n" } } } }],
		["banner", { banner: ["KEPLER-9 冷凍艙控制台 v2"] }],
		["初始工作目錄", { initialCwd: "/home/tech/logs" }],
		["環境變數", { env: { LOG_DIR: "/var/log" } }],
		["程序清單", { processes: [] }],
	] as const)("%s改了雜湊就不同", (_label, patch) => {
		expect(terminalScriptHash({ ...BASE, ...patch } as TerminalDefinition)).not.toBe(terminalScriptHash(BASE));
	});

	it("hint、NOVA 台詞、目標說明與教的指令改了不影響雜湊（這些每次都從最新劇本讀）", () => {
		const edited: TerminalDefinition = {
			...BASE,
			title: "冷凍艙主控台",
			hints: ["新的一", "新的二", "新的三"],
			teaches: ["pwd", "ls"],
			nova: { onOpen: ["新台詞"] },
			objective: { title: "改過的目標", description: "說明", check: () => true },
		};

		expect(terminalScriptHash(edited)).toBe(terminalScriptHash(BASE));
	});

	it("沒寫的選填欄位跟明寫 undefined 一樣", () => {
		const withoutOptional: TerminalDefinition = { ...BASE };
		delete withoutOptional.env;
		const explicitUndefined: TerminalDefinition = { ...BASE, env: undefined };

		expect(terminalScriptHash(explicitUndefined)).toBe(terminalScriptHash(withoutOptional));
	});

	it("全部劇本的終端機雜湊互不相同", () => {
		const hashes = CHAPTERS.flatMap((chapter) => chapter.terminals.map((terminal) => terminalScriptHash(terminal)));

		expect(new Set(hashes).size).toBe(hashes.length);
	});
});
