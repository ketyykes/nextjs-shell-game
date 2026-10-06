"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTypewriter } from "@/components/terminal/useTypewriter";
import type { NovaPortrait } from "@/game/story/flags";
import { TEXT_SPEED_MS, type TextSpeed } from "@/game/store/types";

/**
 * 預留給父層的「跳過目前這則 NOVA 台詞」事件名稱（例如按 Enter）。
 * 目前只是佔位常數，元件本身尚未監聽；之後要實作時，可由父層（或 EventBus）
 * 以這個字串發出事件，再讓 NovaDialogue 收到後直接進入淡出流程。
 */
export const NOVA_SKIP_EVENT = "nova:skip";

/** 每個字額外增加的停留毫秒數。 */
const HOLD_MS_PER_CHAR = 40;
/** 停留時間上限，避免長文字一直擋在畫面上。 */
const HOLD_MS_MAX = 9000;
/** 預設停留毫秒數。 */
const DEFAULT_HOLD_MS = 4000;
/** 進場與離場動畫的秒數，需與下方 motion 設定一致。 */
const FADE_SECONDS = 0.18;
const FADE_MS = FADE_SECONDS * 1000;

export interface NovaMessage {
	/** 唯一 id，同一則不重播 */
	id: string;
	text: string;
}

export interface NovaDialogueProps {
	/** 待顯示的訊息佇列，最前面的先顯示；父層在收到 onShown 後把它移掉 */
	queue: NovaMessage[];
	textSpeed: TextSpeed;
	/** 一則訊息打完字並停留一段時間後呼叫，父層用它推進佇列 */
	onShown: (id: string) => void;
	/** 停留毫秒數，預設 4000；文字長時依字數加長（每字 +40ms），上限 9000 */
	holdMs?: number;
	/** 立繪，預設 `eye`；第六章進核心艙後父層改傳 `core`。 */
	portrait?: NovaPortrait;
}

const PORTRAITS: Record<NovaPortrait, { src: string; alt: string }> = {
	eye: { src: "/scenes/nova-eye.png", alt: "NOVA 的立繪：像瞳孔的像素球體" },
	core: { src: "/scenes/nova-core.png", alt: "NOVA 的本體：損毀的全息多面體" },
};

/**
 * 計算一則訊息打完字後的停留時間：基礎停留 + 每字 40ms，最多 9000ms。
 * 以 code point 計字數，與 useTypewriter 的算法一致。
 */
export function computeHoldMs(text: string, baseHoldMs: number = DEFAULT_HOLD_MS): number {
	const length = Array.from(text).length;
	return Math.min(HOLD_MS_MAX, baseHoldMs + length * HOLD_MS_PER_CHAR);
}

interface NovaBubbleProps {
	text: string;
	/** 目前已顯示的文字 */
	displayed: string;
	isTyping: boolean;
	portrait: NovaPortrait;
}

/** 對話框本體（純呈現）：立繪在左、名字標籤與台詞在右。 */
function NovaBubble({ text, displayed, isTyping, portrait }: NovaBubbleProps) {
	const image = PORTRAITS[portrait];
	return (
		<>
			{/* eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的像素立繪，不需要 next/image 最佳化 */}
			<img
				src={image.src}
				alt={image.alt}
				width={64}
				height={64}
				className="size-16 shrink-0 [image-rendering:pixelated]"
			/>
			<div className="min-w-0 flex-1">
				<div className="text-sm text-game-holo">NOVA</div>
				{/* 螢幕閱讀器讀完整文字，避免逐字朗讀 */}
				<span className="sr-only">{text}</span>
				<p
					aria-hidden="true"
					className="font-terminal text-lg break-words whitespace-pre-wrap text-game-text"
					data-testid="nova-text"
				>
					{displayed}
					{isTyping && (
						<span className="animate-pulse text-game-holo" data-testid="nova-cursor">
							▌
						</span>
					)}
				</p>
			</div>
		</>
	);
}

/**
 * 地圖上的 NOVA 對話框（設計文件 4.9）：右下角固定位置，不攔截指標事件、不打斷操作。
 *
 * 一次只顯示 `queue[0]`：逐字打完 → 停留 → 淡出，淡出結束後呼叫 `onShown(id)`，
 * 由父層把該則從佇列移掉，下一則才會出現。
 */
export function NovaDialogue({
	queue,
	textSpeed,
	onShown,
	holdMs = DEFAULT_HOLD_MS,
	portrait = "eye",
}: NovaDialogueProps) {
	const current = queue[0];
	const currentId = current?.id;
	const currentText = current?.text ?? "";

	const displayed = useTypewriter(currentText, TEXT_SPEED_MS[textSpeed]);
	const isTyping = current !== undefined && displayed !== currentText;

	// 已進入淡出階段的訊息 id；與目前訊息相同時，AnimatePresence 會播離場動畫
	const [leavingId, setLeavingId] = useState<string | null>(null);

	// 用 ref 保存最新的 onShown，避免父層每次 render 傳新函式而重設計時器
	const onShownRef = useRef(onShown);
	useEffect(() => {
		onShownRef.current = onShown;
	}, [onShown]);

	// 打完字後等待停留時間，再進入淡出
	const hasFinishedTyping = current !== undefined && !isTyping;
	useEffect(() => {
		if (currentId === undefined || !hasFinishedTyping) {
			return;
		}
		const timer = setTimeout(() => {
			setLeavingId(currentId);
		}, computeHoldMs(currentText, holdMs));
		return () => {
			clearTimeout(timer);
		};
	}, [currentId, currentText, hasFinishedTyping, holdMs]);

	// 進入淡出後，等離場動畫的時間再通知父層。
	// 以計時器對齊動畫時長，而不依賴 motion 的完成回呼：
	// jsdom 與假計時器下 motion 的動畫不一定會跑完，計時器則一定可預期。
	useEffect(() => {
		if (leavingId === null || leavingId !== currentId) {
			return;
		}
		const timer = setTimeout(() => {
			onShownRef.current(leavingId);
		}, FADE_MS);
		return () => {
			clearTimeout(timer);
		};
	}, [leavingId, currentId]);

	const visible = current !== undefined && leavingId !== current.id;

	return (
		// wait：舊訊息完全離場後新訊息才進場，避免兩個對話框疊在一起
		<AnimatePresence mode="wait">
			{visible && (
				<motion.div
					key={current.id}
					role="status"
					aria-live="polite"
					data-testid="nova-dialogue"
					className="pointer-events-none fixed right-6 bottom-32 z-30 lg:bottom-6 flex w-[28rem] max-w-[calc(100vw-3rem)] items-start gap-3 border-l-[3px] border-game-holo bg-game-bg/90 p-3"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: FADE_SECONDS }}
				>
					<NovaBubble text={current.text} displayed={displayed} isTyping={isTyping} portrait={portrait} />
				</motion.div>
			)}
		</AnimatePresence>
	);
}
