"use client";

import { useLayoutEffect, useRef } from "react";
import type Phaser from "phaser";
import { startGame } from "@/game/phaser/main";
import type { CharacterId } from "@/game/store/types";
import { cn } from "@/lib/utils";

export interface PhaserGameProps {
	/** 玩家選擇的角色，變動時會銷毀並重建遊戲 */
	character: CharacterId;
	className?: string;
	/** 遊戲建立後呼叫，整合者用來拿 game 實例（例如之後要 pause） */
	onGameCreated?: (game: Phaser.Game) => void;
}

/**
 * 在 React 裡建立與銷毀 Phaser 遊戲的容器元件。
 * 只能在瀏覽器端執行，請透過 `PhaserGameDynamic`（next/dynamic + ssr: false）載入。
 */
export function PhaserGame({ character, className, onGameCreated }: PhaserGameProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef<Phaser.Game | null>(null);
	const onGameCreatedRef = useRef(onGameCreated);

	// 保存最新的 callback，避免它變動時觸發遊戲重建
	useLayoutEffect(() => {
		onGameCreatedRef.current = onGameCreated;
	}, [onGameCreated]);

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
			const game = startGame(container, { character });
			gameRef.current = game;
			onGameCreatedRef.current?.(game);
		});

		// character 變動時 cleanup 也會先跑，確保舊遊戲先銷毀再用新選角重建。
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			const game = gameRef.current;
			if (game) {
				game.destroy(true);
				gameRef.current = null;
			}
		};
	}, [character]);

	return <div ref={containerRef} className={cn("relative", className)} data-testid="phaser-container" />;
}
