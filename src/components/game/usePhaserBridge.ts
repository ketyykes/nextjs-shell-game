"use client";

import { useEffect, useEffectEvent } from "react";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventMap, RoomId, SolvedEffect } from "@/game/phaser/events";
import type { ChapterDefinition } from "@/game/story";
import type { SettingsState } from "@/game/store/types";

/** 這一章有演出的終端機 → 演出種類，經 registry 交給 Station。 */
export function collectTerminalEffects(chapter: ChapterDefinition): Record<string, SolvedEffect> {
	const effects: Record<string, SolvedEffect> = {};
	for (const terminal of chapter.terminals) {
		if (terminal.effect !== undefined) {
			effects[terminal.id] = terminal.effect;
		}
	}
	return effects;
}

export interface UsePhaserBridgeOptions {
	/** 音量、靜音與閃爍設定，變動時即時同步給 Phaser。 */
	settings: Pick<SettingsState, "volume" | "muted" | "flickerEnabled">;
	/** 玩家在終端機旁按 E。 */
	onTerminalOpen: (terminalId: string) => void;
	/** 玩家走進或離開終端機互動區，離開是 null。 */
	onTerminalNearby: (terminalId: string | null) => void;
	/** Station 場景建立完成。 */
	onSceneReady: () => void;
	/** 角色走動後停下（只在艙區內）。 */
	onPlayerStopped: (position: GameEventMap["player:stopped"]) => void;
	/** 玩家走進某個艙區。 */
	onRoomEnter: (roomId: RoomId) => void;
}

/**
 * PlayScreen 與 Phaser 之間的接線（設計文件 3.1）：
 *
 * - Phaser → React：`terminal:open`、`terminal:nearby`、`scene:ready`、`player:stopped`、`room:enter` 五個訂閱，
 *   在掛載時訂一次、卸載時退訂。handler 用 `useEffectEvent` 包起來，永遠呼叫最新的版本，
 *   所以呼叫端傳 inline 函式也不會讓訂閱每次 render 拆掉重掛（審計 A4）。
 * - React → Phaser：設定的音量、靜音、閃爍變動時發 `audio:settings`、`effects:settings`。
 * - 開發模式掛 `window.__kepler9.emit` 除錯鉤子（#7），正式 build 不掛。
 */
export function usePhaserBridge({
	settings,
	onTerminalOpen,
	onTerminalNearby,
	onSceneReady,
	onPlayerStopped,
	onRoomEnter,
}: UsePhaserBridgeOptions): void {
	const handleTerminalOpen = useEffectEvent(onTerminalOpen);
	const handleTerminalNearby = useEffectEvent(onTerminalNearby);
	const handleSceneReady = useEffectEvent(onSceneReady);
	const handlePlayerStopped = useEffectEvent(onPlayerStopped);
	const handleRoomEnter = useEffectEvent(onRoomEnter);

	// 開發模式的除錯鉤子：在瀏覽器 console 用 window.__kepler9.emit("puzzle:solved", { terminalId: "ch1-t4" }) 可直接觸發演出
	useEffect(() => {
		if (process.env.NODE_ENV === "production") {
			return;
		}
		const devWindow = window as Window & { __kepler9?: { emit: typeof emitGameEvent } };
		devWindow.__kepler9 = { emit: emitGameEvent };
		return () => {
			delete devWindow.__kepler9;
		};
	}, []);

	// Phaser → React 的事件：只在掛載時訂一次
	useEffect(() => {
		const unsubscribers = [
			onGameEvent("terminal:open", ({ terminalId }) => handleTerminalOpen(terminalId)),
			onGameEvent("terminal:nearby", ({ terminalId }) => handleTerminalNearby(terminalId)),
			onGameEvent("scene:ready", () => handleSceneReady()),
			onGameEvent("player:stopped", (position) => handlePlayerStopped(position)),
			onGameEvent("room:enter", ({ roomId }) => handleRoomEnter(roomId)),
		];
		return () => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
		};
	}, []);

	// 設定選單改音量或靜音時即時通知 Phaser 的 AudioManager
	useEffect(() => {
		emitGameEvent("audio:settings", { volume: settings.volume, muted: settings.muted });
	}, [settings.muted, settings.volume]);

	// 設定選單切換閃爍時即時通知 Phaser（人影、鏡頭震動與閃光、燈閃）
	useEffect(() => {
		emitGameEvent("effects:settings", { flickerEnabled: settings.flickerEnabled });
	}, [settings.flickerEnabled]);
}
