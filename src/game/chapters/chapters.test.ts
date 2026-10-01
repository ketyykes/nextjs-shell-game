// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTER_COUNT } from "@/game/phaser/events";
import { deckTerminals } from "@/game/story/decks";
import { CHAPTERS, chapterTeaches, FINAL_CHAPTER, findTerminal, getChapter, getNextChapter, isChapterComplete } from "./index";

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
		expect(chapterTeaches(CHAPTERS[0])).toEqual(["pwd", "ls", "cat", "cd", "ls -l", "cd ~", "ls -a", "history", "clear"]);
	});
});
