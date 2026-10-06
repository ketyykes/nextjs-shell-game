"use client";

import { useLayoutEffect, useRef } from "react";
import type Phaser from "phaser";
import type { SolvedEffect } from "@/game/phaser/events";
import { startGame } from "@/game/phaser/main";
import type { CharacterId } from "@/game/store/types";
import { cn } from "@/lib/utils";

export interface PhaserGameProps {
	/** 玩家選擇的角色，變動時會銷毀並重建遊戲 */
	character: CharacterId;
	/** 目前章節（1 到 6），決定載入哪一張甲板地圖；變動時會銷毀並重建遊戲 */
	chapter: number;
	/** 建立當下是否斷電（只有角色周圍一圈光），省略等同 false；之後變動不會重建遊戲 */
	startDark?: boolean;
	/** 建立當下的終端機過關演出表，省略等同空物件；之後變動不會重建遊戲 */
	terminalEffects?: Readonly<Record<string, SolvedEffect>>;
	/** 建立當下已過關的終端機，Station 用它直接套最終狀態（燈亮、門開）不播動畫；之後變動不會重建遊戲 */
	solvedTerminals?: readonly string[];
	/** 建立當下的音量（0 到 1）與靜音；之後的變動走 `audio:settings` 事件，不會重建遊戲 */
	volume?: number;
	muted?: boolean;
	/** 建立當下的角色位置（存檔裡這一章的），省略就從地圖出生點開始；之後變動不會重建遊戲 */
	spawnPoint?: { x: number; y: number } | null;
	/** 建立當下的「閃爍」設定；之後的變動走 `effects:settings` 事件，不會重建遊戲 */
	flickerEnabled?: boolean;
	className?: string;
	/** 遊戲建立後呼叫，整合者用來拿 game 實例（例如之後要 pause） */
	onGameCreated?: (game: Phaser.Game) => void;
}

/**
 * 在 React 裡建立與銷毀 Phaser 遊戲的容器元件。
 * 只能在瀏覽器端執行，請透過 `PhaserGameDynamic`（next/dynamic + ssr: false）載入。
 */
export function PhaserGame({
	character,
	chapter,
	startDark,
	terminalEffects,
	solvedTerminals,
	volume,
	muted,
	spawnPoint,
	flickerEnabled,
	className,
	onGameCreated,
}: PhaserGameProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef<Phaser.Game | null>(null);
	const onGameCreatedRef = useRef(onGameCreated);
	const solvedTerminalsRef = useRef(solvedTerminals);
	const audioRef = useRef({ volume, muted });
	const flickerEnabledRef = useRef(flickerEnabled);
	const sceneSetupRef = useRef({ startDark, terminalEffects, spawnPoint });

	// 保存最新的 callback、過關清單、場景初始設定與音訊設定，避免它們變動時觸發遊戲重建
	useLayoutEffect(() => {
		onGameCreatedRef.current = onGameCreated;
		solvedTerminalsRef.current = solvedTerminals;
		audioRef.current = { volume, muted };
		flickerEnabledRef.current = flickerEnabled;
		sceneSetupRef.current = { startDark, terminalEffects, spawnPoint };
	}, [onGameCreated, solvedTerminals, volume, muted, flickerEnabled, startDark, terminalEffects, spawnPoint]);

	useLayoutEffect(() => {
		// Phaser 會碰 window，保險起見只在瀏覽器端建立
		if (typeof window === "undefined") {
			return;
		}
		const container = containerRef.current;
		if (!container) {
			return;
		}

		// 延後一幀才建立：React StrictMode 開發時會 mount -> unmount -> mount，
		// 第一次 mount 的 cleanup 會在這一幀之內跑，直接取消排程，第一個遊戲根本不會被建出來。
		// Phaser 的 `destroy()` 是排到下一個 step 才真的拆掉 canvas，若同步建立再立刻 destroy，
		// 第二個遊戲會先 boot，第一個的 canvas 會殘留在容器裡變成兩層。
		let cancelled = false;
		const frame = window.requestAnimationFrame(() => {
			if (cancelled || gameRef.current) {
				return;
			}
			const game = startGame(container, {
				character,
				chapter,
				startDark: sceneSetupRef.current.startDark ?? false,
				terminalEffects: sceneSetupRef.current.terminalEffects ?? {},
				solvedTerminals: solvedTerminalsRef.current ?? [],
				volume: audioRef.current.volume,
				muted: audioRef.current.muted,
				spawnPoint: sceneSetupRef.current.spawnPoint ?? null,
				flickerEnabled: flickerEnabledRef.current ?? true,
			});
			gameRef.current = game;
			onGameCreatedRef.current?.(game);
		});

		// character 或 chapter 變動時 cleanup 也會先跑，確保舊遊戲先銷毀再用新選角或新章節重建。
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			const game = gameRef.current;
			if (game) {
				game.destroy(true);
				gameRef.current = null;
			}
		};
	}, [character, chapter]);

	return <div ref={containerRef} className={cn("relative", className)} data-testid="phaser-container" />;
}
