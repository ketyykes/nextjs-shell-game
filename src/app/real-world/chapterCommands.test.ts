// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "@/game/chapters";
import { CHAPTER_COMMANDS } from "./chapterCommands";

/** 某章所有終端機的 teaches，依教的順序、去重。 */
function teachesOf(chapter: number): string[] {
	const definition = CHAPTERS.find((item) => item.chapter === chapter);
	const items: string[] = [];
	for (const terminal of definition?.terminals ?? []) {
		for (const teach of terminal.teaches) {
			if (!items.includes(teach)) {
				items.push(teach);
			}
		}
	}
	return items;
}

describe("真實世界橋接頁的指令清單（設計文件 4.20）", () => {
	it("六章都列到，章節號照順序", () => {
		expect(CHAPTER_COMMANDS.map((entry) => entry.chapter)).toEqual(CHAPTERS.map((chapter) => chapter.chapter));
	});

	it.each(CHAPTERS.map((chapter) => chapter.chapter))("第 %i 章列的就是那一章終端機教的，一個不多一個不少", (chapter) => {
		const entry = CHAPTER_COMMANDS.find((item) => item.chapter === chapter);
		expect(entry?.items).toEqual(teachesOf(chapter));
	});
});
