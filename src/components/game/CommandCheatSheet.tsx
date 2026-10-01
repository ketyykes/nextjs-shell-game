"use client";

/**
 * 右側的「已學指令」側邊面板（設計文件 4.8）。
 *
 * 收起時只有一條垂直的窄標籤，展開後滑出面板，列出已學指令；
 * 點一項可看用法、說明與範例，資料與終端機內的 `man` 共用 `COMMAND_DOCS`。
 */

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { getTeachDoc } from "@/game/shell/commands/docs";

export interface CommandCheatSheetProps {
	/** 已學指令，順序就是學會的順序，可能含 "ls -a" 這種帶參數的字串 */
	learnedCommands: string[];
	/** 是否展開；預設收起只顯示右側一條窄標籤 */
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** 取空白前的第一個字當指令名，例如 "ls -a" 查 `ls` 的說明。 */
function getBaseCommandName(learned: string): string {
	const [baseName] = learned.trim().split(/\s+/);
	return baseName ?? learned;
}

export function CommandCheatSheet({ learnedCommands, open, onOpenChange }: CommandCheatSheetProps) {
	const panelId = useId();
	// 同時只展開一項，存的是 learnedCommands 裡的完整字串
	const [expandedCommand, setExpandedCommand] = useState<string | null>(null);

	function handleToggleCommand(command: string) {
		setExpandedCommand((current) => (current === command ? null : command));
	}

	const tabLabel = open ? "已學指令 ◂" : "已學指令 ▸";

	return (
		// 外層不吃滑鼠事件，只有標籤與面板自己 pointer-events-auto，不擋住底下的地圖
		<div className="pointer-events-none absolute top-16 right-0 z-30 flex items-start font-terminal">
			{/* 鍵盤是遊戲的（走動、E、Esc），所以按鈕都 tabIndex={-1}，面板只用滑鼠操作 */}
			<button
				type="button"
				tabIndex={-1}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => onOpenChange(!open)}
				className="pointer-events-auto cursor-pointer border border-r-0 border-game-dim bg-game-bg/85 px-1.5 py-3 text-base text-game-holo [writing-mode:vertical-rl] hover:text-game-text"
			>
				{tabLabel}
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						key="panel"
						id={panelId}
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.2 }}
						// 不需要在這裡攔 onKeyDown 阻止事件冒泡到 window：
						// 所有按鈕都是 tabIndex={-1}，面板內不會有焦點，鍵盤事件根本不會從這裡發出，
						// 遊戲的按鍵（走動、E、Esc）自然照常運作。
						className="pointer-events-auto flex max-h-[70vh] w-72 flex-col border border-r-0 border-game-dim bg-game-bg/90"
						data-testid="command-cheat-sheet-panel"
					>
						<div className="overflow-y-auto px-3 py-2">
							{learnedCommands.length === 0 ? (
								<p className="py-2 text-base text-game-dim">還沒學會任何指令，走到終端機前按 E</p>
							) : (
								<ul className="flex flex-col gap-1">
									{learnedCommands.map((command, index) => (
										<CommandItem
											key={`${command}-${index}`}
											command={command}
											itemId={`${panelId}-item-${index}`}
											expanded={expandedCommand === command}
											onToggle={handleToggleCommand}
										/>
									))}
								</ul>
							)}
						</div>
						<p className="border-t border-game-dim px-3 py-2 text-sm text-game-dim">
							終端機內輸入 man &lt;指令&gt; 也看得到
						</p>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface CommandItemProps {
	command: string;
	itemId: string;
	expanded: boolean;
	onToggle: (command: string) => void;
}

/** 單一已學指令：按鈕列 + 展開後的說明。 */
function CommandItem({ command, itemId, expanded, onToggle }: CommandItemProps) {
	const doc = getTeachDoc(getBaseCommandName(command));
	const detailId = `${itemId}-detail`;

	// 查不到說明時只顯示名稱，沒東西可展開
	if (doc === undefined) {
		return (
			<li>
				<div className="px-1 py-1 text-lg text-game-holo">{command}</div>
			</li>
		);
	}

	return (
		<li>
			<button
				type="button"
				tabIndex={-1}
				aria-expanded={expanded}
				aria-controls={detailId}
				onClick={() => onToggle(command)}
				className="flex w-full cursor-pointer items-baseline justify-between gap-2 px-1 py-1 text-left hover:bg-game-dim/20"
			>
				<span className="text-lg text-game-holo">{command}</span>
				<span className="text-sm text-game-dim">{doc.summary}</span>
			</button>

			{expanded && (
				<div id={detailId} className="mt-1 mb-2 flex flex-col gap-2 border-l border-game-dim pl-3 text-sm text-game-text">
					<div>
						<span className="text-game-dim">用法　</span>
						<span className="text-game-holo">{doc.usage}</span>
					</div>
					<div className="flex flex-col gap-1">
						{doc.description.map((line) => (
							<p key={line}>{line}</p>
						))}
					</div>
					<ul className="flex flex-col gap-1">
						{doc.examples.map((example) => (
							<li key={example.command}>
								<div className="text-game-success">$ {example.command}</div>
								<div className="text-game-dim">{example.explanation}</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</li>
	);
}
