/**
 * 章節註冊表：六章劇本依序排好，PlayScreen 用 `getChapter(progress.chapter)` 取目前章節，
 * `findTerminal(id)` 跨章節找終端機（id 以 `ch<n>-` 開頭，不會撞名）。
 *
 * 新增章節：寫好 `ch<n>-*.ts` 後加進 `CHAPTERS`，`chapters.test.ts` 會檢查編號連續、終端機 id 唯一、
 * 每章六台的 id／標題／艙區跟 `decks.ts` 與地圖 markers 一致。
 */

import { chapterOneLifeSupport } from "./ch1-life-support";
import { chapterTwoDataCenter } from "./ch2-datacenter";
import { chapterThreeEngineering } from "./ch3-engineering";
import { chapterFourComms } from "./ch4-comms";
import { chapterFiveBridge } from "./ch5-bridge";
import { chapterSixNovaCore } from "./ch6-nova-core";
import type { ChapterDefinition, TerminalDefinition } from "./types";

/** 全部章節，index 0 是第一章。 */
export const CHAPTERS: readonly ChapterDefinition[] = [
	chapterOneLifeSupport,
	chapterTwoDataCenter,
	chapterThreeEngineering,
	chapterFourComms,
	chapterFiveBridge,
	chapterSixNovaCore,
];

/** 最後一章的章節號，過關後顯示片尾而不是「進入下一章」。 */
export const FINAL_CHAPTER = CHAPTERS[CHAPTERS.length - 1].chapter;

/** 依章節號取劇本；超出範圍（例如舊存檔的章節號比劇本多）回傳最後一章。 */
export function getChapter(chapter: number): ChapterDefinition {
	const found = CHAPTERS.find((item) => item.chapter === chapter);
	if (found !== undefined) {
		return found;
	}
	return CHAPTERS[CHAPTERS.length - 1];
}

/** 下一章的劇本，已是最後一章回傳 null。 */
export function getNextChapter(chapter: number): ChapterDefinition | null {
	return CHAPTERS.find((item) => item.chapter === chapter + 1) ?? null;
}

/** 依 id 跨章節找終端機定義，找不到回傳 undefined。 */
export function findTerminal(id: string): TerminalDefinition | undefined {
	for (const chapter of CHAPTERS) {
		const terminal = chapter.terminals.find((item) => item.id === id);
		if (terminal !== undefined) {
			return terminal;
		}
	}
	return undefined;
}

/** 某章全部終端機都過關了沒。 */
export function isChapterComplete(chapter: ChapterDefinition, solvedTerminals: readonly string[]): boolean {
	return chapter.terminals.every((terminal) => solvedTerminals.includes(terminal.id));
}

/** 這一章教的指令（依終端機順序、去重），章節結束的回顧卡用；`teaches` 可能是 `ls -a` 這種帶旗標的字串。 */
export function chapterTeaches(chapter: ChapterDefinition): string[] {
	const result: string[] = [];
	for (const terminal of chapter.terminals) {
		for (const teach of terminal.teaches) {
			if (!result.includes(teach)) {
				result.push(teach);
			}
		}
	}
	return result;
}

export {
	chapterOneLifeSupport,
	chapterTwoDataCenter,
	chapterThreeEngineering,
	chapterFourComms,
	chapterFiveBridge,
	chapterSixNovaCore,
};
