/**
 * 遊玩統計的顯示小工具（M14-1）：章節結束畫面的「本章紀錄」與標題的「通關紀錄」共用。
 * 純函式、只 import 型別，標題頁用也不會帶進 zustand 或劇本。
 */

import type { ChapterStats, PlayStats } from "./types";

const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3600;

/** 遊玩時間轉成「45 秒」「12 分 30 秒」「1 小時 2 分」，不足一秒的捨去；負數與非數字當 0。 */
export function formatPlayTime(ms: number): string {
	let totalSeconds = 0;
	if (Number.isFinite(ms) && ms > 0) {
		totalSeconds = Math.floor(ms / SECOND_MS);
	}

	if (totalSeconds >= HOUR_SECONDS) {
		const hours = Math.floor(totalSeconds / HOUR_SECONDS);
		const minutes = Math.floor((totalSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
		return `${hours} 小時 ${minutes} 分`;
	}
	if (totalSeconds >= MINUTE_SECONDS) {
		const minutes = Math.floor(totalSeconds / MINUTE_SECONDS);
		const seconds = totalSeconds % MINUTE_SECONDS;
		return `${minutes} 分 ${seconds} 秒`;
	}
	return `${totalSeconds} 秒`;
}

/** 所有章節的統計加總。 */
export function totalStats(stats: PlayStats): ChapterStats {
	const total: ChapterStats = { playTimeMs: 0, errors: 0, hints: 0 };
	for (const chapterStats of Object.values(stats)) {
		total.playTimeMs += chapterStats.playTimeMs;
		total.errors += chapterStats.errors;
		total.hints += chapterStats.hints;
	}
	return total;
}
