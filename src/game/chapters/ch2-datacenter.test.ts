// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import { deckTerminals } from "@/game/story/decks";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import { chapterTwoDataCenter } from "./ch2-datacenter";
import type { TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 地圖 markers
// ---------------------------------------------------------------------------

interface MarkerProperty {
	name: string;
	value: unknown;
}

interface MarkerObject {
	type: string;
	properties?: MarkerProperty[];
}

interface MapLayer {
	name: string;
	objects?: MarkerObject[];
}

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck2.json");
const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8")) as { layers: MapLayer[] };

/** 地圖上的終端機 markers，整理成 { terminalId, title, roomId }。 */
function readTerminalMarkers(): { terminalId: string; title: string; roomId: string }[] {
	const markersLayer = map.layers.find((layer) => layer.name === "markers");
	const objects = markersLayer?.objects ?? [];

	return objects
		.filter((object) => object.type === "terminal")
		.map((object) => {
			const properties = new Map((object.properties ?? []).map((property) => [property.name, property.value]));
			return {
				terminalId: String(properties.get("terminalId")),
				title: String(properties.get("title")),
				roomId: String(properties.get("roomId")),
			};
		});
}

// ---------------------------------------------------------------------------
// 跑正解
// ---------------------------------------------------------------------------

/** 依 id 取本章的終端機，找不到直接讓測試失敗。 */
function terminalById(id: string): TerminalDefinition {
	const terminal = chapterTwoDataCenter.terminals.find((item) => item.id === id);
	if (terminal === undefined) {
		throw new Error(`第二章沒有 ${id}`);
	}
	return terminal;
}

/** 用劇本的 FS、起始目錄、環境變數與程序清單開一個真的 shell。 */
function openTerminal(terminal: TerminalDefinition): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(terminal.fs),
		terminalId: terminal.id,
		hints: terminal.hints,
		learnedCommands: [],
		cwd: terminal.initialCwd,
		env: terminal.env,
		processes: terminal.processes,
	});
}

/** 執行一行輸入並判定是否過關；執行失敗直接讓測試失敗，正解不該打錯。 */
function runStep(shell: Shell, terminal: TerminalDefinition, input: string): { solved: boolean; lines: string[] } {
	const execution = shell.execute(input);
	expect(execution.isError, `「${input}」不該失敗：${execution.lines.join(" / ")}`).toBe(false);
	const context = createObjectiveContext(terminal.id, execution, shell.fs, shell.home);
	return { solved: evaluateObjective(terminal, context), lines: execution.lines };
}

/** 開一台終端機、照順序跑完 `inputs`，回傳最後一步的結果。 */
function runSteps(id: string, inputs: string[]): { solved: boolean; lines: string[] } {
	const terminal = terminalById(id);
	const shell = openTerminal(terminal);
	let last = { solved: false, lines: [] as string[] };
	for (const input of inputs) {
		last = runStep(shell, terminal, input);
	}
	return last;
}

/** 每台終端機的正解序列，最後一步才過關。e2e 也照這張表打字。 */
export const SOLUTIONS: Record<string, string[]> = {
	"ch2-t1": ["ls", "cat README.txt", "head access.log", "tail access.log"],
	"ch2-t2": ["ls", "cat INDEX.txt", "cd evac", "wc -l evac_*.log", "head -n 5 evac_011.log"],
	"ch2-t3": ["ls", "wc -l door_events.log", "grep lock door_events.log", "grep -n LOCK door_events.log"],
	"ch2-t4": ["cat README.txt", "ls logs", "grep ANOMALY logs/2029/q1.log", "grep -r ANOMALY logs"],
	"ch2-t5": [
		"cat README.txt",
		"ls snapshots",
		'find . -name "rollback_*"',
		"tail snapshots/2028/06/02/core/nova/rollback_2028-06-02.log",
	],
	"ch2-t6": [
		"cat lock.txt",
		'find /deck2/vault -name "*exit_key*"',
		"grep -r ACTIVE /deck2/vault",
		"cat /deck2/vault/2031/03/.pending/.exit_key_2031.txt",
	],
};

/** 正解最後一步的輸出要包含的關鍵字，確認讀到的是對的檔案。 */
const SOLUTION_OUTPUT: Record<string, string> = {
	"ch2-t1": "未登錄帳號",
	"ch2-t2": "請所有乘員留在站上",
	"ch2-t3": "LOCK  來源：NOVA",
	"ch2-t4": "—abin",
	"ch2-t5": "進度 2%",
	"ch2-t6": "K9-DC-EXIT-0006",
};

describe("第二章劇本結構", () => {
	it("通過 schema 驗證", () => {
		expect(validateChapter(chapterTwoDataCenter)).toBe(chapterTwoDataCenter);
	});

	it("章節號、甲板名與地圖設定", () => {
		expect(chapterTwoDataCenter.chapter).toBe(2);
		expect(chapterTwoDataCenter.deckName).toBe("資料中心");
		expect(chapterTwoDataCenter.map).toEqual({ deck: 2, startDark: false });
	});

	it("六台終端機的 id、title、roomId 跟 deckTerminals(2) 一致，順序 T1 到 T6", () => {
		const fromChapter = chapterTwoDataCenter.terminals.map(({ id, title, roomId }) => ({ id, title, roomId }));
		const expected = deckTerminals(2).map(({ id, title, roomId }) => ({ id, title, roomId }));
		expect(fromChapter).toEqual(expected);
	});

	it("六台終端機的 id、title、roomId 跟地圖 markers 一致", () => {
		const markers = readTerminalMarkers();
		expect(markers).toHaveLength(6);

		const fromChapter = chapterTwoDataCenter.terminals.map((terminal) => ({
			terminalId: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const byId = (a: { terminalId: string }, b: { terminalId: string }) => a.terminalId.localeCompare(b.terminalId);
		expect([...fromChapter].sort(byId)).toEqual([...markers].sort(byId));
	});

	it("每台教的指令照課程表", () => {
		const teaches = chapterTwoDataCenter.terminals.map((terminal) => terminal.teaches);
		expect(teaches).toEqual([["head", "tail"], ["wc", "*"], ["grep"], ["grep -r"], ["find"], []]);
	});

	it("T2 一開啟 NOVA 就提到 * 萬用字元，第三段提示的 evac_*.log 才不是突然冒出來", () => {
		const onOpen = terminalById("ch2-t2").nova?.onOpen?.join("\n") ?? "";
		expect(onOpen).toContain("*");
		expect(onOpen).toContain("evac_*.log");
	});

	it("T6 過關打開出口門，其餘終端機不改燈", () => {
		const exit = terminalById("ch2-t6");
		expect(exit.effect).toEqual({ kind: "openDoor", doorId: EXIT_DOOR_ID });
		for (const terminal of chapterTwoDataCenter.terminals.slice(0, 5)) {
			expect(terminal.effect?.kind, terminal.id).not.toBe("powerRestored");
			expect(terminal.effect?.kind, terminal.id).not.toBe("blackout");
		}
	});

	it("每台的起始目錄與家目錄都存在", () => {
		for (const terminal of chapterTwoDataCenter.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			expect(vfs.exists("/", "/home/tech"), terminal.id).toBe(true);
			expect(vfs.exists("/", terminal.initialCwd ?? "/home/tech"), terminal.id).toBe(true);
		}
	});

	it("每台的檔案系統不超過 40 個檔案、內容總和不超過 20 KB", () => {
		for (const terminal of chapterTwoDataCenter.terminals) {
			const files = collectSnapshotFiles(terminal.fs);
			const bytes = files.reduce((sum, content) => sum + new TextEncoder().encode(content).length, 0);
			expect(files.length, terminal.id).toBeLessThanOrEqual(40);
			expect(bytes, terminal.id).toBeLessThanOrEqual(20 * 1024);
		}
	});
});

describe("第二章正解序列", () => {
	for (const terminal of chapterTwoDataCenter.terminals) {
		it(`${terminal.id} ${terminal.title}：只有最後一步過關`, () => {
			const steps = SOLUTIONS[terminal.id];
			expect(steps, `${terminal.id} 沒有正解序列`).toBeDefined();

			const shell = openTerminal(terminal);
			const results = steps.map((input) => runStep(shell, terminal, input));
			const solvedFlags = results.map((result) => result.solved);

			expect(solvedFlags.slice(0, -1).every((solved) => !solved)).toBe(true);
			expect(solvedFlags.at(-1)).toBe(true);
			expect(results.at(-1)?.lines.join("\n")).toContain(SOLUTION_OUTPUT[terminal.id]);
		});
	}

	it("T5、T6 第三段提示寫出完整絕對路徑，照抄就能過關，先 cd 到別處也一樣", () => {
		const finalHintSteps: Record<string, string[]> = {
			"ch2-t5": [
				'find . -name "rollback_*"',
				"tail /deck2/backup/snapshots/2028/06/02/core/nova/rollback_2028-06-02.log",
			],
			"ch2-t6": [
				'find /deck2/vault -name "*exit_key*"',
				"grep -r ACTIVE /deck2/vault",
				"cat /deck2/vault/2031/03/.pending/.exit_key_2031.txt",
			],
		};
		for (const [id, steps] of Object.entries(finalHintSteps)) {
			const finalHint = terminalById(id).hints.at(-1) ?? "";
			for (const step of steps) {
				expect(finalHint, `${id} 第三段提示`).toContain(`輸入 ${step}`);
			}
			expect(runSteps(id, steps).solved, id).toBe(true);
			expect(runSteps(id, ["cd /", ...steps]).solved, `${id} 先 cd / 再照抄`).toBe(true);
		}
	});

	it("T1 的 head 看得到撤離前有 tech 的登錄，tail 除了最後一行全是 nova", () => {
		const headLines = runSteps("ch2-t1", ["head access.log"]).lines;
		expect(headLines).toHaveLength(10);
		expect(headLines.join("\n")).toContain("tech");

		const tailLines = runSteps("ch2-t1", ["tail access.log"]).lines;
		expect(tailLines).toHaveLength(10);
		expect(tailLines.slice(0, -1).every((line) => line.includes("nova"))).toBe(true);
	});

	it("T1 用 cat 把整份登錄紀錄印出來不算過關，tail -n 3 也算", () => {
		expect(runSteps("ch2-t1", ["cat access.log"]).solved).toBe(false);
		expect(runSteps("ch2-t1", ["tail -n 3 /deck2/entry/access.log"]).solved).toBe(true);
	});

	it("T2 的 wc -l 顯示只有一段日誌行數不對", () => {
		const lines = runSteps("ch2-t2", ["cd evac", "wc -l evac_*.log"]).lines;
		const counts = lines.filter((line) => line.includes("evac_")).map((line) => line.trim());
		expect(counts).toHaveLength(30);
		const odd = counts.filter((line) => !line.startsWith("3 "));
		expect(odd).toHaveLength(1);
		expect(odd[0]).toContain("evac_011.log");
	});

	it("T2 讀一般段落不算過關，用 tail 或 cat 讀那一段也算", () => {
		expect(runSteps("ch2-t2", ["head evac/evac_010.log"]).solved).toBe(false);
		expect(runSteps("ch2-t2", ["tail -n 2 evac/evac_011.log"]).solved).toBe(true);
		expect(runSteps("ch2-t2", ["cat /deck2/archive/evac/evac_011.log"]).solved).toBe(true);
	});

	it("T3 用 cat 整份讀不算過關，grep 小寫 lock 只看到手動嘗試，加 -i 才過關", () => {
		expect(runSteps("ch2-t3", ["cat door_events.log"]).solved).toBe(false);
		expect(runSteps("ch2-t3", ["grep lock door_events.log"]).solved).toBe(false);
		expect(runSteps("ch2-t3", ["grep -i lock door_events.log"]).solved).toBe(true);
	});

	it("T3 用 grep NOVA 或 grep -r 找也算過關", () => {
		expect(runSteps("ch2-t3", ["grep NOVA door_events.log"]).solved).toBe(true);
		expect(runSteps("ch2-t3", ["grep -r LOCK /deck2/logs"]).solved).toBe(true);
	});

	it("T4 的 ls 看不到阿彬的留言，grep -r 才搜得到", () => {
		const listing = runSteps("ch2-t4", ["ls logs/2030"]).lines.join("\n");
		expect(listing).not.toContain(".abin");
		expect(runSteps("ch2-t4", ["grep -ri anomaly /deck2/cooling"]).solved).toBe(true);
	});

	it("T4 管線只算行數不算過關，沒看到留言", () => {
		const result = runSteps("ch2-t4", ["grep -r ANOMALY logs | wc -l"]);
		expect(result.solved).toBe(false);
		expect(Number(result.lines.join("").trim())).toBeGreaterThan(5);
	});

	it("T5 不加引號的 find 也找得到回滾日誌，讀回滾計畫不算過關", () => {
		const found = runSteps("ch2-t5", ["find . -name rollback_*"]).lines;
		expect(found).toContain("./snapshots/2028/06/02/core/nova/rollback_2028-06-02.log");
		expect(found).toContain("./snapshots/2028/06/01/core/rollback_plan.txt");
		expect(runSteps("ch2-t5", ["cat snapshots/2028/06/01/core/rollback_plan.txt"]).solved).toBe(false);
	});

	it("T5 find -type d 列得出撤離當天的空 crew 目錄", () => {
		const dirs = runSteps("ch2-t5", ["find snapshots -type d"]).lines;
		expect(dirs).toContain("snapshots/2028/06/02/crew");
	});

	it("T6 讀撤銷的舊鑰匙不算過關，打錯路徑也不算", () => {
		expect(runSteps("ch2-t6", ["cat /deck2/vault/2028/06/exit_key_2028.txt"]).solved).toBe(false);

		const terminal = terminalById("ch2-t6");
		const shell = openTerminal(terminal);
		const failed = shell.execute("cat /deck2/vault/2031/03/.pending/.exit_key_2030.txt");
		expect(failed.isError).toBe(true);
		expect(evaluateObjective(terminal, createObjectiveContext(terminal.id, failed, shell.fs, shell.home))).toBe(false);
	});

	it("T6 find 找得到三把鑰匙，只有一把是 ACTIVE", () => {
		const found = runSteps("ch2-t6", ['find /deck2/vault -name "*exit_key*"']).lines;
		expect(found).toHaveLength(3);
		const active = runSteps("ch2-t6", ["grep -r ACTIVE /deck2/vault"]).lines;
		expect(active).toHaveLength(1);
		expect(active[0]).toContain(".exit_key_2031.txt");
	});
});

// ---------------------------------------------------------------------------
// 文字檢查
// ---------------------------------------------------------------------------

/** 遞迴走過快照，每遇到一個名稱或檔案內容就交給 `onText`，每個檔案內容另外交給 `onFile`。 */
function walkSnapshot(snapshot: FsSnapshot, onText: (text: string) => void, onFile: (content: string) => void): void {
	function visit(name: string, entry: FsSnapshotEntry): void {
		onText(name);
		if (typeof entry === "string") {
			onText(entry);
			onFile(entry);
			return;
		}
		if (entry.$type === "file") {
			onText(String(entry.content));
			onFile(String(entry.content));
			return;
		}
		if (entry.$type === "dir") {
			for (const [childName, child] of Object.entries(entry.children as FsSnapshot)) {
				visit(childName, child);
			}
			return;
		}
		for (const [childName, child] of Object.entries(entry as FsSnapshot)) {
			visit(childName, child);
		}
	}

	for (const [name, entry] of Object.entries(snapshot)) {
		visit(name, entry);
	}
}

/** 快照裡所有檔案內容與檔名。 */
function collectSnapshotTexts(snapshot: FsSnapshot): string[] {
	const texts: string[] = [];
	walkSnapshot(
		snapshot,
		(text) => texts.push(text),
		() => undefined,
	);
	return texts;
}

/** 快照裡每個檔案的內容。 */
function collectSnapshotFiles(snapshot: FsSnapshot): string[] {
	const files: string[] = [];
	walkSnapshot(
		snapshot,
		() => undefined,
		(content) => files.push(content),
	);
	return files;
}

/** 劇本裡所有玩家看得到的文字。 */
function collectChapterTexts(): string[] {
	const texts: string[] = [
		chapterTwoDataCenter.title,
		chapterTwoDataCenter.deckName,
		...(chapterTwoDataCenter.intro ?? []),
		...(chapterTwoDataCenter.outro ?? []),
		...(chapterTwoDataCenter.novaErrorLines ?? []),
	];

	for (const terminal of chapterTwoDataCenter.terminals) {
		texts.push(terminal.title, terminal.objective.title, ...terminal.hints, ...(terminal.banner ?? []));
		if (terminal.objective.description !== undefined) {
			texts.push(terminal.objective.description);
		}
		texts.push(
			...(terminal.nova?.onEnterRoom ?? []),
			...(terminal.nova?.onOpen ?? []),
			...(terminal.nova?.onSolved ?? []),
			...(terminal.nova?.onStuck ?? []),
		);
		texts.push(...collectSnapshotTexts(terminal.fs));
	}
	return texts;
}

/** 指涉性別的字詞。 */
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

describe("第二章文字", () => {
	it("所有台詞與檔案內容不指涉性別", () => {
		const offending = collectChapterTexts().filter((text) => GENDERED_PATTERN.test(text));
		expect(offending).toEqual([]);
	});

	it("每台終端機都有三段提示、banner 一到兩行", () => {
		for (const terminal of chapterTwoDataCenter.terminals) {
			expect(terminal.hints, terminal.id).toHaveLength(3);
			const bannerLength = terminal.banner?.length ?? 0;
			expect(bannerLength, terminal.id).toBeGreaterThanOrEqual(1);
			expect(bannerLength, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("每台終端機都有 NOVA 進房、開機與過關台詞", () => {
		for (const terminal of chapterTwoDataCenter.terminals) {
			expect(terminal.nova?.onEnterRoom?.length, terminal.id).toBeGreaterThan(0);
			expect(terminal.nova?.onOpen?.length, terminal.id).toBeGreaterThan(0);
			expect(terminal.nova?.onSolved?.length, terminal.id).toBeGreaterThan(0);
		}
	});

	it("每台終端機都有 NOVA 卡關台詞，一到兩句", () => {
		for (const terminal of chapterTwoDataCenter.terminals) {
			const length = terminal.nova?.onStuck?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("T3 過關時 NOVA 說「那是回滾前的我。」", () => {
		expect(terminalById("ch2-t3").nova?.onSolved).toContain("那是回滾前的我。");
	});

	it("環境反應階梯的 NOVA 台詞有三到五句", () => {
		const length = chapterTwoDataCenter.novaErrorLines?.length ?? 0;
		expect(length).toBeGreaterThanOrEqual(3);
		expect(length).toBeLessThanOrEqual(5);
	});

	it("有開場與結尾台詞，結尾提到工程艙", () => {
		expect(chapterTwoDataCenter.intro?.length).toBeGreaterThan(0);
		expect(chapterTwoDataCenter.outro?.join("")).toContain("工程艙");
	});
});
