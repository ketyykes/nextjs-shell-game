// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import { abinEvidenceFiles } from "@/game/story/abinNotes";
import { CHAPTERS } from ".";
import { CHAPTER_METAS, chapterClockOf } from "./meta";

/** 快照裡每個有寫 mtime 的檔案與目錄的時間。 */
function snapshotMtimes(snapshot: FsSnapshot): string[] {
	return Object.values(snapshot).flatMap((entry) => entryMtimes(entry));
}

function entryMtimes(entry: FsSnapshotEntry): string[] {
	if (typeof entry === "string") {
		return [];
	}
	if (entry.$type === "file") {
		return typeof entry.mtime === "string" ? [entry.mtime] : [];
	}
	if (entry.$type === "dir") {
		const own = typeof entry.mtime === "string" ? [entry.mtime] : [];
		return [...own, ...snapshotMtimes(entry.children as FsSnapshot)];
	}
	return snapshotMtimes(entry as FsSnapshot);
}

describe("章節時鐘（第十九場的 date）", () => {
	it("劇本線索定好的三章：喚醒 08:15、第二章到站 09:12、第四章通訊艙 14:02", () => {
		expect(CHAPTER_METAS[0].clock).toBe("2031-03-12T08:15:00Z");
		expect(CHAPTER_METAS[1].clock).toBe("2031-03-12T09:12:00Z");
		expect(CHAPTER_METAS[3].clock).toBe("2031-03-12T14:02:00Z");
	});

	it("六章都在喚醒那天（除役倒數 82 天的算法），而且依章節順序往後", () => {
		const times = CHAPTER_METAS.map((meta) => Date.parse(meta.clock));
		for (const meta of CHAPTER_METAS) {
			expect(meta.clock).toMatch(/^2031-03-12T\d{2}:\d{2}:\d{2}Z$/);
		}
		for (let index = 1; index < times.length; index += 1) {
			expect(times[index]).toBeGreaterThan(times[index - 1]);
		}
	});

	it.each(CHAPTERS.map((chapter) => [chapter.chapter, chapter] as const))(
		"第 %i 章的時鐘不早於劇本裡任何檔案、程序與回信證據的時間（date 不會比 ls -l 還舊）",
		(chapterNumber, chapter) => {
			const clock = Date.parse(CHAPTER_METAS[chapterNumber - 1].clock);
			const evidence = abinEvidenceFiles("回信").filter((file) => file.terminalId.startsWith(`ch${chapterNumber}-`));
			const times = [
				...chapter.terminals.flatMap((terminal) => snapshotMtimes(terminal.fs)),
				...chapter.terminals.flatMap((terminal) => (terminal.processes ?? []).map((process) => process.started)),
				...evidence.map((file) => file.mtime),
			];

			for (const time of times) {
				expect(Date.parse(time), time).toBeLessThanOrEqual(clock);
			}
		},
	);

	it("chapterClockOf 依終端機 id 取那一章的時鐘", () => {
		expect(chapterClockOf("ch1-t1")).toBe("2031-03-12T08:15:00Z");
		expect(chapterClockOf("ch4-t3")).toBe("2031-03-12T14:02:00Z");
		expect(chapterClockOf("ch6-t5")).toBe(CHAPTER_METAS[5].clock);
	});

	it("chapterClockOf 認不得的 id 用第一章的時鐘", () => {
		expect(chapterClockOf("sandbox")).toBe("2031-03-12T08:15:00Z");
	});
});
