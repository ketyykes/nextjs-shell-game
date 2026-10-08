"use client";

/**
 * 每章遊玩時間的計時（M14-1）：只算 /play 在前景可見、而且呼叫端說「正在玩」的時間，累計進 store 的 `stats`。
 *
 * - 「正在玩」由呼叫端決定（PlayScreen：這章還沒全解、暫停與設定選單都沒開）。
 * - 分頁切到背景（`visibilitychange` 變 hidden）就停，回到前景再接著算。
 * - 每 `PLAY_TIME_FLUSH_MS` 寫一次 store，切成不計時、卸載、`pagehide`（換章整頁重載、關分頁）時把剩下的寫進去；
 *   不每秒寫，因為 persist 每次 `set` 都把整份存檔序列化進 localStorage。
 * - 兩次寫入之間超過 `MAX_PLAY_TIME_STEP_MS` 只算上限：電腦睡眠時分頁可能仍是 visible，牆上時鐘卻跳了好幾小時。
 *
 * 只能在讀檔完成後掛載（store 的規則：讀檔前不要呼叫 action）。
 */

import { useEffect } from "react";
import { useGameStore } from "@/game/store";

/** 多久把累計的時間寫進 store 一次。 */
export const PLAY_TIME_FLUSH_MS = 30_000;
/** 兩次寫入之間最多算多少，超過視為電腦睡眠或計時器被凍結。 */
export const MAX_PLAY_TIME_STEP_MS = 120_000;

export function usePlayTime(chapter: number, active: boolean): void {
	useEffect(() => {
		if (!active) {
			return;
		}

		let startedAt: number | null = null;

		const start = () => {
			if (startedAt === null && document.visibilityState === "visible") {
				startedAt = Date.now();
			}
		};
		const flush = () => {
			if (startedAt === null) {
				return;
			}
			const now = Date.now();
			const elapsed = Math.min(now - startedAt, MAX_PLAY_TIME_STEP_MS);
			startedAt = now;
			useGameStore.getState().addPlayTime(chapter, elapsed);
		};
		const stop = () => {
			flush();
			startedAt = null;
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				start();
				return;
			}
			stop();
		};

		start();
		const timer = window.setInterval(flush, PLAY_TIME_FLUSH_MS);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", stop);

		return () => {
			stop();
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", stop);
		};
	}, [active, chapter]);
}
