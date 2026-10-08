"use client";

/**
 * 右側面板組的「已學指令」內容（設計文件 4.8）。標籤、開關與外框由 `SidePanels` 負責。
 *
 * 列出已學指令；點一項可看用法、說明與範例，資料與終端機內的 `man` 共用 `COMMAND_DOCS`。
 */

import { useId, useState } from "react";
import { getTeachDoc } from "@/game/shell/commands/docs";

export interface CommandCheatSheetProps {
	/** 已學指令，順序就是學會的順序，可能含 "ls -a" 這種帶參數的字串 */
	learnedCommands: string[];
}

/** 取空白前的第一個字當指令名，例如 "ls -a" 查 `ls` 的說明。 */
function getBaseCommandName(learned: string): string {
	const [baseName] = learned.trim().split(/\s+/);
	return baseName ?? learned;
}

export function CommandCheatSheet({ learnedCommands }: CommandCheatSheetProps) {
	const listId = useId();
	// 同時只展開一項，存的是 learnedCommands 裡的完整字串
	const [expandedCommand, setExpandedCommand] = useState<string | null>(null);

	function handleToggleCommand(command: string) {
		setExpandedCommand((current) => (current === command ? null : command));
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="command-cheat-sheet-panel">
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				{learnedCommands.length === 0 ? (
					<p className="py-2 text-base text-game-dim">還沒學會任何指令，走到終端機前按 E</p>
				) : (
					<ul className="flex flex-col gap-1">
						{learnedCommands.map((command, index) => (
							<CommandItem
								key={`${command}-${index}`}
								command={command}
								itemId={`${listId}-item-${index}`}
								expanded={expandedCommand === command}
								onToggle={handleToggleCommand}
							/>
						))}
					</ul>
				)}
			</div>
			<p className="border-t border-game-dim px-3 py-2 text-sm text-game-dim">終端機內輸入 man &lt;指令&gt; 也看得到</p>
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
