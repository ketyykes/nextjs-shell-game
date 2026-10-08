"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import styles from "./TerminalFrame.module.css";

export interface TerminalFrameProps {
	/** 終端機名稱，顯示在標題列。 */
	title: string;
	/** 已學指令，顯示在底部列。 */
	learnedCommands: string[];
	/** 不給就不顯示「[Esc] 關閉」（例如 boot log 這種不能關的過場）。 */
	onClose?: () => void;
	/** 隱藏「已學／提示：輸入 hint」底部列（不能打字的過場畫面用，免得誤導）。 */
	hideFooter?: boolean;
	/** 這台終端機已過關時 true，標題列標「已完成」。 */
	solved?: boolean;
	children: ReactNode;
}

/** CRT 開機縮放動畫的秒數，關閉時反過來播。 */
const CRT_DURATION_SECONDS = 0.18;

/**
 * 終端機彈窗外框：像素 9-slice 邊框、標題列、底部列與 CRT 開關機動畫。
 * 高度由父層決定，內容區是 flex column，子元素自己決定誰要 `flex-1`。
 */
export function TerminalFrame({
	title,
	learnedCommands,
	onClose,
	hideFooter = false,
	solved = false,
	children,
}: TerminalFrameProps) {
	let learnedText = "（過關後記錄）";
	if (learnedCommands.length > 0) {
		learnedText = learnedCommands.join(" ");
	}

	return (
		<motion.div
			role="dialog"
			aria-label={title}
			initial={{ scaleY: 0.01, opacity: 0.6 }}
			animate={{ scaleY: 1, opacity: 1 }}
			exit={{ scaleY: 0.01, opacity: 0 }}
			transition={{ duration: CRT_DURATION_SECONDS, ease: "easeOut" }}
			className={cn(
				styles.frame,
				"flex h-full w-full max-w-4xl flex-col bg-game-bg font-terminal text-lg text-game-text",
			)}
		>
			<div className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-game-holo/40 px-3 py-1">
				<div className="flex min-w-0 items-baseline gap-3">
					<h2 className="truncate text-game-holo">{title}</h2>
					{solved && (
						<span className="shrink-0 text-game-success" data-testid="terminal-solved-badge">
							☑ 已完成
						</span>
					)}
				</div>
				{onClose !== undefined && (
					<button
						type="button"
						aria-label="關閉終端機"
						onClick={onClose}
						className="shrink-0 cursor-pointer text-game-dim transition-colors hover:text-game-amber focus-visible:text-game-amber focus-visible:outline-none"
					>
						[Esc] 關閉
					</button>
				)}
			</div>

			<div className="flex min-h-0 flex-1 flex-col">{children}</div>

			{!hideFooter && (
				<div className="flex shrink-0 items-center justify-between gap-4 border-t-2 border-game-holo/40 px-3 py-1 text-game-dim">
					<span className="truncate">{`已學：${learnedText}`}</span>
					<span className="shrink-0">提示：輸入 hint</span>
				</div>
			)}
		</motion.div>
	);
}
