"use client";

/**
 * 標題流程期間預先抓 `/play` 的路由與 Phaser 引擎（審計 A1）。
 *
 * 玩家在標題、選角、boot log 停留的那段時間網路是閒的，先把 `/play` 的 RSC 與 JS、
 * Phaser 引擎 chunk 抓進快取，按「繼續」或看完開場插圖時就不用從頭下載。
 * Phaser 模組評估會佔主執行緒，所以等標題的淡入動畫（0.6 秒）跑完、再排進閒置時段才開始。
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { preloadPhaserGame } from "@/components/game/preloadPhaserGame";
import { scheduleIdle } from "@/lib/preload";

/** 掛載後等這麼久才開始預取，避開標題的淡入動畫。 */
export const PLAY_PREFETCH_DELAY_MS = 1000;

export function usePlayPrefetch(): void {
	const router = useRouter();

	useEffect(() => {
		return scheduleIdle(
			() => {
				router.prefetch("/play");
				void preloadPhaserGame();
			},
			{ delayMs: PLAY_PREFETCH_DELAY_MS },
		);
	}, [router]);
}
