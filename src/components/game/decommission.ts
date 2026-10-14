/**
 * 除役倒數的純函式（設計文件 4.13）：HUD 的倒數與開場 boot log 共用，只 import 型別，標題頁用也不會帶進 store。
 *
 * - 遊戲內的「現在」＝喚醒時間 + 第一章到目前章節的遊玩時間（存檔 `stats` 的 `playTimeMs`），
 *   所以倒數只在玩的時候往下跳；重玩某章會清那章的統計，倒數跟著回到那一章開始的時間點。
 * - 劇本寫的「82 天」是日期相減（3 月 12 日到 6 月 2 日），HUD 顯示的是精確剩餘時間（81 天 20 小時多），兩者對得上。
 * - 前四章只標中性的「站務排程」，第五章 T1 玩家看到 `STATION_MODE=decommission_countdown` 之後才改成「遠端除役」。
 */

import type { PlayStats } from "@/game/store/types";

/** 玩家從 pod_06 醒來的時間（各章劇本的 `WAKE_MTIME`）。 */
export const WAKE_AT = Date.parse("2031-03-12T08:15:00Z");
/** 遠端除役的時間（第五章艦橋登錄台的 `DECOMMISSION_AT`）。 */
export const DECOMMISSION_AT = Date.parse("2031-06-02T04:40:00Z");

/**
 * - `schedule`：第一到四章與第五章 T1 過關前，玩家還不知道它在數什麼。
 * - `decommission`：第五章 T1 過關後與第六章。
 * - `unresponsive`：第六章 T4 終止 NOVA 核心之後，倒數照走，標籤多一句「目標無回應」（不說它死了沒有）。
 * - `hidden`：已逃離，停在片尾之後。
 */
export type CountdownPhase = "schedule" | "decommission" | "unresponsive" | "hidden";
export type VisibleCountdownPhase = Exclude<CountdownPhase, "hidden">;

export const COUNTDOWN_LABELS: Record<VisibleCountdownPhase, string> = {
	schedule: "站務排程",
	decommission: "遠端除役",
	unresponsive: "遠端除役 · 目標無回應",
};

/** 第五章艦橋登錄台：`env` 印出 `STATION_MODE=decommission_countdown` 的那一台。 */
const REVEAL_TERMINAL_ID = "ch5-t1";
/** 第六章 NOVA 核心控制台：`kill -9` 終止 NOVA 核心的那一台。 */
const CORE_KILL_TERMINAL_ID = "ch6-t4";
const REVEAL_CHAPTER = 5;
const CORE_CHAPTER = 6;

const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86_400;

/** 遊戲內已經過了多久（毫秒）時，離除役還剩多少；負數與非數字當沒玩，最低 0。 */
export function remainingMs(elapsedMs: number): number {
	let elapsed = 0;
	if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
		elapsed = elapsedMs;
	}
	return Math.max(0, DECOMMISSION_AT - WAKE_AT - elapsed);
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

/** 剩餘毫秒轉成「T-81d 20:25:00」；不足一秒無條件進位，所以玩滿一秒才少一秒。 */
export function formatCountdown(ms: number): string {
	let totalSeconds = 0;
	if (Number.isFinite(ms) && ms > 0) {
		totalSeconds = Math.ceil(ms / SECOND_MS);
	}
	const days = Math.floor(totalSeconds / DAY_SECONDS);
	const hours = Math.floor((totalSeconds % DAY_SECONDS) / HOUR_SECONDS);
	const minutes = Math.floor((totalSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
	const seconds = totalSeconds % MINUTE_SECONDS;
	return `T-${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** 第一章到 `chapter` 的遊玩時間加總；之後章節的統計不算，沒有統計或數字壞掉的章節當 0。 */
export function elapsedPlayTimeMs(stats: PlayStats, chapter: number): number {
	let total = 0;
	for (let current = 1; current <= chapter; current += 1) {
		const playTimeMs = stats[String(current)]?.playTimeMs;
		if (typeof playTimeMs === "number" && Number.isFinite(playTimeMs) && playTimeMs > 0) {
			total += playTimeMs;
		}
	}
	return total;
}

export interface CountdownPhaseConditions {
	/** PlayScreen 掛載時的章節。 */
	chapter: number;
	solvedTerminals: readonly string[];
	/** 已逃離而且停在片尾之後（`selectIsGameFinished`）。 */
	finished: boolean;
}

/**
 * 倒數目前的階段，只看章節與過關紀錄，重新整理後一樣。
 * 重玩第一到四章時一律回到中性標籤：那一章的劇情時間點玩家還不知道。
 */
export function countdownPhase({ chapter, solvedTerminals, finished }: CountdownPhaseConditions): CountdownPhase {
	if (finished) {
		return "hidden";
	}
	if (chapter >= CORE_CHAPTER) {
		if (solvedTerminals.includes(CORE_KILL_TERMINAL_ID)) {
			return "unresponsive";
		}
		return "decommission";
	}
	if (chapter === REVEAL_CHAPTER && solvedTerminals.includes(REVEAL_TERMINAL_ID)) {
		return "decommission";
	}
	return "schedule";
}
