"use client";

/**
 * 地圖右側的面板組：「已學指令」與「對話紀錄」兩個垂直標籤疊在一起，同時只開一個面板。
 *
 * 收起時只有右緣一排窄標籤；打開時面板從右邊滑出，標籤跟著貼在面板左側，兩個標籤都一直點得到。
 * 鍵盤快捷鍵由父層用 `useSidePanelShortcuts` 處理，這裡只顯示提示。
 *
 * 終端機開著時也要能查（設計文件 4.8），所以整組疊在終端機彈窗（z-40）之上、暫停選單與章節結束畫面（z-45）之下，
 * 而且滑鼠點這裡不能把終端機輸入框的焦點搶走。
 */

import { AnimatePresence, motion } from "motion/react";
import { useId, type MouseEvent } from "react";
import { CommandCheatSheet } from "./CommandCheatSheet";
import { NovaLogPanel } from "./NovaLogPanel";
import type { NovaLogEntry } from "./useNovaQueue";
import { ariaShortcut, formatShortcut, type SidePanelId } from "./useSidePanelShortcuts";

export interface SidePanelsProps {
	/** 目前打開的面板，null 代表全部收起 */
	active: SidePanelId | null;
	onActiveChange: (next: SidePanelId | null) => void;
	/** 已學指令，順序就是學會的順序 */
	learnedCommands: string[];
	/** 本章 NOVA 地圖台詞的紀錄 */
	novaLog: NovaLogEntry[];
	/** Apple 鍵盤時快捷鍵提示顯示 ⌥ 而不是 Alt */
	appleKeyboard?: boolean;
}

interface SidePanelTab {
	id: SidePanelId;
	label: string;
}

const TABS: readonly SidePanelTab[] = [
	{ id: "commands", label: "已學指令" },
	{ id: "log", label: "對話紀錄" },
];

/**
 * 擋掉 mousedown 的預設行為：瀏覽器就不會把焦點移到按鈕或面板上，終端機輸入框保持焦點、打字不中斷。
 * click 照常觸發，標籤與指令項目一樣點得開；缺點是面板裡的文字不能用滑鼠選取。
 */
function keepFocusWhereItIs(event: MouseEvent) {
	event.preventDefault();
}

export function SidePanels({ active, onActiveChange, learnedCommands, novaLog, appleKeyboard = false }: SidePanelsProps) {
	const panelId = useId();
	const activeTab = TABS.find((tab) => tab.id === active);

	function handleTabClick(id: SidePanelId) {
		if (active === id) {
			onActiveChange(null);
			return;
		}
		onActiveChange(id);
	}

	return (
		// 外層不吃滑鼠事件，只有標籤與面板自己 pointer-events-auto，不擋住底下的地圖
		<div
			className="pointer-events-none absolute top-16 right-0 z-41 flex items-start font-terminal"
			onMouseDown={keepFocusWhereItIs}
		>
			<div className="flex flex-col gap-2">
				{TABS.map((tab) => (
					<SideTab
						key={tab.id}
						tab={tab}
						expanded={active === tab.id}
						panelId={panelId}
						shortcut={formatShortcut(tab.id, appleKeyboard)}
						onClick={handleTabClick}
					/>
				))}
			</div>

			<AnimatePresence>
				{activeTab !== undefined && (
					<motion.div
						key="panel"
						id={panelId}
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.2 }}
						// 所有按鈕都是 tabIndex={-1}，面板內不會有焦點，鍵盤事件不會從這裡發出，
						// 遊戲的按鍵（走動、E、Esc）自然照常運作，不需要在這裡攔 onKeyDown。
						// 底色不透明：疊在終端機上時，後面的終端機文字才不會透出來干擾閱讀。
						className="pointer-events-auto flex max-h-[60vh] w-72 flex-col border border-r-0 border-game-dim bg-game-bg"
						data-testid="side-panel"
					>
						<PanelHeader label={activeTab.label} shortcut={formatShortcut(activeTab.id, appleKeyboard)} />
						{activeTab.id === "commands" && <CommandCheatSheet learnedCommands={learnedCommands} />}
						{activeTab.id === "log" && <NovaLogPanel entries={novaLog} />}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface SideTabProps {
	tab: SidePanelTab;
	expanded: boolean;
	panelId: string;
	shortcut: string;
	onClick: (id: SidePanelId) => void;
}

/** 垂直窄標籤：名稱、開合箭頭與快捷鍵提示。 */
function SideTab({ tab, expanded, panelId, shortcut, onClick }: SideTabProps) {
	const arrow = expanded ? "◂" : "▸";
	return (
		// 鍵盤是遊戲與終端機的（走動、E、Esc、打字），所以按鈕 tabIndex={-1}，改用 Alt 快捷鍵開關
		<button
			type="button"
			tabIndex={-1}
			aria-expanded={expanded}
			aria-controls={panelId}
			aria-keyshortcuts={ariaShortcut(tab.id)}
			onClick={() => onClick(tab.id)}
			className="pointer-events-auto cursor-pointer border border-r-0 border-game-dim bg-game-bg px-1.5 py-3 text-base text-game-holo [writing-mode:vertical-rl] hover:text-game-text"
		>
			{`${tab.label} ${arrow}`}
			{/* 直排時英數字預設會橫著放，快捷鍵改成一個字一個字立起來比較好認 */}
			<span className="ms-2 text-game-prompt [text-orientation:upright]">{shortcut}</span>
		</button>
	);
}

/** 面板頂端：目前面板名稱與收起的快捷鍵。 */
function PanelHeader({ label, shortcut }: { label: string; shortcut: string }) {
	return (
		<div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-game-dim px-3 py-1.5">
			<h2 className="text-lg text-game-holo">{label}</h2>
			<span className="text-sm text-game-dim">{`${shortcut} 收起`}</span>
		</div>
	);
}
