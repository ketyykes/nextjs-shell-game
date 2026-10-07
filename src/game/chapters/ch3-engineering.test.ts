// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { deckTerminals } from "@/game/story/decks";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import { chapterThreeEngineering } from "./ch3-engineering";
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

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck3.json");
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
	const terminal = chapterThreeEngineering.terminals.find((item) => item.id === id);
	if (terminal === undefined) {
		throw new Error(`第三章沒有 ${id}`);
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

/** 依序跑一串輸入，回傳最後一步是否過關。 */
function runSteps(terminal: TerminalDefinition, inputs: string[]): boolean[] {
	const shell = openTerminal(terminal);
	return inputs.map((input) => runStep(shell, terminal, input).solved);
}

/** 每台終端機的正解序列，最後一步才過關（e2e 也用這張表）。 */
export const SOLUTIONS: Record<string, string[]> = {
	"ch3-t1": ["ls", "ls -a", "cat work_order.txt", "mkdir repair"],
	"ch3-t2": [
		"ls",
		"cat README.txt",
		"ls backup",
		"cat backup/core.cfg",
		"cp backup/core.cfg ~/repair/",
		"touch ~/repair/NOTES.txt",
	],
	"ch3-t3": ["cat README.txt", "ls", "ls -la", "cat .bash_history", "mv .parts_list.txt inventory/parts_list.txt"],
	"ch3-t4": [
		"cat status.txt",
		"ls",
		"rm startup.lock",
		"rm -r config.corrupt",
		"mkdir config",
		"cp ~/repair/core.cfg config/",
	],
	"ch3-t5": [
		"ls",
		"cat backup_policy.txt",
		"cat rollback.log",
		"cd /deck3/reactor",
		"ls",
		"cp -r config config.bak",
	],
	"ch3-t6": [
		"cat door_lock.txt",
		"ls /deck3/reactor/config",
		"ls -a /deck3/reactor/config",
		"cat /deck3/reactor/config/.moved_by_nova",
		"mkdir -p auth/keys",
		"cp /var/nova/hold/launch_key auth/keys/",
	],
};

/** 正解最後一步執行後，要在檔案系統裡看到的結果：[路徑, 內容要包含的字]。 */
const SOLUTION_RESULT: Record<string, [string, string]> = {
	"ch3-t1": ["/home/tech/repair", ""],
	"ch3-t2": ["/home/tech/repair/core.cfg", "K9-REACTOR-01"],
	"ch3-t3": ["/deck3/storage/inventory/parts_list.txt", "PL-0603"],
	"ch3-t4": ["/deck3/reactor/config/core.cfg", "K9-REACTOR-01"],
	"ch3-t5": ["/deck3/reactor/config.bak/core.cfg", "K9-REACTOR-01"],
	"ch3-t6": ["/deck3/exit/auth/keys/launch_key", "K9-ENG-HATCH-0306"],
};

describe("第三章劇本結構", () => {
	it("通過 schema 驗證", () => {
		expect(validateChapter(chapterThreeEngineering)).toBe(chapterThreeEngineering);
	});

	it("章節號、甲板名、地圖設定", () => {
		expect(chapterThreeEngineering.chapter).toBe(3);
		expect(chapterThreeEngineering.deckName).toBe("工程艙");
		expect(chapterThreeEngineering.map).toEqual({ deck: 3, startDark: true });
	});

	it("六台終端機的 id、title、roomId 跟 decks.ts 一致且依 T1 到 T6 排序", () => {
		const expected = deckTerminals(3).map(({ id, title, roomId }) => ({ id, title, roomId }));
		const actual = chapterThreeEngineering.terminals.map(({ id, title, roomId }) => ({ id, title, roomId }));
		expect(actual).toEqual(expected);
	});

	it("六台終端機的 id、title、roomId 跟地圖 markers 一致", () => {
		const markers = readTerminalMarkers();
		expect(markers).toHaveLength(6);

		const fromChapter = chapterThreeEngineering.terminals.map((terminal) => ({
			terminalId: terminal.id,
			title: terminal.title,
			roomId: terminal.roomId,
		}));
		const byId = (a: { terminalId: string }, b: { terminalId: string }) => a.terminalId.localeCompare(b.terminalId);
		expect([...fromChapter].sort(byId)).toEqual([...markers].sort(byId));
	});

	it("開場斷電，T4 過關恢復電力，T6 過關開出口門", () => {
		expect(terminalById("ch3-t4").effect).toEqual({ kind: "powerRestored" });
		expect(terminalById("ch3-t6").effect).toEqual({ kind: "openDoor", doorId: EXIT_DOOR_ID });
	});

	it("每台的起始目錄與家目錄都存在", () => {
		for (const terminal of chapterThreeEngineering.terminals) {
			const vfs = VirtualFileSystem.fromSnapshot(terminal.fs);
			expect(vfs.exists("/", "/home/tech"), terminal.id).toBe(true);
			expect(vfs.exists("/", terminal.initialCwd ?? "/home/tech"), terminal.id).toBe(true);
		}
	});

	it("每台教的新指令依序是 mkdir、touch/cp、mv、rm/rm -r、cp -r、mkdir -p", () => {
		expect(chapterThreeEngineering.terminals.map((terminal) => terminal.teaches)).toEqual([
			["mkdir"],
			["touch", "cp"],
			["mv"],
			["rm", "rm -r"],
			["cp -r"],
			["mkdir -p"],
		]);
	});

	it("每台的檔案系統控制在 40 個檔案、20 KB 以內", () => {
		for (const terminal of chapterThreeEngineering.terminals) {
			const serialized = JSON.stringify(VirtualFileSystem.fromSnapshot(terminal.fs).serialize());
			const fileCount = (serialized.match(/"type":"file"/g) ?? []).length;
			expect(fileCount, terminal.id).toBeLessThanOrEqual(40);
			const contentBytes = collectSnapshotTexts(terminal.fs).join("").length * 3;
			expect(contentBytes, terminal.id).toBeLessThanOrEqual(20 * 1024);
		}
	});
});

describe("第三章正解序列", () => {
	for (const terminal of chapterThreeEngineering.terminals) {
		it(`${terminal.id} ${terminal.title}：只有最後一步過關`, () => {
			const steps = SOLUTIONS[terminal.id];
			expect(steps, `${terminal.id} 沒有正解序列`).toBeDefined();

			const shell = openTerminal(terminal);
			const results = steps.map((input) => runStep(shell, terminal, input));
			const solvedFlags = results.map((result) => result.solved);

			expect(solvedFlags.slice(0, -1).every((solved) => !solved)).toBe(true);
			expect(solvedFlags.at(-1)).toBe(true);

			const [resultPath, resultText] = SOLUTION_RESULT[terminal.id];
			expect(shell.fs.exists("/", resultPath), resultPath).toBe(true);
			if (resultText !== "") {
				expect(shell.fs.readFile("/", resultPath)).toContain(resultText);
			}
		});
	}
});

describe("第三章其他路徑", () => {
	it("T1 用 touch 建同名檔案不算過關，mkdir -p 用絕對路徑也算", () => {
		const terminal = terminalById("ch3-t1");
		expect(runSteps(terminal, ["touch repair"])).toEqual([false]);
		expect(runSteps(terminal, ["mkdir -p /home/tech/repair"])).toEqual([true]);
	});

	it("T2 只複製不建筆記不過關；先 touch 再用萬用字元複製全部備份也過關", () => {
		const terminal = terminalById("ch3-t2");
		expect(runSteps(terminal, ["cp backup/core.cfg ~/repair/"])).toEqual([false]);
		expect(runSteps(terminal, ["touch ~/repair/NOTES.txt", "cp backup/*.cfg ~/repair/"])).toEqual([false, true]);
	});

	it("T2 用 touch 建一個空的 core.cfg 冒充備份不過關", () => {
		const terminal = terminalById("ch3-t2");
		expect(runSteps(terminal, ["touch ~/repair/core.cfg ~/repair/NOTES.txt"])).toEqual([false]);
	});

	it("T3 只用 ls 看不到 .bash_history，ls -la 才看得到，內容有那行 rm", () => {
		const terminal = terminalById("ch3-t3");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "ls").lines.join("\n")).not.toContain(".bash_history");
		expect(runStep(shell, terminal, "ls -la").lines.join("\n")).toContain(".bash_history");
		const history = runStep(shell, terminal, "cat .bash_history").lines.join("\n");
		expect(history).toContain('rm -rf "$NOVA_DIR/"');
		expect(history).toContain("04:37:12");
		expect(history).not.toContain("unset");
	});

	it("T3 只改名沒搬進 inventory 不過關，分兩步改名再搬也過關；用 cp 留下原檔不過關", () => {
		const terminal = terminalById("ch3-t3");
		expect(runSteps(terminal, ["mv .parts_list.txt parts_list.txt", "mv parts_list.txt inventory/"])).toEqual([
			false,
			true,
		]);
		expect(runSteps(terminal, ["cp .parts_list.txt inventory/parts_list.txt"])).toEqual([false]);
	});

	it("T4 不加 -r 刪不掉目錄；沒清掉損毀目錄就放備份不過關", () => {
		const terminal = terminalById("ch3-t4");
		const shell = openTerminal(terminal);
		expect(shell.execute("rm config.corrupt").isError).toBe(true);

		expect(runSteps(terminal, ["rm startup.lock", "mkdir config", "cp ~/repair/core.cfg config/"])).toEqual([
			false,
			false,
			false,
		]);
	});

	it("T4 先重建再清理，最後一步清完也過關", () => {
		const terminal = terminalById("ch3-t4");
		expect(
			runSteps(terminal, ["mkdir config", "cp ~/repair/core.cfg config/", "rm -r config.corrupt", "rm startup.lock"]),
		).toEqual([false, false, false, true]);
	});

	it("T5 回滾日誌停在 2%，最後一行比那行 rm 晚三秒", () => {
		const terminal = terminalById("ch3-t5");
		const shell = openTerminal(terminal);
		const log = runStep(shell, terminal, "cat rollback.log").lines;
		expect(log.join("\n")).toContain("2%");
		expect(log.join("\n")).not.toContain("3%");
		const lastStamped = [...log].reverse().find((line) => line.startsWith("2028-06-02"));
		expect(lastStamped).toContain("04:37:15");
	});

	it("T5 cp 不加 -r 複製目錄會失敗；用 mv 搬走原目錄不算備份", () => {
		const terminal = terminalById("ch3-t5");
		const shell = openTerminal(terminal);
		expect(shell.execute("cp /deck3/reactor/config /deck3/reactor/config.bak").isError).toBe(true);

		expect(runSteps(terminal, ["mv /deck3/reactor/config /deck3/reactor/config.bak"])).toEqual([false]);
	});

	it("T5 先建 config.bak 再用萬用字元複製全部檔案也過關", () => {
		const terminal = terminalById("ch3-t5");
		expect(
			runSteps(terminal, ["mkdir /deck3/reactor/config.bak", "cp /deck3/reactor/config/* /deck3/reactor/config.bak/"]),
		).toEqual([false, true]);
	});

	it("T6 反應爐的 config 只剩一個隱藏的搬移紀錄", () => {
		const terminal = terminalById("ch3-t6");
		const shell = openTerminal(terminal);
		expect(runStep(shell, terminal, "ls /deck3/reactor/config").lines.join("\n").trim()).toBe("");
		expect(runStep(shell, terminal, "ls -a /deck3/reactor/config").lines.join("\n")).toContain(".moved_by_nova");
	});

	it("T6 不加 -p 一次建兩層會失敗；一層一層建也過關", () => {
		const terminal = terminalById("ch3-t6");
		const shell = openTerminal(terminal);
		expect(shell.execute("mkdir auth/keys").isError).toBe(true);

		expect(
			runSteps(terminal, ["mkdir auth", "mkdir auth/keys", "cp /var/nova/hold/launch_key auth/keys/launch_key"]),
		).toEqual([false, false, true]);
	});

	it("T6 鑰匙放錯目錄不過關", () => {
		const terminal = terminalById("ch3-t6");
		expect(runSteps(terminal, ["mkdir -p auth", "cp /var/nova/hold/launch_key auth/"])).toEqual([false, false]);
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
		chapterThreeEngineering.title,
		chapterThreeEngineering.deckName,
		...(chapterThreeEngineering.intro ?? []),
		...(chapterThreeEngineering.outro ?? []),
		...(chapterThreeEngineering.novaErrorLines ?? []),
	];

	for (const terminal of chapterThreeEngineering.terminals) {
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

describe("第三章文字", () => {
	it("所有台詞與檔案內容不指涉性別", () => {
		const offending = collectChapterTexts().filter((text) => GENDERED_PATTERN.test(text));
		expect(offending).toEqual([]);
	});

	it("這一章不揭露 unset 是誰做的", () => {
		const offending = collectChapterTexts().filter((text) => text.includes("unset"));
		expect(offending).toEqual([]);
	});

	it("每台終端機都有三段提示、banner 與 NOVA 進房、開機、過關台詞", () => {
		for (const terminal of chapterThreeEngineering.terminals) {
			expect(terminal.hints, terminal.id).toHaveLength(3);
			expect(terminal.banner?.length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(terminal.banner?.length, terminal.id).toBeLessThanOrEqual(2);
			expect(terminal.nova?.onEnterRoom?.length, terminal.id).toBeGreaterThan(0);
			expect(terminal.nova?.onOpen?.length, terminal.id).toBeGreaterThan(0);
			expect(terminal.nova?.onSolved?.length, terminal.id).toBeGreaterThan(0);
		}
	});

	it("每台終端機都有 NOVA 卡關台詞，一到三句（T3 的第三句是搬錯狀態的救援）", () => {
		for (const terminal of chapterThreeEngineering.terminals) {
			const length = terminal.nova?.onStuck?.length ?? 0;
			expect(length, terminal.id).toBeGreaterThanOrEqual(1);
			expect(length, terminal.id).toBeLessThanOrEqual(3);
		}
	});

	it("T6 過關最後一句是「我沒有碰。」", () => {
		expect(terminalById("ch3-t6").nova?.onSolved?.at(-1)).toBe("我沒有碰。");
	});

	it("環境反應階梯的 NOVA 台詞有三到五句", () => {
		const length = chapterThreeEngineering.novaErrorLines?.length ?? 0;
		expect(length).toBeGreaterThanOrEqual(3);
		expect(length).toBeLessThanOrEqual(5);
	});

	it("有開場與結尾台詞", () => {
		expect(chapterThreeEngineering.intro?.length).toBeGreaterThan(0);
		expect(chapterThreeEngineering.outro?.length).toBeGreaterThan(0);
	});
});
