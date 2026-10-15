"use client";

import { useEffect, useRef } from "react";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import { heartbeatFor, type HeartbeatLevel } from "./lowOxygen";

const SILENT: HeartbeatLevel = { active: false, intensity: 0 };

/**
 * 低氧心跳（設計文件 4.25）：依氧氣發 `audio:heartbeat`，Phaser 的 AudioManager 照著循環播放、調音量或停。
 *
 * - 跨過 20% 或氧氣在 20% 以下變動時才發；20% 以上一直都是「不播」，不重複發。
 * - Station 建好時會發 `scene:ready`，那一刻補發目前的狀態：讀存檔進來時 React 比 Phaser 先掛好，第一次發的沒人收。
 * - 卸載（回標題、換章是整頁重載）時發停止；Station 自己關閉時也會把 sound 整批銷毀，兩邊都清得乾淨。
 * 只在主線 `/play` 用，沙盒沒有氧氣。
 */
export function useHeartbeat(oxygen: number): void {
	const { active, intensity } = heartbeatFor(oxygen);
	const latestRef = useRef<HeartbeatLevel>(SILENT);

	useEffect(() => {
		latestRef.current = { active, intensity };
		emitGameEvent("audio:heartbeat", { active, intensity });
	}, [active, intensity]);

	useEffect(() => {
		const unsubscribe = onGameEvent("scene:ready", () => {
			emitGameEvent("audio:heartbeat", { ...latestRef.current });
		});
		return () => {
			unsubscribe();
			emitGameEvent("audio:heartbeat", { ...SILENT });
		};
	}, []);
}
