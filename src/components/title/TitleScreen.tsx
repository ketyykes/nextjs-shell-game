"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { ConfirmPanel } from "./ConfirmPanel";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface TitleScreenCrtSettings {
	scanlines: boolean;
	vignette: boolean;
	flicker: boolean;
}

export interface TitleScreenProps {
	/** 有存檔才顯示「繼續」，「新遊戲」也要先確認覆蓋。 */
	hasSave: boolean;
	onContinue: () => void;
	/** 整合者會先 resetSave 再進選角；有存檔時要玩家確認覆蓋後才會呼叫。 */
	onNewGame: () => void;
	onOpenSettings: () => void;
	/** CRT 效果，預設三項都開；整合者從設定餵進來。 */
	crt?: TitleScreenCrtSettings;
	/** 標題下方的副標，例如「冷凍艙 · 第一章」；有存檔時整合者改成目前進度的章節。 */
	subtitle?: string;
	/**
	 * false 時標題選單不收鍵盤，例如設定選單疊在標題畫面上時，避免 Esc／Enter 被兩邊同時處理。
	 * 預設 true。
	 */
	keyboardEnabled?: boolean;
}

type TitleAction = "continue" | "newGame" | "settings";

interface TitleItem {
	action: TitleAction;
	label: string;
}

const DEFAULT_CRT: TitleScreenCrtSettings = { scanlines: true, vignette: true, flicker: true };

/** 依有沒有存檔決定選單項目。 */
function buildItems(hasSave: boolean): TitleItem[] {
	const items: TitleItem[] = [];
	if (hasSave) {
		items.push({ action: "continue", label: "繼續" });
	}
	items.push({ action: "newGame", label: "新遊戲" });
	items.push({ action: "settings", label: "設定" });
	return items;
}

/**
 * 標題畫面（設計文件 4.7）：黑底、KEPLER-9 像素標題、CRT 掃描線，選單「繼續／新遊戲／設定」。
 *
 * 鍵盤：↑↓ 選擇、Enter 確認。有存檔時按「新遊戲」先跳內嵌確認面板（預設選「取消」）。
 */
export function TitleScreen({
	hasSave,
	onContinue,
	onNewGame,
	onOpenSettings,
	crt = DEFAULT_CRT,
	subtitle = "冷凍艙 · 第一章",
	keyboardEnabled = true,
}: TitleScreenProps) {
	const items = buildItems(hasSave);
	const [isConfirmingNewGame, setIsConfirmingNewGame] = useState(false);

	function activate(index: number) {
		const item = items[index];
		if (item === undefined) {
			return;
		}
		if (item.action === "continue") {
			onContinue();
			return;
		}
		if (item.action === "settings") {
			onOpenSettings();
			return;
		}
		if (hasSave) {
			setIsConfirmingNewGame(true);
			return;
		}
		onNewGame();
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: items.length,
		onConfirm: activate,
		enabled: keyboardEnabled && !isConfirmingNewGame,
	});

	return (
		<div
			className="fixed inset-0 flex flex-col items-center justify-center gap-12 bg-black px-4 text-game-text"
			data-testid="title-screen"
		>
			<motion.header
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease: "easeOut" }}
				className="flex flex-col items-center gap-4 text-center"
			>
				<h1 className="font-title text-4xl tracking-widest text-game-holo drop-shadow-[0_0_12px_var(--game-holo)] sm:text-6xl">
					KEPLER-9
				</h1>
				<p className="font-terminal text-xl text-game-prompt" data-testid="title-subtitle">
					{subtitle}
				</p>
			</motion.header>

			<nav aria-label="標題選單" className="flex min-h-40 flex-col items-center justify-start">
				{isConfirmingNewGame && (
					<ConfirmPanel
						message="已有存檔，開始新遊戲會覆蓋它。"
						confirmLabel="覆蓋"
						onConfirm={() => {
							setIsConfirmingNewGame(false);
							onNewGame();
						}}
						onCancel={() => setIsConfirmingNewGame(false)}
					/>
				)}
				{!isConfirmingNewGame && (
					<ul className="flex flex-col items-start gap-1">
						{items.map((item, index) => (
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
			</nav>

			<p className="absolute bottom-6 font-terminal text-base text-game-dim">
				鍵盤操作：↑↓ 選擇 · Enter 確認
			</p>

			<CrtOverlay scanlines={crt.scanlines} vignette={crt.vignette} flicker={crt.flicker} />
		</div>
	);
}
