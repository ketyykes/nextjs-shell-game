"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface TouchWarningPanelProps {
	/** 「仍要繼續」、Enter 或 Esc。 */
	onDismiss: () => void;
}

/**
 * 觸控裝置的提示（設計文件 4.6、4.7）：疊在標題畫面上，說明本遊戲需要實體鍵盤。
 *
 * 只提示不擋人：接了實體鍵盤的平板也會被判成觸控裝置，所以一定要能略過。
 * 只有一個選項，Enter 與 Esc 都等同「仍要繼續」；整合者要在它開著時停用標題選單的鍵盤。
 */
export function TouchWarningPanel({ onDismiss }: TouchWarningPanelProps) {
	const titleId = useId();
	useMenuNavigation({ itemCount: 1, onConfirm: onDismiss, onCancel: onDismiss });

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
			<motion.div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				data-testid="touch-warning"
				initial={{ opacity: 0, scaleY: 0.6 }}
				animate={{ opacity: 1, scaleY: 1 }}
				transition={{ duration: 0.12 }}
				className="flex w-full max-w-lg flex-col items-center gap-4 border-2 border-game-amber bg-game-bg px-6 py-5 text-center font-terminal"
			>
				<h2 id={titleId} className="text-2xl text-game-amber">
					本遊戲需要實體鍵盤
				</h2>
				<p className="text-xl text-game-text">
					偵測到觸控裝置。遊戲用方向鍵移動、E 互動、在終端機打指令，觸控螢幕無法操作。
				</p>
				<p className="text-lg text-game-dim">平板接上實體鍵盤就能玩。</p>
				<MenuOption selected onHover={() => {}} onClick={onDismiss}>
					仍要繼續
				</MenuOption>
			</motion.div>
		</div>
	);
}
