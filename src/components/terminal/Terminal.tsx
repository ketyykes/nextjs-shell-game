"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fullwidthChar } from "@/game/shell/messages";
import { findFullwidthChar } from "@/game/shell/parser/fullwidth";
import type { Shell } from "@/game/shell/shell";
import type { PagerRequest, ShellExecution } from "@/game/shell/types";
import { TEXT_SPEED_MS } from "@/game/store/types";
import type { OutputEntry, TextSpeed } from "@/game/store/types";
import { DialogueBlock } from "./DialogueBlock";
import { OutputBlock } from "./OutputBlock";
import { Pager } from "./Pager";
import { PromptInput } from "./PromptInput";
import { TerminalFrame } from "./TerminalFrame";
import { useTerminalKeyboard } from "./useTerminalKeyboard";

export interface TerminalProps {
	/** 終端機名稱，顯示在標題列，例如「冷凍艙控制台」 */
	title: string;
	shell: Shell;
	/** 輸出區內容，由父層持有（父層會存進 store） */
	entries: OutputEntry[];
	onEntriesChange: (next: OutputEntry[]) => void;
	/** 每次執行後呼叫，父層用來存 shell 狀態與扣氧氣 */
	onExecuted?: (execution: ShellExecution) => void;
	/** Esc 或點「[Esc] 關閉」 */
	onClose: () => void;
	learnedCommands: string[];
	/** NOVA 對話區塊的打字速度 */
	textSpeed: TextSpeed;
	/** 這台終端機已過關，標題列標「已完成」 */
	solved?: boolean;
}

/** 距離底部多少 px 以內算「黏在底部」，打字動畫撐高內容時才跟著捲。 */
const STICK_TO_BOTTOM_THRESHOLD_PX = 24;

/**
 * 終端機彈窗：組合外框、輸出區與輸入列。
 * 鍵盤行為在 `useTerminalKeyboard`，這裡只管畫面與焦點、捲動。
 * 執行結果帶 `less` 的分頁請求時，輸出區與輸入列整塊藏起來，改顯示全螢幕分頁器（`Pager`），翻完回到原樣。
 */
export function Terminal({
	title,
	shell,
	entries,
	onEntriesChange,
	onExecuted,
	onClose,
	learnedCommands,
	textSpeed,
	solved = false,
}: TerminalProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottomRef = useRef(true);

	// 掛載時就已存在的對話（例如重新打開終端機還原的紀錄）不重播打字動畫
	const [initialEntryIds] = useState(() => new Set(entries.map((entry) => entry.id)));

	// less 的分頁請求（M13-3）：排第一個的正在顯示，翻完（q）換下一個，空了回到提示列
	const [pagerQueue, setPagerQueue] = useState<PagerRequest[]>([]);
	const activePager = pagerQueue[0] ?? null;

	const handleExecuted = useCallback(
		(execution: ShellExecution) => {
			if (execution.pagers !== undefined) {
				setPagerQueue(execution.pagers);
			}
			onExecuted?.(execution);
		},
		[onExecuted],
	);

	const { value, handleChange, handleKeyDown } = useTerminalKeyboard({
		shell,
		entries,
		onEntriesChange,
		onExecuted: handleExecuted,
		onClose,
		inputRef,
	});

	// 離開分頁（或剛掛載）時捲回最底、焦點回到輸入框，畫面跟 bash 離開 less 後一樣停在提示列
	useEffect(() => {
		if (activePager !== null) {
			return;
		}
		const element = scrollRef.current;
		if (element !== null) {
			element.scrollTop = element.scrollHeight;
		}
		inputRef.current?.focus();
	}, [activePager]);

	// 有新區塊時捲到最底
	useEffect(() => {
		const element = scrollRef.current;
		if (element === null) {
			return;
		}
		element.scrollTop = element.scrollHeight;
		stickToBottomRef.current = true;
	}, [entries]);

	// NOVA 打字動畫會持續撐高內容；玩家沒往上捲的話就跟著捲到底
	useEffect(() => {
		const element = scrollRef.current;
		if (element === null || typeof MutationObserver === "undefined") {
			return;
		}
		const observer = new MutationObserver(() => {
			if (stickToBottomRef.current) {
				element.scrollTop = element.scrollHeight;
			}
		});
		observer.observe(element, { childList: true, subtree: true, characterData: true });
		return () => {
			observer.disconnect();
		};
	}, []);

	const handleScroll = () => {
		const element = scrollRef.current;
		if (element === null) {
			return;
		}
		const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
		stickToBottomRef.current = distanceToBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
	};

	// 點終端機任何地方都把焦點放回輸入框；正在選取文字（想複製輸出）時不搶焦點
	const focusInput = () => {
		const selection = typeof window === "undefined" ? null : window.getSelection();
		if (selection !== null && selection.toString() !== "") {
			return;
		}
		inputRef.current?.focus();
	};

	let warning: string | undefined;
	const fullwidth = findFullwidthChar(value);
	if (fullwidth !== null) {
		warning = fullwidthChar(fullwidth)[0];
	}

	const msPerChar = TEXT_SPEED_MS[textSpeed];

	return (
		<div className="flex h-full w-full max-w-4xl" onClick={focusInput}>
			<TerminalFrame title={title} learnedCommands={learnedCommands} onClose={onClose} solved={solved}>
				{activePager !== null && (
					<Pager
						key={`pager-${pagerQueue.length}`}
						request={activePager}
						onQuit={() => setPagerQueue((queue) => queue.slice(1))}
					/>
				)}
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					hidden={activePager !== null}
					className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
				>
					<div role="log" aria-label="終端機輸出">
						{entries.map((entry) => {
							if (entry.kind === "dialogue") {
								let entryMsPerChar = msPerChar;
								if (initialEntryIds.has(entry.id)) {
									entryMsPerChar = 0;
								}
								return (
									<DialogueBlock
										key={entry.id}
										speaker={entry.speaker}
										text={entry.text}
										msPerChar={entryMsPerChar}
									/>
								);
							}
							return <OutputBlock key={entry.id} entry={entry} />;
						})}
					</div>
					<PromptInput
						prompt={shell.prompt()}
						value={value}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						inputRef={inputRef}
						warning={warning}
					/>
				</div>
			</TerminalFrame>
		</div>
	);
}
