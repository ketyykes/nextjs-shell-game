"use client";

/**
 * 左下角的「目前目標」面板（設計文件第 5 節）。
 *
 * 純展示元件：目前是哪個目標、是否剛過關都由父層決定，
 * 過關後父層過幾秒再把 `title` 換成下一個目標。
 */

import { motion } from "motion/react";

export interface ObjectivePanelProps {
	/** 目前目標的一句話；null 代表沒有目標（例如章節結束） */
	title: string | null;
	description?: string;
	/** 剛過關時 true，面板打勾並變青綠，父層幾秒後切到下一個目標 */
	solved: boolean;
	/** 已過關 / 總數，例如 2/6，顯示成小字 */
	progress?: { solved: number; total: number };
}

export function ObjectivePanel({ title, description, solved, progress }: ObjectivePanelProps) {
	const checkbox = solved ? "☑" : "☐";
	const titleColorClass = solved ? "text-game-success" : "text-game-text";

	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="objective-panel"
			className="pointer-events-none absolute bottom-6 left-6 w-80 border border-game-dim bg-game-bg/85 px-4 py-3 font-terminal"
		>
			<div className="flex items-baseline justify-between text-base text-game-dim">
				<span>目前目標</span>
				{progress !== undefined && (
					<span data-testid="objective-progress">
						{progress.solved}/{progress.total}
					</span>
				)}
			</div>

			{title === null ? (
				<div className="mt-1 text-xl text-game-dim">目前沒有目標</div>
			) : (
				// 以標題當 key：標題一換就重新掛載，做 200ms 淡入；過關時再閃一下
				<motion.div
					key={title}
					className={`mt-1 origin-left text-xl ${titleColorClass}`}
					initial={{ opacity: 0, scale: 1 }}
					animate={solved ? { opacity: 1, scale: [1, 1.03, 1] } : { opacity: 1, scale: 1 }}
					transition={{ duration: 0.2 }}
					data-testid="objective-title"
				>
					<span data-testid="objective-checkbox">{checkbox}</span> {title}
				</motion.div>
			)}

			{title !== null && description !== undefined && description !== "" && (
				<div className="mt-1 text-base text-game-dim">{description}</div>
			)}
		</div>
	);
}
