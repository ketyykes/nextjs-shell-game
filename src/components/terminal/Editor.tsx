"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, Ref } from "react";
import type { EditorRequest, EditorWrite, EditorWriteResult } from "@/game/shell/types";
import {
	createEditorState,
	EDITOR_HELP_LINES,
	EDITOR_MESSAGES,
	editorCommandForKey,
	editorFileLabel,
	editorKeyHints,
	editorPromptLabel,
	isModified,
	runEditorCommand,
	setPromptInput,
} from "./editorModel";
import type { EditorCommand, EditorKeyInput } from "./editorModel";

export interface EditorProps {
	/** 要編輯的緩衝區，來自 `ShellExecution.editor`。 */
	request: EditorRequest;
	/** 寫檔（^O、^S、離開時存檔），終端機交給 `Shell.writeEditorFile`。 */
	onWrite: (fileName: string, content: string) => EditorWriteResult;
	/** 離開編輯器，帶這次成功的寫入（沒存過是空陣列）。 */
	onExit: (writes: EditorWrite[]) => void;
	/** 讓終端機把焦點放回來、或用關閉鈕要求離開。 */
	ref?: Ref<EditorHandle>;
}

/** 編輯器對外的操作。 */
export interface EditorHandle {
	/** 把焦點放回該接鍵盤的地方：文字區、提示列輸入框或說明頁。 */
	focus: () => void;
	/** 終端機的「[Esc] 關閉」：走跟 ^X 一樣的離開流程，有沒存的修改先問。 */
	requestExit: () => void;
}

/** 頂列左邊的程式名稱，照真的 nano 的標題列。 */
const TITLE = "GNU nano 7.2";

const ROW_CLASS = "h-7 leading-7";

/** 這次按鍵是不是輸入法組字中（Safari 組字結束那一下 Enter 的 keyCode 是 229）。 */
function isComposing(event: KeyboardEvent<HTMLElement>): boolean {
	return event.nativeEvent.isComposing || event.keyCode === 229;
}

/** 從鍵盤事件取出判斷按鍵要的欄位。 */
function keyInputOf(event: KeyboardEvent<HTMLElement>): EditorKeyInput {
	return {
		key: event.key,
		code: event.code,
		ctrlKey: event.ctrlKey,
		metaKey: event.metaKey,
		altKey: event.altKey,
	};
}

/** 量位置用的隱藏 div 要跟文字區一樣的排版屬性，折行才會一致。 */
const MIRROR_PROPERTIES = [
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"letter-spacing",
	"padding-top",
	"padding-left",
	"padding-right",
	"tab-size",
	"word-break",
];

/** 文字區裡第 `offset` 個字所在那一列的頂端（從內容最上面算），用一個樣式相同的隱藏 div 排一次版量出來。 */
function measureOffsetTop(textarea: HTMLTextAreaElement, offset: number): number {
	const style = window.getComputedStyle(textarea);
	const mirror = document.createElement("div");
	for (const property of MIRROR_PROPERTIES) {
		mirror.style.setProperty(property, style.getPropertyValue(property));
	}
	mirror.style.position = "absolute";
	mirror.style.visibility = "hidden";
	mirror.style.boxSizing = "border-box";
	mirror.style.width = `${textarea.clientWidth}px`;
	mirror.style.whiteSpace = "pre-wrap";
	mirror.style.overflowWrap = "break-word";
	mirror.textContent = textarea.value.slice(0, offset);
	// 標記放在 offset 那個字的位置；div 是隱藏的，內容放什麼都看不到
	const marker = document.createElement("span");
	marker.textContent = "|";
	mirror.append(marker);
	document.body.append(mirror);
	const top = marker.offsetTop;
	mirror.remove();
	return top;
}

/**
 * 搜尋找到的地方不在畫面裡時把文字區捲過去（放在上方三分之一）。
 * 瀏覽器的 `setSelectionRange` 不會自己捲動 textarea（Chrome 實測連重新 focus 都不會）。
 */
function scrollOffsetIntoView(textarea: HTMLTextAreaElement, offset: number): void {
	const top = measureOffsetTop(textarea, offset);
	const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 0;
	const visibleTop = textarea.scrollTop;
	const visibleBottom = visibleTop + textarea.clientHeight;
	if (top >= visibleTop && top + lineHeight <= visibleBottom) {
		return;
	}
	textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
}

/**
 * 全螢幕 nano 編輯器（第十九場，設計文件 4.22）：蓋在終端機輸出區的位置，離開後回到提示列。
 * 按鍵與流程規則在 `editorModel.ts`；這裡負責畫面、焦點與 textarea。
 *
 * 內容用真的 `<textarea>` 接：中文輸入法、貼上、方向鍵、選取與復原都是瀏覽器原本的，不自己實作游標。
 * 認得的鍵才 `preventDefault` 與 `stopPropagation`：^O（瀏覽器開檔）、^W（關分頁，Chrome 在 Windows／Linux 攔不住，
 * 所以另有 F6，並在有沒存的修改時掛 beforeunload 讓瀏覽器先問）、^G、^X（Windows 的剪下）都要擋；
 * Esc 只離開編輯器，不能冒泡到暫停選單（usePauseMenu）的 window 監聽。
 * 檔名與搜尋的提示列是真的 `<input>`，跟 less 的搜尋列一樣接得到中文與貼上。
 */
export function Editor({ request, onWrite, onExit, ref }: EditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const promptRef = useRef<HTMLInputElement>(null);
	const helpRef = useRef<HTMLDivElement>(null);
	const [content, setContent] = useState(request.content);
	const [state, setState] = useState(() => createEditorState(request));

	// nano 打開檔案時游標在第一行最前面
	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (textarea === null) {
			return;
		}
		textarea.focus();
		textarea.setSelectionRange(0, 0);
		textarea.scrollTop = 0;
	}, []);

	/** 把焦點放到這個模式接鍵盤的地方：提示列的輸入框、說明頁，其他時候是文字區。 */
	const focusActiveTarget = useCallback(() => {
		if (state.mode === "write" || state.mode === "search") {
			promptRef.current?.focus();
			return;
		}
		if (state.mode === "help") {
			helpRef.current?.focus();
			return;
		}
		textareaRef.current?.focus();
	}, [state.mode]);

	// 換模式時（打開提示列、回到編輯、打開說明頁）焦點跟著走
	useEffect(() => {
		focusActiveTarget();
	}, [focusActiveTarget]);

	// 有沒存的修改（或已經存過、離開時才會記進存檔的寫入）時，關分頁或重新整理先讓瀏覽器問一次
	const guardUnload = isModified(state, content) || state.writes.length > 0;
	useEffect(() => {
		if (!guardUnload) {
			return;
		}
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			// Safari 與舊版 Chrome 要設 returnValue 才會跳確認
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [guardUnload]);

	/** 在游標處插入定位字元；能用 insertText 就用（保住瀏覽器的復原紀錄），不行才直接改內容。 */
	const insertTab = () => {
		const textarea = textareaRef.current;
		if (textarea === null) {
			return;
		}
		const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, "\t");
		if (!inserted) {
			textarea.setRangeText("\t", textarea.selectionStart, textarea.selectionEnd, "end");
			setContent(textarea.value);
		}
	};

	const run = (command: EditorCommand) => {
		if (command === "insertTab") {
			insertTab();
			return;
		}
		const textarea = textareaRef.current;
		let selection = { start: 0, end: 0 };
		if (textarea !== null) {
			selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
		}
		const transition = runEditorCommand(state, command, { content, selection, write: onWrite });
		if (transition.exit) {
			onExit(transition.state.writes);
			return;
		}
		setState(transition.state);
		// 搜尋找到：選取那段字。焦點先交回文字區，提示列的輸入框接著會卸載
		if (transition.selection !== null && textarea !== null) {
			textarea.focus();
			textarea.setSelectionRange(transition.selection.start, transition.selection.end);
			scrollOffsetIntoView(textarea, transition.selection.start);
		}
	};

	useImperativeHandle(ref, () => ({ focus: focusActiveTarget, requestExit: () => run("exit") }));

	/** 文字區與說明頁的按鍵：認得的才攔。 */
	const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (isComposing(event)) {
			return;
		}
		const command = editorCommandForKey(state.mode, keyInputOf(event));
		if (command === null) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		run(command);
	};

	/** 提示列的按鍵：一律不往外傳（不讓 window 的 Esc 打開暫停選單），Enter 送出、^C 或 Esc 取消。 */
	const handlePromptKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		event.stopPropagation();
		if (isComposing(event)) {
			return;
		}
		const command = editorCommandForKey(state.mode, keyInputOf(event));
		if (command === null) {
			return;
		}
		event.preventDefault();
		run(command);
	};

	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		setContent(event.target.value);
		// nano 打字後狀態列的訊息就收起來
		setState((previous) => {
			if (previous.message === null) {
				return previous;
			}
			return { ...previous, message: null };
		});
	};

	const isPrompting = state.mode === "write" || state.mode === "search";
	let statusText = state.message ?? "";
	if (state.mode === "confirmExit") {
		statusText = EDITOR_MESSAGES.confirmExit;
	}

	let statusLine = (
		<div className={`flex justify-center ${ROW_CLASS}`}>
			<span role="status" className={statusText === "" ? "" : "truncate bg-game-text px-1 text-game-bg"}>
				{statusText}
			</span>
		</div>
	);
	if (isPrompting) {
		let promptName = "搜尋內容";
		if (state.mode === "write") {
			promptName = "要寫入的檔名";
		}
		statusLine = (
			<div className={`flex items-center bg-game-text px-1 text-game-bg ${ROW_CLASS}`}>
				<span aria-hidden className="shrink-0">
					{editorPromptLabel(state)}
				</span>
				<input
					ref={promptRef}
					type="text"
					aria-label={promptName}
					value={state.promptInput}
					onChange={(event) => setState(setPromptInput(state, event.target.value))}
					onKeyDown={handlePromptKeyDown}
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					className="min-w-0 flex-1 bg-transparent font-terminal text-lg text-game-bg caret-game-bg outline-none"
				/>
			</div>
		);
	}

	return (
		<div role="region" aria-label="nano 編輯器" className="flex min-h-0 flex-1 flex-col" onClick={focusActiveTarget}>
			<div className={`grid shrink-0 grid-cols-[1fr_auto_1fr] gap-4 bg-game-text px-3 text-game-bg ${ROW_CLASS}`}>
				<span className="truncate">{TITLE}</span>
				<span className="truncate">{editorFileLabel(state)}</span>
				<span className="truncate text-right">{isModified(state, content) ? "已修改" : ""}</span>
			</div>
			<textarea
				ref={textareaRef}
				aria-label="編輯內容"
				value={content}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				readOnly={state.mode !== "edit"}
				hidden={state.mode === "help"}
				wrap="soft"
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				className="min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-1 font-terminal text-lg leading-7 text-game-text caret-game-text outline-none"
			/>
			{state.mode === "help" && (
				<div
					ref={helpRef}
					role="region"
					aria-label="nano 說明"
					tabIndex={0}
					onKeyDown={handleKeyDown}
					className="min-h-0 flex-1 overflow-y-auto px-3 py-1 outline-none"
				>
					{EDITOR_HELP_LINES.map((line, index) => (
						<div key={index} className="min-h-7 whitespace-pre-wrap leading-7">
							{line}
						</div>
					))}
				</div>
			)}
			<div className="shrink-0 px-3 pb-1">
				{statusLine}
				<div data-testid="editor-key-hints">
					{editorKeyHints(state.mode).map((row, rowIndex) => (
						<div key={rowIndex} className={`flex gap-6 ${ROW_CLASS}`}>
							{row.map((hint) => (
								<span key={`${hint.key}-${hint.label}`} className="w-32 shrink-0 truncate">
									<span className="bg-game-text px-0.5 text-game-bg">{hint.key}</span> {hint.label}
								</span>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
