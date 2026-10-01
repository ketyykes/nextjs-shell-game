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
import { chapterFiveBridge } from "./ch5-bridge";
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

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck5.json");
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

/** 章節還沒進註冊表，直接從本章劇本找終端機。 */
function terminalById(id: string): TerminalDefinition {
	const terminal = chapterFiveBridge.terminals.find((item) => item.id === id);
	if (terminal === undefined) {
		throw new Error(`第五章沒有 ${id}`);
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

/** 執行一行預期會失敗的輸入，回傳是否（不該）過關。 */
function runFailingStep(shell: Shell, terminal: TerminalDefinition, input: string): boolean {
	const execution = shell.execute(input);
	expect(execution.isError, `「${input}」應該失敗`).toBe(true);
	return evaluateObjective(terminal, createObjectiveContext(terminal.id, execution, shell.fs, shell.home));
}

/** 每台終端機的正解序列，最後一步才過關。e2e 也用這張表。 */
export const SOLUTIONS: Record<string, string[]> = {
	"ch5-t1": ["ls", "cat README.txt", "man env", "env"],
	"ch5-t2": [
		"ls",
		"cat handover.txt",
		"man export",
		"export CAPTAIN_KEY=CAPT-0417",
		"env",
		"cat /deck5/keys/$CAPTAIN_KEY.txt",
	],
	"ch5-t3": [
		"ls",
		"cat log_0601.txt",
		"ls -l sealed",
		"chmod +r sealed/log_final.txt",
		"ls -l sealed",
		"cat sealed/log_final.txt",
	],
	"ch5-t4": [
		"ls",
		"cat jobs.txt",
		"ls -l scheduler",
		"chmod 644 scheduler/cron_2028-06-02.log",
		"ls -l scheduler",
		"cat scheduler/cron_2028-06-02.log",
	],
	"ch5-t5": ["cat README.txt", "env", "ls $POD_DIR", "cd $POD_DIR", "cat status.txt", "cat pod_03/launch.log"],
	"ch5-t6": [
		"cat lock.txt",
		"cat /deck5/nav/handover.txt",
		"export AUTH=CAPT-0417",
		"ls -l $AUTH_DIR",
		"chmod +r $AUTH_DIR/$AUTH.key",
		"cat $AUTH_DIR/$AUTH.key",
	],
};

/** 正解最後一步的輸出要包含的關鍵字，確認讀到的是對的檔案。 */
const SOLUTION_OUTPUT: Record<string, string> = {
	"ch5-t1": "STATION_MODE=decommission_countdown",
	"ch5-t2": "驗證：通過",
	"ch5-t3": "它還在跑。別相信那個聲音。",
	"ch5-t4": "04:37:09 nova-scheduler: unset NOVA_DIR",
	"ch5-t5": "艙門開啟，乘員：0",
	"ch5-t6": "艦橋艙門：解鎖",
};

describe("第五章劇本結構", () => {
	it("通過 schema 驗證", () => {
		expect(validateChapter(chapterFiveBridge)).toBe(chapterFiveBridge);
	});

	it("章節號、甲板名與地圖設定", () => {
		expect(chapterFiveBridge.chapter).toBe(5);
		expect(chapterFiveBridge.deckName).toBe("艦橋");
		expect(chapterFiveBridge.map).toEqual({ deck: 5, startDark: false });
	});

	it("六台終端機的 id、title、roomId 跟 decks.ts 一致", () => {
		const fromChapter = chapterFiveBridge.terminals.map((terminal) => ({
			id: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const fromDecks = deckTerminals(5).map((terminal) => ({
			id: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		expect(fromChapter).toEqual(fromDecks);
	});

	it("六台終端機的 id、title、roomId 跟地圖 markers 一致", () => {
		const markers = readTerminalMarkers();
		expect(markers).toHaveLength(6);

		const fromChapter = chapterFiveBridge.terminals.map((terminal) => ({
			terminalId: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const byId = (a: { terminalId: string }, b: { terminalId: string }) => a.terminalId.localeCompare(b.terminalId);
		expect([...fromChapter].sort(byId)).toEqual([...markers].sort(byId));
	});

	it("T6 過關開出口艙門", () => {
		expect(terminalById("ch5-t6").effect).toEqual({ kind: "openDoor", doorId: EXIT_DOOR_ID });
	});

	it("每台的起始目錄與家目錄都存在", () => {
		for (const terminal of chapterFiveBridge.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			expect(vfs.exists("/", "/home/tech"), terminal.id).toBe(true);
			expect(vfs.exists("/", terminal.initialCwd ?? "/home/tech"), terminal.id).toBe(true);
		}
	});

	it("每台的檔案系統不超過 40 個檔案、內容 20 KB", () => {
		for (const terminal of chapterFiveBridge.terminals) {
			const texts = collectFileContents(terminal.fs);
			const bytes = texts.reduce((total, text) => total + Buffer.byteLength(text, "utf8"), 0);
			expect(texts.length, terminal.id).toBeLessThanOrEqual(40);
			expect(bytes, terminal.id).toBeLessThanOrEqual(20 * 1024);
		}
	});

	it("每台最多教兩個新概念", () => {
		for (const terminal of chapterFiveBridge.terminals) {
			expect(terminal.teaches.length, terminal.id).toBeLessThanOrEqual(2);
		}
	});
});

describe("第五章正解序列", () => {
	for (const terminal of chapterFiveBridge.terminals) {
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

	it("T1 env 接 grep 挑出站務模式也算過關，挑別的變數不算", () => {
		const terminal = terminalById("ch5-t1");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "env | grep HOME").solved).toBe(false);
		expect(runStep(shell, terminal, "env | grep STATION").solved).toBe(true);
	});

	it("T1 export 不帶參數列出變數也算過關", () => {
		const terminal = terminalById("ch5-t1");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "export").solved).toBe(true);
	});

	it("T2 沒 export 就直接讀鑰匙檔不算過關", () => {
		const terminal = terminalById("ch5-t2");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "cat /deck5/keys/CAPT-0417.txt").solved).toBe(false);
	});

	it("T2 export 等號兩邊有空格會失敗", () => {
		const terminal = terminalById("ch5-t2");
		const shell = openTerminal(terminal);
		expect(runFailingStep(shell, terminal, "export CAPTAIN_KEY = CAPT-0417")).toBe(false);
	});

	it("T2 艦長碼抄錯會讀到驗證失敗的檔，不算過關", () => {
		const terminal = terminalById("ch5-t2");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "export CAPTAIN_KEY=CAPT-0311");
		const result = runStep(shell, terminal, "cat /deck5/keys/$CAPTAIN_KEY.txt");
		expect(result.solved).toBe(false);
		expect(result.lines.join("\n")).toContain("驗證：失敗");
	});

	it("T2 用 KEY_DIR 變數組路徑也算過關", () => {
		const terminal = terminalById("ch5-t2");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "export CAPTAIN_KEY=CAPT-0417");
		expect(runStep(shell, terminal, "cat $KEY_DIR/$CAPTAIN_KEY.txt").solved).toBe(true);
	});

	it("T3 chmod 之前讀封存日誌會被拒，也不算過關", () => {
		const terminal = terminalById("ch5-t3");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "ls -l sealed").lines.join("\n")).toContain("----------");
		expect(runFailingStep(shell, terminal, "cat sealed/log_final.txt")).toBe(false);
	});

	it("T3 chmod 644 也打得開封存日誌", () => {
		const terminal = terminalById("ch5-t3");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "chmod 644 /deck5/captain/sealed/log_final.txt");
		expect(runStep(shell, terminal, "cat /deck5/captain/sealed/log_final.txt").solved).toBe(true);
	});

	it("T4 ls -l 顯示排程日誌只有 nova 能讀", () => {
		const terminal = terminalById("ch5-t4");
		const shell = openTerminal(terminal);
		const output = runStep(shell, terminal, "ls -l scheduler").lines.join("\n");
		expect(output).toMatch(/-rw-------\s+nova\s.*cron_2028-06-02\.log/);
		expect(runFailingStep(shell, terminal, "cat scheduler/cron_2028-06-02.log")).toBe(false);
	});

	it("T4 用 chmod +r 再 grep 出那一行也算過關", () => {
		const terminal = terminalById("ch5-t4");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "chmod +r scheduler/cron_2028-06-02.log");
		expect(runStep(shell, terminal, "grep NOVA_DIR scheduler/cron_2028-06-02.log").solved).toBe(true);
	});

	it("T4 unset 比 rm 早三秒", () => {
		const terminal = terminalById("ch5-t4");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "chmod 644 scheduler/cron_2028-06-02.log");
		const output = runStep(shell, terminal, "cat scheduler/cron_2028-06-02.log").lines.join("\n");
		expect(output).toContain("04:37:09 nova-scheduler: unset NOVA_DIR");
		expect(output).toContain("04:37:12");
		expect(output.indexOf("04:37:09")).toBeLessThan(output.indexOf("04:37:12"));
	});

	it("T5 pod_03 有阿彬留下的隱藏檔，ls -a 才看得到", () => {
		const terminal = terminalById("ch5-t5");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "ls $POD_DIR/pod_03").lines.join("\n")).not.toContain(".note");
		expect(runStep(shell, terminal, "ls -a $POD_DIR/pod_03").lines.join("\n")).toContain(".note");
	});

	it("T5 用絕對路徑直接讀也算過關", () => {
		const terminal = terminalById("ch5-t5");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "cat /deck5/pods/pod_03/launch.log").solved).toBe(true);
	});

	it("T6 沒 export AUTH 就讀鑰匙不算過關", () => {
		const terminal = terminalById("ch5-t6");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "chmod +r /deck5/exit/auth/CAPT-0417.key");
		expect(runStep(shell, terminal, "cat /deck5/exit/auth/CAPT-0417.key").solved).toBe(false);
	});

	it("T6 export 之後沒 chmod 就讀鑰匙會被拒", () => {
		const terminal = terminalById("ch5-t6");
		const shell = openTerminal(terminal);
		runStep(shell, terminal, "export AUTH=CAPT-0417");
		expect(runFailingStep(shell, terminal, "cat $AUTH_DIR/$AUTH.key")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 文字檢查
// ---------------------------------------------------------------------------

/** 遞迴走訪快照，對每個檔名與檔案內容呼叫 `onName`、`onFile`。 */
function walkSnapshot(snapshot: FsSnapshot, onName: (name: string) => void, onFile: (content: string) => void): void {
	function visit(name: string, entry: FsSnapshotEntry): void {
		onName(name);
		if (typeof entry === "string") {
			onFile(entry);
			return;
		}
		if (entry.$type === "file") {
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

/** 快照裡所有檔案內容。 */
function collectFileContents(snapshot: FsSnapshot): string[] {
	const contents: string[] = [];
	walkSnapshot(
		snapshot,
		() => undefined,
		(content) => contents.push(content),
	);
	return contents;
}

/** 快照裡所有檔名與檔案內容。 */
function collectSnapshotTexts(snapshot: FsSnapshot): string[] {
	const texts: string[] = [];
	walkSnapshot(
		snapshot,
		(name) => texts.push(name),
		(content) => texts.push(content),
	);
	return texts;
}

/** 劇本裡所有玩家看得到的文字。 */
function collectChapterTexts(): string[] {
	const texts: string[] = [
		chapterFiveBridge.title,
		chapterFiveBridge.deckName,
		...(chapterFiveBridge.intro ?? []),
		...(chapterFiveBridge.outro ?? []),
		...(chapterFiveBridge.novaErrorLines ?? []),
	];

	for (const terminal of chapterFiveBridge.terminals) {
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
		texts.push(...Object.entries(terminal.env ?? {}).flat());
		texts.push(...collectSnapshotTexts(terminal.fs));
	}
	return texts;
}

/** 指涉性別的字詞。 */
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

describe("第五章文字", () => {
	it("所有台詞與檔案內容不指涉性別", () => {
		const offending = collectChapterTexts().filter((text) => GENDERED_PATTERN.test(text));
		expect(offending).toEqual([]);
	});

	it("艦長最後一句與逃生艙紀錄照設計文件寫", () => {
		const texts = collectChapterTexts().join("\n");
		expect(texts).toContain("它還在跑。別相信那個聲音。");
		expect(texts).toContain("艙門開啟，乘員：0");
	});

	it("每台終端機都有 NOVA 過關台詞", () => {
		for (const terminal of chapterFiveBridge.terminals) {
			expect(terminal.nova?.onSolved?.length, terminal.id).toBeGreaterThan(0);
		}
	});

	it("每台終端機都有 NOVA 卡關台詞，一到兩句", () => {
		for (const terminal of chapterFiveBridge.terminals) {
			const length = terminal.nova?.onStuck?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(2);
		}
	});

	it("每台終端機都有三段提示", () => {
		for (const terminal of chapterFiveBridge.terminals) {
			expect(terminal.hints, terminal.id).toHaveLength(3);
		}
	});

	it("環境反應階梯的 NOVA 台詞有三到五句", () => {
		const length = chapterFiveBridge.novaErrorLines?.length ?? 0;
		expect(length).toBeGreaterThanOrEqual(3);
		expect(length).toBeLessThanOrEqual(5);
	});

	it("有開場與結尾台詞", () => {
		expect(chapterFiveBridge.intro?.length).toBeGreaterThan(0);
		expect(chapterFiveBridge.outro?.length).toBeGreaterThan(0);
	});
});
