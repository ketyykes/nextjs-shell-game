"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface FlickerPromptPanelProps {
	/** 系統設定了 `prefers-reduced-motion: reduce`，多一句說明。 */
	reducedMotion: boolean;
	/** 玩家選定：false 是「關閉閃爍效果」、true 是「保留閃爍效果」。 */
	onChoose: (flickerEnabled: boolean) => void;
}

/** 選項順序：關閉在左（預設選取）、保留在右。 */
const TURN_OFF_INDEX = 0;
const KEEP_INDEX = 1;

/**
 * 第一次進遊戲的光敏確認（設計文件 4.20、審計 A33）：疊在標題畫面上，問要不要關閉閃爍效果。
 *
 * - 預設選取「關閉閃爍效果」，連按 Enter 得到的是比較安全的那一邊。
 * - ←→ 或 ↑↓ 切換、Enter 確定；Esc 不關，一定要選一個（選完才寫進設定，之後不再問）。
 * - 整合者要在它開著時停用標題選單的鍵盤，觸控裝置提示也要等它選完才出現。
 */
export function FlickerPromptPanel({ reducedMotion, onChoose }: FlickerPromptPanelProps) {
	const titleId = useId();
	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: 2,
		orientation: "both",
		initialIndex: TURN_OFF_INDEX,
		loop: false,
		onConfirm: (index) => {
			onChoose(index === KEEP_INDEX);
		},
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
			<motion.div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				data-testid="flicker-prompt"
				initial={{ opacity: 0, scaleY: 0.6 }}
				animate={{ opacity: 1, scaleY: 1 }}
				transition={{ duration: 0.12 }}
				className="flex w-full max-w-lg flex-col items-center gap-4 border-2 border-game-amber bg-game-bg px-6 py-5 text-center font-terminal"
			>
				<h2 id={titleId} className="text-2xl text-game-amber">
					光敏提醒
				</h2>
				<p className="text-xl text-game-text">
					本遊戲有燈光閃爍與畫面閃動的效果。光敏體質、或曾因閃光感到不適的人，建議關閉閃爍效果；之後在設定選單隨時可以改。
				</p>
				{reducedMotion && <p className="text-lg text-game-holo">偵測到你的系統設定了減少動態效果。</p>}
				<div className="flex flex-wrap justify-center gap-6">
					<MenuOption
						selected={selectedIndex === TURN_OFF_INDEX}
						onHover={() => setSelectedIndex(TURN_OFF_INDEX)}
						onClick={() => onChoose(false)}
					>
						關閉閃爍效果
					</MenuOption>
					<MenuOption
						selected={selectedIndex === KEEP_INDEX}
						onHover={() => setSelectedIndex(KEEP_INDEX)}
						onClick={() => onChoose(true)}
					>
						保留閃爍效果
					</MenuOption>
				</div>
				<p className="text-base text-game-prompt">←→ 選擇 · Enter 確認</p>
			</motion.div>
		</div>
	);
}
