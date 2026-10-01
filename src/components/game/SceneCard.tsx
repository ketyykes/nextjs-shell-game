"use client";

/**
 * 艙區插圖卡：第一次走進某個艙區，或開場 boot log 結束時，
 * 在畫面中央短暫顯示該場景的插圖與名稱，幾秒後自動淡出。
 * 不攔截任何輸入（pointer-events-none），玩家可以邊看邊走。
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

export interface SceneCardMessage {
	/** 唯一 id，同一張不重播 */
	id: string;
	src: string;
	title: string;
	/** 標題下方的小字，可選 */
	subtitle?: string;
}

export interface SceneCardProps {
	card: SceneCardMessage | null;
	/** 顯示多久後淡出（毫秒），預設 2600 */
	holdMs?: number;
	/** 淡出後呼叫，父層用它清掉 card */
	onShown: (id: string) => void;
}

const DEFAULT_HOLD_MS = 2600;
const FADE_MS = 400;

export function SceneCard({ card, holdMs = DEFAULT_HOLD_MS, onShown }: SceneCardProps) {
	useEffect(() => {
		if (card === null) {
			return;
		}
		const id = card.id;
		const timer = window.setTimeout(() => onShown(id), holdMs + FADE_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [card, holdMs, onShown]);

	return (
		<AnimatePresence>
			{card !== null && (
				<motion.div
					key={card.id}
					className="pointer-events-none fixed inset-0 z-35 flex items-center justify-center bg-black/60 p-8"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: FADE_MS / 1000 }}
					role="img"
					aria-label={`${card.title}的插圖`}
					data-testid="scene-card"
				>
					<div className="flex w-full max-w-3xl flex-col gap-3 border-2 border-game-holo/60 bg-game-bg p-3">
						{/* eslint-disable-next-line @next/next/no-img-element -- 像素插圖不需要 next/image 的最佳化 */}
						<img
							src={card.src}
							alt=""
							width={640}
							height={360}
							className="aspect-video w-full object-cover [image-rendering:pixelated]"
						/>
						<div className="flex items-baseline justify-between px-1 font-terminal">
							<span className="text-2xl text-game-text">{card.title}</span>
							{card.subtitle !== undefined && <span className="text-base text-game-dim">{card.subtitle}</span>}
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
