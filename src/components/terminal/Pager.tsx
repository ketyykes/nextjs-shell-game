"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, Ref } from "react";
import type { PagerRequest } from "@/game/shell/types";
import {
	charDisplayWidth,
	createPagerState,
	describePagerStatus,
	handlePagerKey,
	highlightSegments,
	setSearchInput,
	wrapLines,
} from "./pagerModel";
import type { PagerRow, PagerView } from "./pagerModel";

export interface PagerProps {
	/** 要翻的內容，來自 `ShellExecution.pagers`。 */
	request: PagerRequest;
	/** 按 q、Esc 或 `:q` 離開時呼叫。 */
	onQuit: () => void;
	/** 讓終端機在玩家點到分頁器外面（標題列、底部列）時把焦點放回來。 */
	ref?: Ref<PagerHandle>;
}

/** 分頁器對外的操作。 */
export interface PagerHandle {
	focus: () => void;
}

/** 量好的尺寸，單位都是像素。 */
interface PagerMetrics {
	/** 放文字的寬度。 */
	width: number;
	/** 放文字的高度。 */
	height: number;
	/** 一個半形字的寬度。 */
	narrow: number;
	/** 一個全形字的寬度。 */
	wide: number;
	/** 一列的高度。 */
	rowHeight: number;
}

/** 量不到高度時（例如 jsdom）一頁幾列。 */
const FALLBACK_PAGE_SIZE = 20;

/** `less -N` 行號欄的寬度：七位數字加一個空白。 */
const LINE_NUMBER_COLUMNS = 8;

/** 量字寬用的樣本字數，量十個再平均比較準。 */
const PROBE_LENGTH = 10;

/** 給新手看的按鍵提示，放在狀態列右邊。 */
const KEY_HINT = "空白 下一頁　b 上一頁　/ 搜尋　q 離開";

/** Ctrl 搭配這些鍵是翻頁（Ctrl+F／B／D／U），其他 Ctrl 組合交給瀏覽器。 */
const CTRL_KEYS = new Set(["f", "b", "d", "u"]);

const ROW_CLASS = "h-7 overflow-hidden whitespace-pre leading-7";

/** 量文字區的寬高與字寬，量不到（寬或字寬是 0）時回傳 null。 */
function measure(container: HTMLElement, narrowProbe: HTMLElement, wideProbe: HTMLElement): PagerMetrics | null {
	const narrow = narrowProbe.getBoundingClientRect().width / PROBE_LENGTH;
	const wide = wideProbe.getBoundingClientRect().width / PROBE_LENGTH;
	const rowHeight = narrowProbe.getBoundingClientRect().height;
	if (container.clientWidth <= 0 || narrow <= 0 || rowHeight <= 0) {
		return null;
	}
	return { width: container.clientWidth, height: container.clientHeight, narrow, wide: wide || narrow * 2, rowHeight };
}

/** 依量到的尺寸把目前檔案折行、算出一頁幾列。 */
function buildView(lines: string[], metrics: PagerMetrics | null, lineNumbers: boolean, fileCount: number): PagerView {
	if (metrics === null) {
		return { lines, rows: wrapLines(lines, Infinity, charDisplayWidth), pageSize: FALLBACK_PAGE_SIZE, fileCount };
	}

	let maxWidth = metrics.width;
	if (lineNumbers) {
		maxWidth -= LINE_NUMBER_COLUMNS * metrics.narrow;
	}
	const widthOf = (char: string): number => {
		if (charDisplayWidth(char) === 2) {
			return metrics.wide;
		}
		return metrics.narrow;
	};
	const pageSize = Math.max(1, Math.floor(metrics.height / metrics.rowHeight));
	return { lines, rows: wrapLines(lines, Math.max(metrics.narrow, maxWidth), widthOf), pageSize, fileCount };
}

/** 行號欄：第一列印行號，折出來的列留空白對齊。 */
function lineNumberPrefix(row: PagerRow): string {
	if (!row.first) {
		return " ".repeat(LINE_NUMBER_COLUMNS);
	}
	return `${String(row.lineIndex + 1).padStart(LINE_NUMBER_COLUMNS - 1)} `;
}

/** 搜尋輸入框要交給 `pagerModel` 處理的鍵：送出、取消，以及空白輸入框的 Backspace（回到一般模式）。 */
function isSearchControlKey(event: KeyboardEvent<HTMLInputElement>): boolean {
	if (event.key === "Enter" || event.key === "Escape") {
		return true;
	}
	return event.key === "Backspace" && event.currentTarget.value === "";
}

/**
 * 全螢幕分頁器（`less`，M13-3）：蓋在終端機輸出區的位置，鍵盤只由它接收，翻完按 q 回到提示列。
 * 按鍵、搜尋與狀態列的規則在 `pagerModel.ts`；這裡負責量尺寸、折行、畫面與焦點。
 * 認得的鍵才 `preventDefault` 與 `stopPropagation`（F5、F12、Tab 這類交給瀏覽器）。
 * q、Esc 一定認得：Esc 只離開分頁、不關終端機，不能冒泡到暫停選單（usePauseMenu）的 window 監聽。
 *
 * `/`、`?` 搜尋時狀態列換成真的 `<input>` 並取得焦點：焦點留在 tabIndex 的 div 上輸入法不會啟動，
 * 中文與貼上只能靠真的輸入框。輸入框自己處理一般字元，Enter 送出、Esc 只取消搜尋，之後焦點回分頁器。
 */
export function Pager({ request, onQuit, ref }: PagerProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const narrowProbeRef = useRef<HTMLSpanElement>(null);
	const wideProbeRef = useRef<HTMLSpanElement>(null);
	const [metrics, setMetrics] = useState<PagerMetrics | null>(null);
	const [state, setState] = useState(createPagerState);

	useLayoutEffect(() => {
		const body = bodyRef.current;
		const narrowProbe = narrowProbeRef.current;
		const wideProbe = wideProbeRef.current;
		if (body === null || narrowProbe === null || wideProbe === null) {
			return;
		}
		const update = () => {
			setMetrics(measure(body, narrowProbe, wideProbe));
		};
		update();
		if (typeof ResizeObserver === "undefined") {
			return;
		}
		const observer = new ResizeObserver(update);
		observer.observe(body);
		return () => {
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		rootRef.current?.focus();
	}, []);
	useImperativeHandle(ref, () => ({ focus: () => rootRef.current?.focus() }), []);

	const isSearching = state.mode === "search";
	useEffect(() => {
		if (isSearching) {
			searchInputRef.current?.focus();
		}
	}, [isSearching]);

	const file = request.files[state.fileIndex] ?? request.files[0];
	const view = useMemo(
		() => buildView(file.lines, metrics, request.lineNumbers, request.files.length),
		[file, metrics, request.lineNumbers, request.files.length],
	);

	const top = Math.min(state.top, Math.max(0, view.rows.length - view.pageSize));
	const visibleRows = view.rows.slice(top, top + view.pageSize);
	const status = describePagerStatus(state, view, request);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		// 輸入法組字中、或是 Cmd／Alt 組合鍵，交給瀏覽器
		if (event.nativeEvent.isComposing || event.metaKey || event.altKey) {
			return;
		}
		if (event.ctrlKey && !CTRL_KEYS.has(event.key)) {
			return;
		}
		const result = handlePagerKey(state, { key: event.key, ctrlKey: event.ctrlKey }, view);
		if (!result.handled) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (result.quit) {
			onQuit();
			return;
		}
		setState(result.state);
	};

	/** 點分頁器時把焦點放回該接鍵盤的地方：搜尋中是輸入框，否則是分頁器本身。 */
	const focusActiveTarget = () => {
		if (isSearching) {
			searchInputRef.current?.focus();
			return;
		}
		rootRef.current?.focus();
	};

	const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		setState(setSearchInput(state, event.target.value));
	};

	const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// 輸入框裡的鍵都不往外傳：不讓分頁器把字當成翻頁鍵，也不讓 window 的 Esc 打開暫停選單
		event.stopPropagation();
		// 輸入法組字中的 Enter 是選字、Esc 是取消組字，交給輸入法（Safari 組字結束那一下 keyCode 是 229）
		if (event.nativeEvent.isComposing || event.keyCode === 229) {
			return;
		}
		if (!isSearchControlKey(event)) {
			return;
		}
		event.preventDefault();
		// 送出或取消後輸入框會卸載，焦點先交回分頁器，後面的 n、N、q 才接得到
		rootRef.current?.focus();
		setState(handlePagerKey(state, { key: event.key, ctrlKey: false }, view).state);
	};

	let statusBar = (
		<span role="status" className="truncate bg-game-text px-1 text-game-bg">
			{status}
		</span>
	);
	if (isSearching) {
		statusBar = (
			<span className="flex min-w-0 flex-1 items-center bg-game-text px-1 text-game-bg">
				<span aria-hidden>{state.searchDirection === "forward" ? "/" : "?"}</span>
				<input
					ref={searchInputRef}
					type="text"
					aria-label="搜尋內容"
					value={state.input}
					onChange={handleSearchChange}
					onKeyDown={handleSearchKeyDown}
					autoComplete="off"
					spellCheck={false}
					className="min-w-0 flex-1 bg-transparent text-game-bg caret-game-bg outline-none"
				/>
			</span>
		);
	}

	return (
		<div
			ref={rootRef}
			role="region"
			aria-label="less 分頁器"
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onClick={focusActiveTarget}
			className="flex min-h-0 flex-1 flex-col outline-none"
		>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
				<div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
					<span ref={narrowProbeRef} aria-hidden className={`invisible absolute inline-block ${ROW_CLASS}`}>
						{"0".repeat(PROBE_LENGTH)}
					</span>
					<span ref={wideProbeRef} aria-hidden className={`invisible absolute inline-block ${ROW_CLASS}`}>
						{"中".repeat(PROBE_LENGTH)}
					</span>
					{visibleRows.map((row, index) => (
						<div key={`${top + index}`} className={ROW_CLASS}>
							{request.lineNumbers && <span className="text-game-dim">{lineNumberPrefix(row)}</span>}
							<span>
								{highlightSegments(row.text, state.pattern).map((segment, segmentIndex) => {
									if (segment.match) {
										return (
											<mark key={segmentIndex} className="bg-game-text text-game-bg">
												{segment.text}
											</mark>
										);
									}
									return segment.text;
								})}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex shrink-0 items-center justify-between gap-4 px-3 py-1">
				{statusBar}
				<span className="shrink-0 text-game-dim">{KEY_HINT}</span>
			</div>
		</div>
	);
}
