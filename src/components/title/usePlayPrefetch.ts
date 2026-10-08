"use client";

/**
 * 標題流程期間預先抓進 `/play` 要用的東西（審計 A1、A3）。
 *
 * 玩家在標題、選角、boot log 停留的那段時間網路是閒的，先把 `/play` 的 RSC 與 JS、
 * Phaser 引擎 chunk 抓進快取，按「繼續」或看完開場插圖時就不用從頭下載；
 * 引擎排完再接著背景預載要進的那一章的插圖（第一章含 boot log 之後的開場插圖）。
 * Phaser 模組評估會佔主執行緒，所以等標題的淡入動畫（0.6 秒）跑完、再排進閒置時段才開始。
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { preloadPhaserGame } from "@/components/game/preloadPhaserGame";
import { openingSceneImages } from "@/game/story/scenes";
import { preloadImages, scheduleIdle } from "@/lib/preload";

/** 掛載後等這麼久才開始預取，避開標題的淡入動畫。 */
export const PLAY_PREFETCH_DELAY_MS = 1000;

/** `chapter` 是按「繼續」或走完開場後會進的章節，也就是存檔的目前章節。 */
export function usePlayPrefetch(chapter: number): void {
	const router = useRouter();

	useEffect(() => {
		let cancelled = false;
		const cancelIdle = scheduleIdle(
			() => {
				router.prefetch("/play");
				void preloadPhaserGame().then(() => {
					// 章節在引擎下載期間變了（例如新遊戲清回第一章），就不載舊章節的圖
					if (!cancelled) {
						preloadImages(openingSceneImages(chapter));
					}
				});
			},
			{ delayMs: PLAY_PREFETCH_DELAY_MS },
		);
		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, [router, chapter]);
}
