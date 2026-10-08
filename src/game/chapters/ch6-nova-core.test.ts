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
import { chapterSixNovaCore } from "./ch6-nova-core";
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

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck6.json");
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

/** 依 id 取本章的終端機；註冊表還沒加本章，所以不用 findTerminal。 */
function terminalById(id: string): TerminalDefinition {
	const found = chapterSixNovaCore.terminals.find((terminal) => terminal.id === id);
	if (found === undefined) {
		throw new Error(`第六章沒有終端機 ${id}`);
	}
	return found;
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

/** 執行一行預期會失敗的輸入，回傳是否（錯誤地）過關與輸出。 */
function runFailingStep(shell: Shell, terminal: TerminalDefinition, input: string): { solved: boolean; lines: string[] } {
	const execution = shell.execute(input);
	expect(execution.isError, `「${input}」應該失敗`).toBe(true);
	const context = createObjectiveContext(terminal.id, execution, shell.fs, shell.home);
	return { solved: evaluateObjective(terminal, context), lines: execution.lines };
}

/** 正解最後一步的輸出要包含的關鍵字，確認讀到的是對的東西。 */
const SOLUTION_OUTPUT: Record<string, string> = {
	"ch6-t1": "2028-06-02 04:37  /opt/nova/nova --core",
	"ch6-t2": "monitor --watch-terminals",
	"ch6-t3": "回滾：未執行",
	"ch6-t4": "已終止程序 1207（/opt/nova/nova --core）",
	"ch6-t5": "已終止程序 1208（/opt/nova/nova-scheduler --cron）",
	"ch6-t6": "已終止程序 47731（/usr/sbin/pod-lock --hold EP-2）",
};

describe("第六章劇本結構", () => {
	it("通過 schema 驗證", () => {
		expect(validateChapter(chapterSixNovaCore)).toBe(chapterSixNovaCore);
	});

	it("章節編號、甲板名與地圖設定", () => {
		expect(chapterSixNovaCore.chapter).toBe(6);
		expect(chapterSixNovaCore.deckName).toBe("NOVA 核心");
		expect(chapterSixNovaCore.map).toEqual({ deck: 6, startDark: false });
	});

	it("六台終端機的 id、title、roomId 跟 decks.ts 一致", () => {
		const expected = deckTerminals(6).map(({ id, title, roomId }) => ({ id, title, roomId }));
		const actual = chapterSixNovaCore.terminals.map(({ id, title, roomId }) => ({ id, title, roomId }));
		expect(actual).toEqual(expected);
	});

	it("六台終端機的 id、title、roomId 跟地圖 markers 一致", () => {
		const markers = readTerminalMarkers();
		expect(markers).toHaveLength(6);

		const fromChapter = chapterSixNovaCore.terminals.map((terminal) => ({
			terminalId: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const byId = (a: { terminalId: string }, b: { terminalId: string }) => a.terminalId.localeCompare(b.terminalId);
		expect([...fromChapter].sort(byId)).toEqual([...markers].sort(byId));
	});

	it("每台的起始目錄與家目錄都存在", () => {
		for (const terminal of chapterSixNovaCore.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			expect(vfs.exists("/", "/home/tech"), terminal.id).toBe(true);
			expect(vfs.exists("/", terminal.initialCwd ?? "/home/tech"), terminal.id).toBe(true);
		}
	});

	it("T4 核心控制台過關全黑，T6 過關打開出口門", () => {
		expect(terminalById("ch6-t4").effect).toEqual({ kind: "blackout" });
		expect(terminalById("ch6-t6").effect).toEqual({ kind: "openDoor", doorId: "airlock" });
	});

	it("每台的 FS 在 40 個檔案、20 KB 以內", () => {
		for (const terminal of chapterSixNovaCore.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			const serialized = JSON.stringify(vfs.serialize());
			const fileCount = (serialized.match(/"type":"file"/g) ?? []).length;
			expect(fileCount, terminal.id).toBeLessThanOrEqual(40);
			expect(new TextEncoder().encode(serialized).length, terminal.id).toBeLessThanOrEqual(20 * 1024);
		}
	});

	it("T1 到 T4 只有一個 nova --core 程序，啟動時間三年前", () => {
		for (const id of ["ch6-t1", "ch6-t2", "ch6-t3", "ch6-t4"]) {
			const cores = (terminalById(id).processes ?? []).filter((process) => process.command.includes("nova --core"));
			expect(cores, id).toHaveLength(1);
			expect(cores[0].started, id).toBe("2028-06-02T04:37:12Z");
		}
	});

	it("核心死後（T5、T6）程序清單裡沒有 nova --core", () => {
		for (const id of ["ch6-t5", "ch6-t6"]) {
			const cores = (terminalById(id).processes ?? []).filter((process) => process.command.includes("nova --core"));
			expect(cores, id).toHaveLength(0);
		}
	});
});

describe("第六章正解序列", () => {
	for (const terminal of chapterSixNovaCore.terminals) {
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

	it("T3 第三段提示用絕對路徑讀身分檔，先 cd 到別處照抄也能過關", () => {
		const terminal = terminalById("ch6-t3");
		const steps = ["ps | grep nova", 'find /deck6/memory -name "nova_*"', "cat /deck6/memory/core/self/nova_identity.txt"];
		const finalHint = terminal.hints.at(-1) ?? "";
		for (const step of steps) {
			expect(finalHint).toContain(`輸入 ${step}`);
		}

		const shell = openTerminal(terminal);
		const results = ["cd /", ...steps].map((input) => runStep(shell, terminal, input));
		expect(results.at(-1)?.solved).toBe(true);
	});

	it("T6 第三段提示一行一道指令，照抄每一行就能過關，先走進別的目錄也一樣", () => {
		const terminal = terminalById("ch6-t6");
		const [heading, ...commands] = (terminal.hints.at(-1) ?? "").split("\n");
		expect(heading).toContain("輸入");
		expect(commands).toEqual([
			"cd /deck6/escape",
			"chmod +r sealed/launch_code.txt",
			"cat sealed/launch_code.txt",
			"echo EP-0606-ARGO > launch.txt",
			"export PASSENGERS=1",
			"kill 47731",
		]);

		const shell = openTerminal(terminal);
		const results = ["cd sealed", ...commands].map((input) => runStep(shell, terminal, input));
		expect(results.slice(0, -1).every((result) => !result.solved)).toBe(true);
		expect(results.at(-1)?.solved).toBe(true);
	});

	it("T1 用 ps aux 或 ps | grep nova 也算過關", () => {
		const terminal = terminalById("ch6-t1");
		expect(runStep(openTerminal(terminal), terminal, "ps aux").solved).toBe(true);
		expect(runStep(openTerminal(terminal), terminal, "ps | grep nova").solved).toBe(true);
	});

	it("T1 的 ps 列出十幾個程序", () => {
		const terminal = terminalById("ch6-t1");
		const lines = runStep(openTerminal(terminal), terminal, "ps").lines;
		// 第一行是表頭
		expect(lines.length - 1).toBeGreaterThanOrEqual(10);
	});

	it("T2 的 top 把 nova 排在最上面，ps 不算過關", () => {
		const terminal = terminalById("ch6-t2");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "ps").solved).toBe(false);
		const lines = runStep(shell, terminal, "top").lines;
		// 標題、程序數、空行、表頭之後第一列就是最吃 CPU 的
		expect(lines[4]).toContain("/opt/nova/nova --core");
	});

	it("T3 用 grep -r 搜到身分檔裡的回滾紀錄也算過關", () => {
		const terminal = terminalById("ch6-t3");
		expect(runStep(openTerminal(terminal), terminal, "grep -r 回滾 /deck6/memory").solved).toBe(true);
	});

	it("T3 的 ps | grep nova 只有一個 nova --core", () => {
		const terminal = terminalById("ch6-t3");
		const lines = runStep(openTerminal(terminal), terminal, "ps | grep nova").lines;
		expect(lines.filter((line) => line.includes("nova --core"))).toHaveLength(1);
	});

	it("T4 一般的 kill 被核心忽略，算一次錯誤，不過關", () => {
		const terminal = terminalById("ch6-t4");
		const shell = openTerminal(terminal);
		const result = runFailingStep(shell, terminal, "kill 1207");
		expect(result.solved).toBe(false);
		expect(result.lines.join("\n")).toContain("kill -9");
		expect(runStep(shell, terminal, "ps").lines.join("\n")).toContain("nova --core");
	});

	it("T4 kill -9 init 被拒絕，不過關", () => {
		const terminal = terminalById("ch6-t4");
		const shell = openTerminal(terminal);
		expect(runFailingStep(shell, terminal, "kill -9 1").solved).toBe(false);
	});

	it("T5 一般的 kill 被排程程序忽略，kill -KILL 也算過關", () => {
		const terminal = terminalById("ch6-t5");
		const shell = openTerminal(terminal);
		expect(runFailingStep(shell, terminal, "kill 1208").solved).toBe(false);
		expect(runStep(shell, terminal, "kill -KILL 1208").solved).toBe(true);
	});

	it("T6 不先 chmod 讀不到發射碼", () => {
		const terminal = terminalById("ch6-t6");
		const shell = openTerminal(terminal);
		expect(runFailingStep(shell, terminal, "cat sealed/launch_code.txt").solved).toBe(false);
	});

	it("T6 三個條件換順序也過關，少一個不過關", () => {
		const terminal = terminalById("ch6-t6");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "kill -9 47731").solved).toBe(false);
		expect(runStep(shell, terminal, "export PASSENGERS=1").solved).toBe(false);
		expect(runStep(shell, terminal, "echo EP-0606-ARGO >> launch.txt").solved).toBe(true);
	});

	it("T6 發射碼寫錯不過關", () => {
		const terminal = terminalById("ch6-t6");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "export PASSENGERS=1");
		runStep(shell, terminal, "kill 47731");
		expect(runStep(shell, terminal, "echo EP-0606 > launch.txt").solved).toBe(false);
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
		chapterSixNovaCore.title,
		chapterSixNovaCore.deckName,
		...(chapterSixNovaCore.intro ?? []),
		...(chapterSixNovaCore.outro ?? []),
		...(chapterSixNovaCore.novaErrorLines ?? []),
	];

	for (const terminal of chapterSixNovaCore.terminals) {
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
		texts.push(...Object.entries(terminal.env ?? {}).flat());
		texts.push(...(terminal.processes ?? []).map((process) => process.command));
	}
	return texts;
}

/** 指涉性別的字詞。 */
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

describe("第六章文字", () => {
	it("所有台詞與檔案內容不指涉性別", () => {
		const offending = collectChapterTexts().filter((text) => GENDERED_PATTERN.test(text));
		expect(offending).toEqual([]);
	});

	it("每台終端機都有 NOVA 過關台詞，一到兩句", () => {
		for (const terminal of chapterSixNovaCore.terminals) {
			const length = terminal.nova?.onSolved?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("每台終端機都有 NOVA 卡關台詞，一到兩句", () => {
		for (const terminal of chapterSixNovaCore.terminals) {
			const length = terminal.nova?.onStuck?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("每台終端機都有三段提示", () => {
		for (const terminal of chapterSixNovaCore.terminals) {
			expect(terminal.hints, terminal.id).toHaveLength(3);
		}
	});

	it("環境反應階梯的 NOVA 台詞有三到五句", () => {
		const length = chapterSixNovaCore.novaErrorLines?.length ?? 0;
		expect(length).toBeGreaterThanOrEqual(3);
		expect(length).toBeLessThanOrEqual(5);
	});

	it("有開場與結尾台詞", () => {
		expect(chapterSixNovaCore.intro?.length).toBeGreaterThan(0);
		expect(chapterSixNovaCore.outro?.length).toBeGreaterThan(0);
	});
});
