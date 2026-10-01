"use client";

import { motion } from "motion/react";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface ConfirmPanelProps {
	message: string;
	confirmLabel: string;
	/** 預設「取消」。 */
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

/** 選項順序：確認在左、取消在右。 */
const CONFIRM_INDEX = 0;
const CANCEL_INDEX = 1;

/**
 * 內嵌確認面板，取代瀏覽器原生的 `window.confirm`（原生對話框會卡住自動化測試）。
 *
 * - 預設選取「取消」，連按 Enter 不會誤刪存檔或進度。
 * - ←→ 或 ↑↓ 切換、Enter 確認、Esc 等同取消。
 * - 掛載時才開始監聽鍵盤；外層選單要在面板開啟時用 `enabled: false` 停用自己的鍵盤。
 */
export function ConfirmPanel({
	message,
	confirmLabel,
	cancelLabel = "取消",
	onConfirm,
	onCancel,
}: ConfirmPanelProps) {
	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: 2,
		orientation: "both",
		initialIndex: CANCEL_INDEX,
		loop: false,
		onConfirm: (index) => {
			if (index === CONFIRM_INDEX) {
				onConfirm();
				return;
			}
			onCancel();
		},
		onCancel,
	});

	return (
		<motion.div
			role="alertdialog"
			aria-modal="true"
			aria-label={message}
			data-testid="confirm-panel"
			initial={{ opacity: 0, scaleY: 0.6 }}
			animate={{ opacity: 1, scaleY: 1 }}
			transition={{ duration: 0.12 }}
			className="flex flex-col items-center gap-3 border-2 border-game-amber bg-game-bg px-6 py-4 font-terminal"
		>
			<p className="text-xl text-game-amber">{message}</p>
			<div className="flex gap-6">
				<MenuOption
					selected={selectedIndex === CONFIRM_INDEX}
					onHover={() => setSelectedIndex(CONFIRM_INDEX)}
					onClick={onConfirm}
				>
					{confirmLabel}
				</MenuOption>
				<MenuOption
					selected={selectedIndex === CANCEL_INDEX}
					onHover={() => setSelectedIndex(CANCEL_INDEX)}
					onClick={onCancel}
				>
					{cancelLabel}
				</MenuOption>
			</div>
		</motion.div>
	);
}
