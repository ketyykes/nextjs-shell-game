// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTER_COUNT } from "@/game/phaser/events";
import { getTeachDoc } from "@/game/shell/commands/docs";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { deckTerminals } from "@/game/story/decks";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { CHAPTERS, chapterTeaches, FINAL_CHAPTER, findTerminal, getChapter, getNextChapter, isChapterComplete } from "./index";
import { chapterOneLifeSupport } from "./index";
import { CHAPTER_METAS, LAST_CHAPTER, NOVA_FIRST_LINE } from "./meta";
import { readFile } from "node:fs/promises";

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

/** 讀 `public/maps/deck{n}.json` 的終端機 markers。 */
function readTerminalMarkers(deck: number): { terminalId: string; title: string; roomId: string }[] {
	const mapPath = path.resolve(process.cwd(), `public/maps/deck${deck}.json`);
	const map = JSON.parse(fs.readFileSync(mapPath, "utf8")) as { layers: MapLayer[] };
	const markersLayer = map.layers.find((layer) => layer.name === "markers");
	return (markersLayer?.objects ?? [])
		.filter((object) => object.type === "terminal")
		.map((object) => {
			const properties = new Map((object.properties ?? []).map((property) => [property.name, property.value]));
			return {
				terminalId: String(properties.get("terminalId")),
				title: String(properties.get("title")),
				roomId: String(properties.get("roomId")),
			};
		})
		.sort((a, b) => a.terminalId.localeCompare(b.terminalId));
}

describe("章節註冊表", () => {
	it("章節號從 1 開始連續，最後一章是 FINAL_CHAPTER", () => {
		CHAPTERS.forEach((chapter, index) => {
			expect(chapter.chapter).toBe(index + 1);
		});
		expect(FINAL_CHAPTER).toBe(CHAPTERS.length);
	});

	it("全部六章都已註冊", () => {
		expect(CHAPTERS).toHaveLength(CHAPTER_COUNT);
	});

	it("終端機 id 跨章節唯一，findTerminal 找得到每一台", () => {
		const ids = CHAPTERS.flatMap((chapter) => chapter.terminals.map((terminal) => terminal.id));
		expect(new Set(ids).size).toBe(ids.length);
		for (const chapter of CHAPTERS) {
			for (const terminal of chapter.terminals) {
				expect(findTerminal(terminal.id)).toBe(terminal);
			}
		}
		expect(findTerminal("ch9-t1")).toBeUndefined();
	});

	it("每章六台終端機的 id、標題、艙區跟 decks.ts 與地圖 markers 一致，地圖 deck 等於章節號", () => {
		for (const chapter of CHAPTERS) {
			expect(chapter.map.deck, `第 ${chapter.chapter} 章`).toBe(chapter.chapter);
			const expected = deckTerminals(chapter.chapter).map((item) => ({
				terminalId: item.id,
				title: item.title,
				roomId: item.roomId,
			}));
			const fromChapter = chapter.terminals
				.map((terminal) => ({ terminalId: terminal.id, title: terminal.title, roomId: terminal.roomId }))
				.sort((a, b) => a.terminalId.localeCompare(b.terminalId));
			expect(fromChapter, `第 ${chapter.chapter} 章劇本`).toEqual(expected);
			expect(readTerminalMarkers(chapter.map.deck), `第 ${chapter.chapter} 章地圖`).toEqual(expected);
		}
	});

	it("開場斷電的章節一定有一台 powerRestored 的終端機，每章都有一台開出口門", () => {
		for (const chapter of CHAPTERS) {
			const kinds = chapter.terminals.map((terminal) => terminal.effect?.kind);
			if (chapter.map.startDark) {
				expect(kinds, `第 ${chapter.chapter} 章`).toContain("powerRestored");
			}
			expect(kinds, `第 ${chapter.chapter} 章`).toContain("openDoor");
		}
	});

	it("getChapter 超出範圍回最後一章，getNextChapter 在最後一章回 null", () => {
		expect(getChapter(1)).toBe(CHAPTERS[0]);
		expect(getChapter(99)).toBe(CHAPTERS[CHAPTERS.length - 1]);
		expect(getNextChapter(FINAL_CHAPTER)).toBeNull();
		if (CHAPTERS.length > 1) {
			expect(getNextChapter(1)).toBe(CHAPTERS[1]);
		}
	});

	it("isChapterComplete 要六台都過關", () => {
		const chapter = CHAPTERS[0];
		const ids = chapter.terminals.map((terminal) => terminal.id);
		expect(isChapterComplete(chapter, ids)).toBe(true);
		expect(isChapterComplete(chapter, ids.slice(1))).toBe(false);
		expect(isChapterComplete(chapter, [...ids, "ch2-t1"])).toBe(true);
	});

	it("chapterTeaches 依序去重", () => {
		expect(chapterTeaches(CHAPTERS[0])).toEqual([
			"pwd",
			"ls",
			"cat",
			"cd",
			"..",
			"ls -l",
			"~",
			"ls -a",
			"Tab",
			"history",
			"clear",
		]);
	});

	it("每章 teaches 的每個項目都查得到說明，回顧卡才不會有空白說明", () => {
		for (const chapter of CHAPTERS) {
			for (const teach of chapterTeaches(chapter)) {
				const baseName = teach.trim().split(/\s+/)[0] ?? teach;
				expect(getTeachDoc(baseName), `第 ${chapter.chapter} 章的「${teach}」查不到說明`).toBeDefined();
			}
		}
	});
});

describe("章節 metadata（meta.ts 與劇本同步）", () => {
	it("CHAPTER_METAS 的章節號與艙區名跟 CHAPTERS 一一對應", () => {
		expect(CHAPTER_METAS.map((meta) => ({ chapter: meta.chapter, deckName: meta.deckName }))).toEqual(
			CHAPTERS.map((chapter) => ({ chapter: chapter.chapter, deckName: chapter.deckName })),
		);
	});

	it("LAST_CHAPTER 等於 FINAL_CHAPTER", () => {
		expect(LAST_CHAPTER).toBe(FINAL_CHAPTER);
	});

	it("NOVA_FIRST_LINE 等於第一章 intro 的第一句", () => {
		expect(NOVA_FIRST_LINE).toBe(chapterOneLifeSupport.intro?.[0]);
	});

	it("meta.ts 不 import 劇本檔，標題頁才不會把六章拉進首載", async () => {
		const source = await readFile(new URL("./meta.ts", import.meta.url), "utf8");
		expect(source).not.toMatch(/from "\.\/(ch\d|index)/);
	});
});

/** 用劇本的 FS、起始目錄、環境變數與程序清單開一台終端機，打一行之後判定是否過關。 */
function runLine(terminalId: string, input: string): { solved: boolean; isError: boolean } {
	const terminal = findTerminal(terminalId);
	if (terminal === undefined) {
		throw new Error(`劇本裡沒有終端機 ${terminalId}`);
	}
	const shell = new Shell({
		fs: VirtualFileSystem.fromSnapshot(terminal.fs),
		terminalId: terminal.id,
		hints: terminal.hints,
		learnedCommands: [],
		cwd: terminal.initialCwd,
		env: terminal.env,
		processes: terminal.processes,
	});
	const execution = shell.execute(input);
	const solved = evaluateObjective(terminal, createObjectiveContext(terminal.id, execution, shell.fs, shell.home));
	return { solved, isError: execution.isError };
}

describe("用 ; 與 && 串起來的一行（M13-2）", () => {
	it("ch1 T2：cd 進去再 cat，用 && 或 ; 一行打完也過關", () => {
		expect(runLine("ch1-t2", "cd power && cat status.txt")).toEqual({ solved: true, isError: false });
		expect(runLine("ch1-t2", "cd /deck1/systems/power ; cat status.txt")).toEqual({ solved: true, isError: false });
	});

	it("ch1 T2：讀完再換目錄，相對路徑照讀檔當下的位置判定", () => {
		expect(runLine("ch1-t2", "cat power/status.txt ; cd ..")).toEqual({ solved: true, isError: false });
	});

	it("ch1 T2：cd 失敗時 && 後面的 cat 不執行，不過關", () => {
		expect(runLine("ch1-t2", "cd pwer && cat /deck1/systems/power/status.txt")).toEqual({
			solved: false,
			isError: true,
		});
	});

	it("ch1 T2：; 串的一行有一段打錯，整行算錯誤、不過關", () => {
		expect(runLine("ch1-t2", "cd pwer ; cat power/status.txt")).toEqual({ solved: false, isError: true });
	});

	it("ch2 T3：grep 沒抓到的鎖定紀錄，不會被同一行 cat 印出來的內容湊成過關", () => {
		expect(runLine("ch2-t3", "grep OPEN door_events.log ; cat door_events.log")).toEqual({
			solved: false,
			isError: false,
		});
		expect(runLine("ch2-t3", "ls ; grep -n LOCK door_events.log")).toEqual({ solved: true, isError: false });
	});

	it("ch4 T3：排序那一段的最後一行對了就過關，後面多接一段不影響", () => {
		expect(runLine("ch4-t3", "sort pointing.log | tail -n 1 ; pwd")).toEqual({ solved: true, isError: false });
	});

	it("ch5 T2：export 之後同一行用 $CAPTAIN_KEY，執行到那一段才展開", () => {
		expect(runLine("ch5-t2", "export CAPTAIN_KEY=CAPT-0417 && cat /deck5/keys/$CAPTAIN_KEY.txt")).toEqual({
			solved: true,
			isError: false,
		});
	});

	it("ch6 T6：發射程序的四個步驟用 && 串成一行也過關", () => {
		const input =
			"chmod +r sealed/launch_code.txt && echo EP-0606-ARGO > launch.txt && export PASSENGERS=1 && kill 47731";
		expect(runLine("ch6-t6", input)).toEqual({ solved: true, isError: false });
	});
});
