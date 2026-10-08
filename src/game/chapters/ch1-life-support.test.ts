// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOM_NAMES } from "@/game/phaser/events";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import { chapterOneLifeSupport } from "./ch1-life-support";
import { findTerminal } from "./index";
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

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck1.json");
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

/** 用劇本的 FS 與起始目錄開一個真的 shell。 */
function openTerminal(terminal: TerminalDefinition): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(terminal.fs),
		terminalId: terminal.id,
		hints: terminal.hints,
		learnedCommands: [],
		cwd: terminal.initialCwd,
	});
}

/** 執行一行輸入並判定是否過關；執行失敗直接讓測試失敗，正解不該打錯。 */
function runStep(shell: Shell, terminal: TerminalDefinition, input: string): { solved: boolean; lines: string[] } {
	const execution = shell.execute(input);
	expect(execution.isError, `「${input}」不該失敗：${execution.lines.join(" / ")}`).toBe(false);
	const context = createObjectiveContext(terminal.id, execution, shell.fs, shell.home);
	return { solved: evaluateObjective(terminal, context), lines: execution.lines };
}

/** 正解最後一步的輸出要包含的關鍵字，確認讀到的是對的檔案。 */
const SOLUTION_OUTPUT: Record<string, string> = {
	"ch1-t1": "目前設定：撤離後三年",
	"ch1-t2": "異常：斷路器 B3 跳脫",
	"ch1-t3": "不要相信那個聲音。",
	"ch1-t4": "RESET-B3-7734",
	"ch1-t5": "名單上找不到此人，手動建檔。",
	"ch1-t6": "K9-AIRLOCK-0006",
};

describe("第一章劇本結構", () => {
	it("通過 schema 驗證", () => {
		expect(validateChapter(chapterOneLifeSupport)).toBe(chapterOneLifeSupport);
	});

	it("六台終端機的 id、title、roomId 跟地圖 markers 一致", () => {
		const markers = readTerminalMarkers();
		expect(markers).toHaveLength(6);

		const fromChapter = chapterOneLifeSupport.terminals.map((terminal) => ({
			terminalId: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const byId = (a: { terminalId: string }, b: { terminalId: string }) => a.terminalId.localeCompare(b.terminalId);
		expect([...fromChapter].sort(byId)).toEqual([...markers].sort(byId));
	});

	it("findTerminal 找得到每一台，找不到回 undefined", () => {
		for (const terminal of chapterOneLifeSupport.terminals) {
			expect(findTerminal(terminal.id)).toBe(terminal);
		}
		expect(findTerminal("ch1-t99")).toBeUndefined();
	});

	it("每台的起始目錄與家目錄都存在", () => {
		for (const terminal of chapterOneLifeSupport.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			expect(vfs.exists("/", "/home/tech"), terminal.id).toBe(true);
			expect(vfs.exists("/", terminal.initialCwd ?? "/home/tech"), terminal.id).toBe(true);
		}
	});
});

describe("第一章正解序列", () => {
	for (const terminal of chapterOneLifeSupport.terminals) {
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

	it("T2 用絕對路徑直接 cat 也算過關", () => {
		const terminal = findTerminal("ch1-t2") as TerminalDefinition;
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "cat /deck1/systems/power/status.txt").solved).toBe(true);
	});

	it("T3 的 ls -l 顯示阿彬最後一則日誌比其他檔案新", () => {
		const terminal = findTerminal("ch1-t3") as TerminalDefinition;
		const shell = openTerminal(terminal);
		const output = runStep(shell, terminal, "ls -l /home/abin").lines.join("\n");
		expect(output).toContain("day_900.txt");
		expect(output).toContain("2031");
	});

	it("T4 只用 ls 看不到 .override，ls -a 才看得到", () => {
		const terminal = findTerminal("ch1-t4") as TerminalDefinition;
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "cd /deck1/systems/power/breakers/B3");
		expect(runStep(shell, terminal, "ls").lines.join("\n")).not.toContain(".override");
		expect(runStep(shell, terminal, "ls -a").lines.join("\n")).toContain(".override");
	});

	it("T5 打病歷編號開頭按 Tab 能補完唯一檔名", () => {
		const terminal = findTerminal("ch1-t5") as TerminalDefinition;
		const shell = openTerminal(terminal);
		// 檔案補完後跟 bash 一樣多一個空白
		expect(shell.complete("cat records/PT-2028-06").completed.trimEnd()).toBe("cat records/PT-2028-0601-QN0606.txt");
	});

	it("T6 讀門鎖檔不算過關，執行失敗也不算", () => {
		const terminal = findTerminal("ch1-t6") as TerminalDefinition;
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "cat lock.txt").solved).toBe(false);

		const failed = shell.execute("cat /home/tech/pod_06/.kee");
		expect(failed.isError).toBe(true);
		expect(evaluateObjective(terminal, createObjectiveContext(terminal.id, failed, shell.fs, shell.home))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 文字檢查
// ---------------------------------------------------------------------------

/** 遞迴收集快照裡所有檔案內容與檔名。 */
function collectSnapshotTexts(snapshot: FsSnapshot): string[] {
	const texts: string[] = [];

	function visit(name: string, entry: FsSnapshotEntry): void {
		texts.push(name);
		if (typeof entry === "string") {
			texts.push(entry);
			return;
		}
		if (entry.$type === "file") {
			texts.push(String(entry.content));
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
	return texts;
}

/** 劇本裡所有玩家看得到的文字。 */
function collectChapterTexts(): string[] {
	const texts: string[] = [
		chapterOneLifeSupport.title,
		...(chapterOneLifeSupport.intro ?? []),
		...(chapterOneLifeSupport.outro ?? []),
		...(chapterOneLifeSupport.novaErrorLines ?? []),
	];

	for (const terminal of chapterOneLifeSupport.terminals) {
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

describe("第一章文字", () => {
	it("所有台詞與檔案內容不指涉性別", () => {
		const offending = collectChapterTexts().filter((text) => GENDERED_PATTERN.test(text));
		expect(offending).toEqual([]);
	});

	it("每台終端機都有 NOVA 過關台詞", () => {
		for (const terminal of chapterOneLifeSupport.terminals) {
			expect(terminal.nova?.onSolved?.length, terminal.id).toBeGreaterThan(0);
		}
	});

	it("T3 到 T6 的目標說明寫出終端機所在的艙區，玩家看目標面板就知道要去哪", () => {
		for (const id of ["ch1-t3", "ch1-t4", "ch1-t5", "ch1-t6"]) {
			const terminal = findTerminal(id);
			expect(terminal, id).toBeDefined();
			expect(terminal?.objective.description ?? "", id).toContain(ROOM_NAMES[terminal!.roomId]);
		}
	});

	it("每台終端機都有 NOVA 卡關台詞，一到兩句", () => {
		for (const terminal of chapterOneLifeSupport.terminals) {
			const length = terminal.nova?.onStuck?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("環境反應階梯的 NOVA 台詞有三到五句", () => {
		const length = chapterOneLifeSupport.novaErrorLines?.length ?? 0;
		expect(length).toBeGreaterThanOrEqual(3);
		expect(length).toBeLessThanOrEqual(5);
	});

	it("有開場與結尾台詞", () => {
		expect(chapterOneLifeSupport.intro?.length).toBeGreaterThan(0);
		expect(chapterOneLifeSupport.outro?.length).toBeGreaterThan(0);
	});
});
