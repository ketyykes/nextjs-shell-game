"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { ChapterSelectPanel, type ChapterOption } from "./ChapterSelectPanel";
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
	/** 到過的章節（第 1 章到最遠章節）。兩章以上且有存檔才顯示「選章」。 */
	chapters?: readonly ChapterOption[];
	/** 玩家在選章清單選定並確認重玩後呼叫，參數是章節號。 */
	onSelectChapter?: (chapter: number) => void;
	/** 有給才顯示「練習模式」（排在最後），不需要存檔、不必確認，直接呼叫。 */
	onPractice?: () => void;
}

type TitleAction = "continue" | "selectChapter" | "newGame" | "settings" | "practice";

/** 選單下方顯示的內容：主選單、新遊戲覆蓋確認、選章清單、重玩某章的確認。 */
type TitlePanel =
	| { kind: "menu" }
	| { kind: "confirmNewGame" }
	| { kind: "chapters"; index: number }
	| { kind: "confirmChapter"; index: number };

interface TitleItem {
	action: TitleAction;
	label: string;
}

const DEFAULT_CRT: TitleScreenCrtSettings = { scanlines: true, vignette: true, flicker: true };

/** 依有沒有存檔、到過幾章、有沒有練習模式決定選單項目。 */
function buildItems(hasSave: boolean, canSelectChapter: boolean, canPractice: boolean): TitleItem[] {
	const items: TitleItem[] = [];
	if (hasSave) {
		items.push({ action: "continue", label: "繼續" });
	}
	if (hasSave && canSelectChapter) {
		items.push({ action: "selectChapter", label: "選章" });
	}
	items.push({ action: "newGame", label: "新遊戲" });
	items.push({ action: "settings", label: "設定" });
	if (canPractice) {
		items.push({ action: "practice", label: "練習模式" });
	}
	return items;
}

/**
 * 標題畫面（設計文件 4.7）：黑底、KEPLER-9 像素標題、CRT 掃描線，選單「繼續／新遊戲／設定」，加上練習模式入口。
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
	chapters = [],
	onSelectChapter,
	onPractice,
}: TitleScreenProps) {
	const canSelectChapter = chapters.length >= 2 && onSelectChapter !== undefined;
	const items = buildItems(hasSave, canSelectChapter, onPractice !== undefined);
	const [panel, setPanel] = useState<TitlePanel>({ kind: "menu" });

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
		if (item.action === "practice") {
			onPractice?.();
			return;
		}
		if (item.action === "selectChapter") {
			setPanel({ kind: "chapters", index: 0 });
			return;
		}
		if (hasSave) {
			setPanel({ kind: "confirmNewGame" });
			return;
		}
		onNewGame();
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: items.length,
		onConfirm: activate,
		enabled: keyboardEnabled && panel.kind === "menu",
	});

	let confirmingChapter: ChapterOption | undefined;
	if (panel.kind === "confirmChapter") {
		confirmingChapter = chapters[panel.index];
	}

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
				{panel.kind === "confirmNewGame" && (
					<ConfirmPanel
						message="已有存檔，開始新遊戲會覆蓋它。"
						confirmLabel="覆蓋"
						onConfirm={() => {
							setPanel({ kind: "menu" });
							onNewGame();
						}}
						onCancel={() => setPanel({ kind: "menu" })}
					/>
				)}
				{panel.kind === "chapters" && keyboardEnabled && (
					<ChapterSelectPanel
						chapters={chapters}
						initialIndex={panel.index}
						onSelect={(chapter) => {
							setPanel({ kind: "confirmChapter", index: chapters.indexOf(chapter) });
						}}
						onBack={() => setPanel({ kind: "menu" })}
					/>
				)}
				{panel.kind === "confirmChapter" && confirmingChapter !== undefined && (
					<ConfirmPanel
						message={`從頭重玩${confirmingChapter.label}？這一章的進度會清掉，其他章節保留。`}
						confirmLabel="重玩"
						onConfirm={() => {
							onSelectChapter?.(confirmingChapter.number);
						}}
						onCancel={() => setPanel({ kind: "chapters", index: panel.index })}
					/>
				)}
				{panel.kind === "menu" && (
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
