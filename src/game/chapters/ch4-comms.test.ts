// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import { deckTerminals } from "@/game/story/decks";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { chapterFourComms } from "./ch4-comms";
import { SOLUTIONS } from "./solutions";
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

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck4.json");
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

/** 章節還沒註冊進 `index.ts`，直接在本章裡找。 */
function getTerminal(id: string): TerminalDefinition {
	const terminal = chapterFourComms.terminals.find((item) => item.id === id);
	if (terminal === undefined) {
		throw new Error(`第四章沒有 ${id}`);
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

/** 依序執行多行，回傳最後一行是否過關。 */
function runAll(terminal: TerminalDefinition, inputs: string[]): { shell: Shell; solved: boolean[] } {
	const shell = openTerminal(terminal);
	const solved = inputs.map((input) => runStep(shell, terminal, input).solved);
	return { shell, solved };
}

/** 正解最後一步之後，用這一行確認結果（輸出要含 `SOLUTION_OUTPUT`）。沒寫就看最後一步本身的輸出。 */
const SOLUTION_CHECK: Record<string, string> = {
	"ch4-t1": "cat callsign.txt",
	"ch4-t4": "cat signal.txt",
	"ch4-t6": "cat manifest.txt",
};

/** 正解的關鍵輸出，確認讀到或寫出的是對的東西。 */
const SOLUTION_OUTPUT: Record<string, string> = {
	"ch4-t1": "KEPLER-9",
	"ch4-t2": "來源：站內",
	"ch4-t3": "目標：本站",
	"ch4-t4": "別送。",
	"ch4-t5": "轉送至 /dev/null",
	"ch4-t6": "01 MAYDAY MAYDAY MAYDAY",
};

describe("第四章劇本結構", () => {
	it("通過 schema 驗證", () => {
		expect(validateChapter(chapterFourComms)).toBe(chapterFourComms);
	});

	it("章節號、甲板名與地圖設定", () => {
		expect(chapterFourComms.chapter).toBe(4);
		expect(chapterFourComms.deckName).toBe("通訊艙");
		expect(chapterFourComms.map).toEqual({ deck: 4, startDark: false });
	});

	it("六台終端機的 id、title、roomId 跟 decks.ts 一致", () => {
		const expected = deckTerminals(4).map(({ id, title, roomId }) => ({ id, title, roomId }));
		const actual = chapterFourComms.terminals.map(({ id, title, roomId }) => ({ id, title, roomId }));
		expect(actual).toEqual(expected);
	});

	it("六台終端機的 id、title、roomId 跟地圖 markers 一致", () => {
		const markers = readTerminalMarkers();
		expect(markers).toHaveLength(6);

		const fromChapter = chapterFourComms.terminals.map((terminal) => ({
			terminalId: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const byId = (a: { terminalId: string }, b: { terminalId: string }) => a.terminalId.localeCompare(b.terminalId);
		expect([...fromChapter].sort(byId)).toEqual([...markers].sort(byId));
	});

	it("T6 過關會打開出口艙門", () => {
		expect(getTerminal("ch4-t6").effect).toEqual({ kind: "openDoor", doorId: EXIT_DOOR_ID });
	});

	it("每台的起始目錄與家目錄都存在", () => {
		for (const terminal of chapterFourComms.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			expect(vfs.exists("/", "/home/tech"), terminal.id).toBe(true);
			expect(vfs.exists("/", terminal.initialCwd ?? "/home/tech"), terminal.id).toBe(true);
		}
	});

	it("每台的檔案系統不超過 40 個檔案、20 KB", () => {
		for (const terminal of chapterFourComms.terminals) {
			const contents = collectFileContents(terminal.fs);
			const bytes = contents.reduce((sum, content) => sum + new TextEncoder().encode(content).length, 0);
			expect(contents.length, terminal.id).toBeLessThanOrEqual(40);
			expect(bytes, terminal.id).toBeLessThanOrEqual(20 * 1024);
		}
	});
});

describe("第四章正解序列", () => {
	for (const terminal of chapterFourComms.terminals) {
		it(`${terminal.id} ${terminal.title}：只有最後一步過關`, () => {
			const steps = SOLUTIONS[terminal.id];
			expect(steps, `${terminal.id} 沒有正解序列`).toBeDefined();

			const shell = openTerminal(terminal);
			const results = steps.map((input) => runStep(shell, terminal, input));
			const solvedFlags = results.map((result) => result.solved);

			expect(solvedFlags.slice(0, -1).every((solved) => !solved)).toBe(true);
			expect(solvedFlags.at(-1)).toBe(true);

			const checkInput = SOLUTION_CHECK[terminal.id];
			let output = results.at(-1)?.lines.join("\n") ?? "";
			if (checkInput !== undefined) {
				output = runStep(shell, terminal, checkInput).lines.join("\n");
			}
			expect(output).toContain(SOLUTION_OUTPUT[terminal.id]);
		});
	}
});

describe("第四章錯誤路徑與其他解法", () => {
	it("T1 只印出呼號或 touch 空檔都不算登錄", () => {
		const { solved } = runAll(getTerminal("ch4-t1"), ["echo KEPLER-9", "touch callsign.txt"]);
		expect(solved).toEqual([false, false]);
	});

	it("T1 用 >> 寫進呼號也算登錄", () => {
		const { solved } = runAll(getTerminal("ch4-t1"), ["echo KEPLER-9 >> callsign.txt"]);
		expect(solved).toEqual([true]);
	});

	it("T2 不用管線、只 grep 不算過關", () => {
		const { solved } = runAll(getTerminal("ch4-t2"), ["grep 站內 ping.log", "cat ping.log"]);
		expect(solved).toEqual([false, false]);
	});

	it("T2 用 ls 數中繼站有幾座，數得出 8", () => {
		const terminal = getTerminal("ch4-t2");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "ls stations | wc -l").lines).toEqual(["8"]);
	});

	it("T2 先 tail 最後一輪再 grep 也算過關", () => {
		const { solved } = runAll(getTerminal("ch4-t2"), ["tail -n 8 ping.log | grep 回應"]);
		expect(solved).toEqual([true]);
	});

	it("T3 不排序直接看最後一行不是最新的一筆", () => {
		const { solved } = runAll(getTerminal("ch4-t3"), ["tail -n 1 pointing.log", "cat pointing.log"]);
		expect(solved).toEqual([false, false]);
	});

	it("T3 只用 sort 排好、或 sort -r 再取第一行也算過關", () => {
		expect(runAll(getTerminal("ch4-t3"), ["sort pointing.log"]).solved).toEqual([true]);
		expect(runAll(getTerminal("ch4-t3"), ["sort -r pointing.log | head -n 1"]).solved).toEqual([true]);
	});

	it("T3 sort -r 的最後一行是最舊的，不算", () => {
		expect(runAll(getTerminal("ch4-t3"), ["sort -r pointing.log"]).solved).toEqual([false]);
	});

	it("T4 沒排序的 uniq、沒去重的 sort、帶次數的 uniq -c 存檔都不算", () => {
		const { solved } = runAll(getTerminal("ch4-t4"), [
			"cat fragments/* > signal.txt",
			"cat fragments/* | uniq > signal.txt",
			"sort fragments/* > signal.txt",
			"sort fragments/* | uniq -c > signal.txt",
		]);
		expect(solved).toEqual([false, false, false, false]);
	});

	it("T4 用 sort -u 或 cat | sort | uniq 也算過關", () => {
		expect(runAll(getTerminal("ch4-t4"), ["sort -u fragments/* > signal.txt"]).solved).toEqual([true]);
		expect(runAll(getTerminal("ch4-t4"), ["cat fragments/* | sort | uniq > signal.txt"]).solved).toEqual([true]);
	});

	it("T4 用 grep -v 把「別送。」濾掉也算過關", () => {
		const { solved } = runAll(getTerminal("ch4-t4"), ["sort -u fragments/* | grep -v 別送 > signal.txt"]);
		expect(solved).toEqual([true]);
	});

	it("T4 碎片裡混進一行「別送。」，只出現一次", () => {
		const terminal = getTerminal("ch4-t4");
		const shell = openTerminal(terminal);
		const output = runStep(shell, terminal, "sort fragments/* | uniq -c").lines;
		expect(output).toContain("      1 別送。");
	});

	it("T5 送出前先讀傳送紀錄不算過關", () => {
		const { solved } = runAll(getTerminal("ch4-t5"), ["cat tx.log", "tail -n 3 tx.log"]);
		expect(solved).toEqual([false, false]);
	});

	it("T5 用 echo >> 送出、再 tail 傳送紀錄也算過關", () => {
		const { solved } = runAll(getTerminal("ch4-t5"), ["echo \"MAYDAY KEPLER-9\" >> outbox.txt", "tail -n 3 tx.log"]);
		expect(solved).toEqual([false, true]);
	});

	it("T5 用 >> 送出會保留阿彬留在佇列裡的訊息", () => {
		const terminal = getTerminal("ch4-t5");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "cat signal.txt >> outbox.txt");
		const output = runStep(shell, terminal, "cat outbox.txt").lines.join("\n");
		expect(output).toContain("abin");
		expect(output).toContain("MAYDAY");
	});

	it("T5 傳送紀錄寫明轉送規則來自 nova-core", () => {
		const terminal = getTerminal("ch4-t5");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "cat route.conf").lines.join("\n")).toContain("nova-core");
	});

	it("T6 只有訊號沒有呼號、或呼號不在第一行都不算", () => {
		const { solved } = runAll(getTerminal("ch4-t6"), [
			"cat /deck4/comms/signal.txt > manifest.txt",
			"cat /deck4/comms/signal.txt /deck4/comms/callsign.txt > manifest.txt",
		]);
		expect(solved).toEqual([false, false]);
	});

	it("T6 用 echo 寫呼號再 >> 接訊號也算過關", () => {
		const { solved } = runAll(getTerminal("ch4-t6"), [
			"echo KEPLER-9 > manifest.txt",
			"cat /deck4/comms/signal.txt >> manifest.txt",
		]);
		expect(solved).toEqual([false, true]);
	});

	it("管線中間的指令失敗，整行就失敗，不過關", () => {
		const terminal = getTerminal("ch4-t2");
		const shell = openTerminal(terminal);
		const failed = shell.execute("grep 回應 ping.lgo | tail -n 1");
		expect(failed.isError).toBe(true);
		expect(evaluateObjective(terminal, createObjectiveContext(terminal.id, failed, shell.fs, shell.home))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 文字檢查
// ---------------------------------------------------------------------------

/** 遞迴走過快照，對每個節點呼叫 `visit(名稱, 檔案內容或 null)`。 */
function walkSnapshot(snapshot: FsSnapshot, visit: (name: string, content: string | null) => void): void {
	function walk(name: string, entry: FsSnapshotEntry): void {
		if (typeof entry === "string") {
			visit(name, entry);
			return;
		}
		if (entry.$type === "file") {
			visit(name, String(entry.content));
			return;
		}
		visit(name, null);
		let children = entry as FsSnapshot;
		if (entry.$type === "dir") {
			children = entry.children as FsSnapshot;
		}
		for (const [childName, child] of Object.entries(children)) {
			walk(childName, child);
		}
	}

	for (const [name, entry] of Object.entries(snapshot)) {
		walk(name, entry);
	}
}

/** 快照裡所有檔案的內容。 */
function collectFileContents(snapshot: FsSnapshot): string[] {
	const contents: string[] = [];
	walkSnapshot(snapshot, (_name, content) => {
		if (content !== null) {
			contents.push(content);
		}
	});
	return contents;
}

/** 快照裡所有檔名、目錄名與檔案內容。 */
function collectSnapshotTexts(snapshot: FsSnapshot): string[] {
	const texts: string[] = [];
	walkSnapshot(snapshot, (name, content) => {
		texts.push(name);
		if (content !== null) {
			texts.push(content);
		}
	});
	return texts;
}

/** 劇本裡所有玩家看得到的文字。 */
function collectChapterTexts(): string[] {
	const texts: string[] = [
		chapterFourComms.title,
		chapterFourComms.deckName,
		...(chapterFourComms.intro ?? []),
		...(chapterFourComms.outro ?? []),
		...(chapterFourComms.novaErrorLines ?? []),
	];

	for (const terminal of chapterFourComms.terminals) {
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

describe("第四章文字", () => {
	it("所有台詞與檔案內容不指涉性別", () => {
		const offending = collectChapterTexts().filter((text) => GENDERED_PATTERN.test(text));
		expect(offending).toEqual([]);
	});

	it("每台終端機都有 NOVA 過關台詞", () => {
		for (const terminal of chapterFourComms.terminals) {
			expect(terminal.nova?.onSolved?.length, terminal.id).toBeGreaterThan(0);
		}
	});

	it("每台終端機都有 NOVA 卡關台詞，一到兩句", () => {
		for (const terminal of chapterFourComms.terminals) {
			const length = terminal.nova?.onStuck?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("每台終端機都有三段提示", () => {
		for (const terminal of chapterFourComms.terminals) {
			expect(terminal.hints, terminal.id).toHaveLength(3);
		}
	});

	it("環境反應階梯的 NOVA 台詞有三到五句", () => {
		const length = chapterFourComms.novaErrorLines?.length ?? 0;
		expect(length).toBeGreaterThanOrEqual(3);
		expect(length).toBeLessThanOrEqual(5);
	});

	it("有開場與結尾台詞", () => {
		expect(chapterFourComms.intro?.length).toBeGreaterThan(0);
		expect(chapterFourComms.outro?.length).toBeGreaterThan(0);
	});
});
