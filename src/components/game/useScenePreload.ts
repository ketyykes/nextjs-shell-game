"use client";

/**
 * 進 `/play` 就在背景預載本章的艙區插圖與結尾過場（審計 A3）。
 *
 * 插圖卡在第一次走進艙區時才掛 `<img>`，沒預載的話慢網路會先空白再跳圖。
 * 第一間房的 `room:enter` 跟 `scene:ready` 幾乎同時發生，所以掛載就排、不等 `scene:ready`；
 * 從標題流程進來的話標題那邊已經排過，共用佇列會略過載過的圖。
 * 佇列一次一張、低優先，不跟 Phaser Preloader 的 tileset、地圖、sprite 搶連線。
 */

import { useEffect } from "react";
import { chapterSceneImages } from "@/game/story/scenes";
import { preloadImages, scheduleIdle } from "@/lib/preload";

export function useScenePreload(chapter: number): void {
	useEffect(() => {
		return scheduleIdle(() => {
			preloadImages(chapterSceneImages(chapter));
		});
	}, [chapter]);
}
