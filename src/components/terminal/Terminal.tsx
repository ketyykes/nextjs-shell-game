"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fullwidthChar } from "@/game/shell/messages";
import { findFullwidthChar } from "@/game/shell/parser/fullwidth";
import type { Shell } from "@/game/shell/shell";
import type { EditorRequest, EditorWrite, PagerRequest, ShellExecution } from "@/game/shell/types";
import { TEXT_SPEED_MS } from "@/game/store/types";
import type { OutputEntry, TextSpeed } from "@/game/store/types";
import { DialogueBlock } from "./DialogueBlock";
import { Editor, type EditorHandle } from "./Editor";
import { OutputBlock } from "./OutputBlock";
import { Pager, type PagerHandle } from "./Pager";
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
 * 帶 `nano` 的編輯請求時同理改顯示全螢幕編輯器（`Editor`，4.22；同一行有分頁時先翻完分頁）；
 * 離開時有存過檔，就跟 shell 拿一次執行結果，把寫入摘要插進輸出區並交給 `onExecuted`（存檔、目標判定照常）。
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
	const pagerRef = useRef<PagerHandle>(null);
	const editorRef = useRef<EditorHandle>(null);
	const editorEntryCountRef = useRef(0);
	const stickToBottomRef = useRef(true);

	// 掛載時就已存在的對話（例如重新打開終端機還原的紀錄）不重播打字動畫
	const [initialEntryIds] = useState(() => new Set(entries.map((entry) => entry.id)));

	// less 的分頁請求（M13-3）：排第一個的正在顯示，翻完（q）換下一個，空了回到提示列
	const [pagerQueue, setPagerQueue] = useState<PagerRequest[]>([]);
	const activePager = pagerQueue[0] ?? null;

	// nano 的編輯請求（4.22）與開它的那一行原文；分頁翻完才顯示
	const [editorSession, setEditorSession] = useState<{ request: EditorRequest; input: string } | null>(null);
	let activeEditor: { request: EditorRequest; input: string } | null = null;
	if (activePager === null) {
		activeEditor = editorSession;
	}
	const isFullscreen = activePager !== null || activeEditor !== null;

	const handleExecuted = useCallback(
		(execution: ShellExecution) => {
			if (execution.pagers !== undefined) {
				setPagerQueue(execution.pagers);
			}
			if (execution.editor !== undefined) {
				setEditorSession({ request: execution.editor, input: execution.input });
			}
			onExecuted?.(execution);
		},
		[onExecuted],
	);

	// 離開編輯器：沒存過什麼都不留；存過就插一行寫入摘要，再像一般指令一樣交給 onExecuted
	const handleEditorExit = (writes: EditorWrite[]) => {
		const session = editorSession;
		setEditorSession(null);
		if (session === null || writes.length === 0) {
			return;
		}
		const execution = shell.finishEditor(session.input, writes);
		editorEntryCountRef.current += 1;
		onEntriesChange([
			...entries,
			{ kind: "system", id: `editor-${Date.now()}-${editorEntryCountRef.current}`, lines: execution.lines },
		]);
		onExecuted?.(execution);
	};

	const { value, handleChange, handleKeyDown } = useTerminalKeyboard({
		shell,
		entries,
		onEntriesChange,
		onExecuted: handleExecuted,
		onClose,
		inputRef,
	});

	// 離開分頁或編輯器（或剛掛載）時捲回最底、焦點回到輸入框，畫面跟 bash 離開 less 後一樣停在提示列
	useEffect(() => {
		if (isFullscreen) {
			return;
		}
		const element = scrollRef.current;
		if (element !== null) {
			element.scrollTop = element.scrollHeight;
		}
		inputRef.current?.focus();
	}, [isFullscreen]);

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

	// 點終端機任何地方都把焦點放回輸入框；分頁中放回分頁器（輸入框藏起來了，焦點會掉到 body，q、Esc 就沒反應）。
	// 正在選取文字（想複製輸出）時不搶焦點
	const focusInput = () => {
		const selection = typeof window === "undefined" ? null : window.getSelection();
		if (selection !== null && selection.toString() !== "") {
			return;
		}
		if (activePager !== null) {
			pagerRef.current?.focus();
			return;
		}
		if (activeEditor !== null) {
			editorRef.current?.focus();
			return;
		}
		inputRef.current?.focus();
	};

	// 編輯器開著時「[Esc] 關閉」跟 Esc 一樣只離開編輯器（有沒存的修改先問），不直接關掉終端機丟掉內容
	let handleClose = onClose;
	if (activeEditor !== null) {
		handleClose = () => editorRef.current?.requestExit();
	}

	let warning: string | undefined;
	const fullwidth = findFullwidthChar(value);
	if (fullwidth !== null) {
		warning = fullwidthChar(fullwidth)[0];
	}

	const msPerChar = TEXT_SPEED_MS[textSpeed];

	return (
		<div className="flex h-full w-full max-w-4xl" onClick={focusInput}>
			<TerminalFrame title={title} learnedCommands={learnedCommands} onClose={handleClose} solved={solved}>
				{activePager !== null && (
					<Pager
						key={`pager-${pagerQueue.length}`}
						ref={pagerRef}
						request={activePager}
						onQuit={() => setPagerQueue((queue) => queue.slice(1))}
					/>
				)}
				{activeEditor !== null && (
					<Editor
						ref={editorRef}
						request={activeEditor.request}
						onWrite={(fileName, content) => shell.writeEditorFile(activeEditor.request, fileName, content)}
						onExit={handleEditorExit}
					/>
				)}
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					hidden={isFullscreen}
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
