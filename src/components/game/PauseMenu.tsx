"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { ConfirmPanel } from "@/components/title/ConfirmPanel";
import { MenuOption } from "@/components/title/MenuOption";
import { useMenuNavigation } from "@/components/title/useMenuNavigation";

export interface PauseMenuProps {
	open: boolean;
	/** 「繼續」或 Esc。 */
	onResume: () => void;
	onReturnToTitle: () => void;
	/** 選「重玩本章」並在內嵌確認面板按「重玩」後才呼叫。 */
	onRestartChapter: () => void;
	onOpenSettings: () => void;
	/**
	 * false 時暫停選單不收鍵盤，例如設定選單疊在上面時，避免 Esc 同時關掉設定又關掉暫停。
	 * 預設 true。
	 */
	keyboardEnabled?: boolean;
}

type PauseAction = "resume" | "settings" | "restart" | "title";

interface PauseItem {
	action: PauseAction;
	label: string;
}

const PAUSE_ITEMS: readonly PauseItem[] = [
	{ action: "resume", label: "繼續" },
	{ action: "settings", label: "設定" },
	{ action: "restart", label: "重玩本章" },
	{ action: "title", label: "回標題" },
];

/**
 * 暫停選單（設計文件 4.7）：在地圖上按 Esc 開啟。
 *
 * 鍵盤：↑↓ 選擇、Enter 確認、Esc 等同「繼續」。「重玩本章」會先跳內嵌確認面板（預設選「取消」）。
 * `open` 為 false 時不渲染、也不監聽鍵盤。
 */
export function PauseMenu({ open, ...rest }: PauseMenuProps) {
	if (!open) {
		return null;
	}
	// 每次開啟都重新掛載，選取位置與確認面板狀態自然回到初始值
	return <PauseMenuPanel {...rest} />;
}

type PauseMenuPanelProps = Omit<PauseMenuProps, "open">;

function PauseMenuPanel({
	onResume,
	onReturnToTitle,
	onRestartChapter,
	onOpenSettings,
	keyboardEnabled = true,
}: PauseMenuPanelProps) {
	const [isConfirmingRestart, setIsConfirmingRestart] = useState(false);

	function activate(index: number) {
		const item = PAUSE_ITEMS[index];
		if (item === undefined) {
			return;
		}
		if (item.action === "resume") {
			onResume();
			return;
		}
		if (item.action === "settings") {
			onOpenSettings();
			return;
		}
		if (item.action === "restart") {
			setIsConfirmingRestart(true);
			return;
		}
		onReturnToTitle();
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: PAUSE_ITEMS.length,
		onConfirm: activate,
		onCancel: onResume,
		enabled: keyboardEnabled && !isConfirmingRestart,
	});

	return (
		<div
			className="fixed inset-0 z-45 flex items-center justify-center bg-black/70 px-4"
			data-testid="pause-menu"
		>
			<motion.div
				role="dialog"
				aria-modal="true"
				aria-label="暫停選單"
				initial={{ opacity: 0, scaleY: 0.8 }}
				animate={{ opacity: 1, scaleY: 1 }}
				transition={{ duration: 0.15, ease: "easeOut" }}
				className="flex min-w-72 flex-col items-center gap-4 border-2 border-game-holo/60 bg-game-bg px-8 py-6"
			>
				<h2 className="font-title text-lg text-game-holo">暫停</h2>

				{isConfirmingRestart && (
					<ConfirmPanel
						message="重玩本章？目前章節的進度會清除。"
						confirmLabel="重玩"
						onConfirm={() => {
							setIsConfirmingRestart(false);
							onRestartChapter();
						}}
						onCancel={() => setIsConfirmingRestart(false)}
					/>
				)}
				{!isConfirmingRestart && (
					<ul className="flex flex-col items-start gap-1">
						{PAUSE_ITEMS.map((item, index) => (
							<li key={item.action}>
								<MenuOption
									selected={index === selectedIndex}
									onHover={() => setSelectedIndex(index)}
									onClick={() => {
										setSelectedIndex(index);
										activate(index);
									}}
								>
									{item.label}
								</MenuOption>
							</li>
						))}
					</ul>
				)}

				<p className="font-terminal text-base text-game-dim">↑↓ 選擇 · Enter 確認 · Esc 繼續</p>
			</motion.div>
		</div>
	);
}
