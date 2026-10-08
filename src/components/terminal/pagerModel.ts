/**
 * 分頁器（`less`，M13-3）的純邏輯：折行、按鍵、搜尋、狀態列文字。
 * 畫面在 `Pager.tsx`，這裡不碰 React 與 DOM，方便用 node 環境測。
 *
 * 跟真的 less 對照：
 * - 翻頁、一行、半頁、頭尾的按鍵照 less 的預設鍵（空白／f／PageDown、b／PageUp、↓ j Enter、↑ k、d u、g G）。
 * - 往下翻到最後一頁就停（最後一行在畫面最下面），不會捲出空白。
 * - `/` 往下找、`?` 往上找，樣式照 less 用延伸正規表示式（跟 `grep -E` 同一套轉換）；
 *   新的搜尋往下從畫面最上面那行開始、往上從最下面那行開始，`n`／`N` 從上次找到的那行之後／之前接著找，不繞回。
 *   找到的那行放在畫面最上面（less 的預設 -j1），所有符合的片段都會標亮。
 * - 狀態列用 less -M 的格式（檔名、第幾個檔案、看到第幾行、百分比），翻到底顯示 `(END)`。
 *   百分比以行數計（less 以位元組計）。
 * - q、Q、Esc 離開；Esc 在 less 是組合鍵的前綴，這裡拿來離開，因為遊戲裡 Esc 本來就是「關掉這個畫面」。
 */

import { compileGrepPattern } from "@/game/shell/commands/grepPattern";
import type { PagerRequest } from "@/game/shell/types";

/** 畫面上的一列：哪一行折出來的、文字、是不是那行的第一列（行號只印在第一列）。 */
export interface PagerRow {
	lineIndex: number;
	text: string;
	first: boolean;
}

/** 目前檔案在畫面上的樣子，由元件依量到的寬高算好傳進來。 */
export interface PagerView {
	/** 目前檔案的原始行，搜尋用。 */
	lines: string[];
	/** 折行後的列。 */
	rows: PagerRow[];
	/** 一頁幾列（不含狀態列），至少 1。 */
	pageSize: number;
	/** 這次請求有幾個檔案，`:n`／`:p` 用。 */
	fileCount: number;
}

export type PagerSearchDirection = "forward" | "backward";

export interface PagerState {
	/** 正在看第幾個檔案。 */
	fileIndex: number;
	/** 畫面最上面是第幾列。 */
	top: number;
	/** `search` 是正在輸入搜尋樣式，`colon` 是按了 `:` 等下一個鍵。 */
	mode: "normal" | "search" | "colon";
	/** 正在輸入的搜尋方向。 */
	searchDirection: PagerSearchDirection;
	/** 正在輸入的搜尋樣式。 */
	input: string;
	/** 上一次確定的樣式，`n`／`N` 與標亮用。 */
	pattern: string | null;
	/** 上一次搜尋的方向，`n` 照它、`N` 反過來。 */
	lastDirection: PagerSearchDirection;
	/** 上一次找到的行，`n`／`N` 從它之後／之前接著找。 */
	targetLine: number | null;
	/** 狀態列要顯示的訊息，按下一個鍵就清掉。 */
	message: string | null;
}

export interface PagerKeyInput {
	/** `KeyboardEvent.key`。 */
	key: string;
	ctrlKey: boolean;
}

export interface PagerKeyResult {
	state: PagerState;
	/** true 代表離開分頁器。 */
	quit: boolean;
	/**
	 * 分頁器認不認得這個鍵。false 時狀態不變，元件不攔這個鍵（不 preventDefault、照常冒泡），
	 * F5、F12、Tab 這類鍵交給瀏覽器。
	 */
	handled: boolean;
}

/** 各模式內部的處理結果；null 代表不認得這個鍵。 */
type KeyOutcome = Omit<PagerKeyResult, "handled"> | null;

/** 是不是一個可以打進搜尋列的字（單一字元，F5、Tab、Shift 這類鍵名不算）。 */
function isCharacterKey(input: PagerKeyInput): boolean {
	return Array.from(input.key).length === 1 && !input.ctrlKey;
}

/** 狀態列的訊息。 */
export const PAGER_MESSAGES = {
	notFound: "找不到符合的內容（Pattern not found）",
	noPreviousSearch: "還沒搜尋過，先用 / 加關鍵字搜尋",
	invalidPattern: "搜尋樣式不合法，寫法跟 grep -E 一樣",
	noNextFile: "已經是最後一個檔案了",
	noPreviousFile: "已經是第一個檔案了",
} as const;

/** 全形字的 Unicode 範圍（East Asian Wide／Fullwidth 的常用區段）。 */
const WIDE_RANGES: [number, number][] = [
	[0x1100, 0x115f],
	[0x2e80, 0xa4cf],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe30, 0xfe4f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x20000, 0x3fffd],
];

/** 一個字在終端機佔幾格：中文與全形字兩格，其他一格。 */
export function charDisplayWidth(char: string): number {
	const code = char.codePointAt(0) ?? 0;
	for (const [start, end] of WIDE_RANGES) {
		if (code >= start && code <= end) {
			return 2;
		}
	}
	return 1;
}

/**
 * 把行折成畫面上的列：一列的寬度加總不超過 `maxWidth`，全形字不會被拆開。
 * `widthOf` 給每個字的寬度（元件用量到的像素，測試用格數）；`maxWidth` 是 `Infinity` 時不折行。
 */
export function wrapLines(lines: string[], maxWidth: number, widthOf: (char: string) => number): PagerRow[] {
	const rows: PagerRow[] = [];

	lines.forEach((line, lineIndex) => {
		let text = "";
		let width = 0;
		let first = true;

		for (const char of Array.from(line)) {
			const charWidth = widthOf(char);
			if (text !== "" && width + charWidth > maxWidth) {
				rows.push({ lineIndex, text, first });
				first = false;
				text = "";
				width = 0;
			}
			text += char;
			width += charWidth;
		}

		rows.push({ lineIndex, text, first });
	});

	return rows;
}

export function createPagerState(): PagerState {
	return {
		fileIndex: 0,
		top: 0,
		mode: "normal",
		searchDirection: "forward",
		input: "",
		pattern: null,
		lastDirection: "forward",
		targetLine: null,
		message: null,
	};
}

/** 最多能捲到第幾列：最後一列剛好在畫面最下面。 */
function maxTop(view: PagerView): number {
	return Math.max(0, view.rows.length - view.pageSize);
}

function clampTop(top: number, view: PagerView): number {
	return Math.min(Math.max(0, top), maxTop(view));
}

/** 畫面上實際的最上面一列（視窗變小時 `state.top` 可能超過範圍）。 */
function effectiveTop(state: PagerState, view: PagerView): number {
	return clampTop(state.top, view);
}

/** 第 `lineIndex` 行的第一列是第幾列。 */
function firstRowOfLine(lineIndex: number, view: PagerView): number {
	const index = view.rows.findIndex((row) => row.lineIndex === lineIndex);
	return Math.max(0, index);
}

/** 畫面上看得到的邏輯行範圍（從 1 起算）；沒有內容時是 0-0。 */
export function visibleLineRange(state: PagerState, view: PagerView): { first: number; last: number } {
	if (view.rows.length === 0) {
		return { first: 0, last: 0 };
	}
	const top = effectiveTop(state, view);
	const bottom = Math.min(view.rows.length, top + view.pageSize) - 1;
	return { first: view.rows[top].lineIndex + 1, last: view.rows[bottom].lineIndex + 1 };
}

/** 是不是已經看到最後一行。 */
function isAtEnd(state: PagerState, view: PagerView): boolean {
	return effectiveTop(state, view) >= maxTop(view);
}

/**
 * 找下一個符合的行。`from` 是開始找的行（含），往 `direction` 走，不繞回。
 * 樣式不合法回傳 `invalid`，找不到回傳 null。
 */
function findMatch(
	lines: string[],
	pattern: string,
	from: number,
	direction: PagerSearchDirection,
): number | null | "invalid" {
	const compiled = compileGrepPattern(pattern, "extended", false);
	if (!compiled.ok) {
		return "invalid";
	}
	const step = direction === "forward" ? 1 : -1;
	for (let index = from; index >= 0 && index < lines.length; index += step) {
		if (compiled.test(lines[index])) {
			return index;
		}
	}
	return null;
}

/** 執行一次搜尋，`from` 是開始找的行（含）。 */
function runSearch(
	state: PagerState,
	view: PagerView,
	pattern: string,
	direction: PagerSearchDirection,
	from: number,
): PagerState {
	const base: PagerState = { ...state, mode: "normal", input: "", pattern, lastDirection: direction };
	const found = findMatch(view.lines, pattern, from, direction);
	if (found === "invalid") {
		return { ...base, pattern: state.pattern, message: PAGER_MESSAGES.invalidPattern };
	}
	if (found === null) {
		return { ...base, message: PAGER_MESSAGES.notFound };
	}
	return { ...base, targetLine: found, top: clampTop(firstRowOfLine(found, view), view) };
}

/** 新的搜尋：往下從畫面最上面那行開始，往上從畫面最下面那行開始。 */
function startSearch(state: PagerState, view: PagerView, pattern: string, direction: PagerSearchDirection): PagerState {
	const range = visibleLineRange(state, view);
	let from = Math.max(0, range.first - 1);
	if (direction === "backward") {
		from = Math.max(0, range.last - 1);
	}
	return runSearch(state, view, pattern, direction, from);
}

/** `n`／`N`：從上次找到的那行之後／之前接著找。 */
function repeatSearch(state: PagerState, view: PagerView, reverse: boolean): PagerState {
	if (state.pattern === null) {
		return { ...state, message: PAGER_MESSAGES.noPreviousSearch };
	}
	let direction = state.lastDirection;
	if (reverse) {
		direction = direction === "forward" ? "backward" : "forward";
	}

	const step = direction === "forward" ? 1 : -1;
	let from: number;
	if (state.targetLine !== null) {
		from = state.targetLine + step;
	} else {
		const range = visibleLineRange(state, view);
		from = direction === "forward" ? Math.max(0, range.first - 1) : Math.max(0, range.last - 1);
	}

	const next = runSearch(state, view, state.pattern, direction, from);
	// N 是一次性的反方向，下一次 n 還是照原本的方向
	return { ...next, lastDirection: state.lastDirection };
}

/** 搜尋輸入模式的按鍵；不認得的鍵回傳 null。 */
function handleSearchKey(state: PagerState, input: PagerKeyInput, view: PagerView): PagerState | null {
	if (input.key === "Escape") {
		return { ...state, mode: "normal", input: "" };
	}
	if (input.key === "Backspace") {
		if (state.input === "") {
			return { ...state, mode: "normal" };
		}
		return { ...state, input: Array.from(state.input).slice(0, -1).join("") };
	}
	if (input.key === "Enter") {
		// 空白的 / 沿用上一次的樣式，跟 less 一樣
		const pattern = state.input === "" ? state.pattern : state.input;
		if (pattern === null) {
			return { ...state, mode: "normal", message: PAGER_MESSAGES.noPreviousSearch };
		}
		return startSearch(state, view, pattern, state.searchDirection);
	}
	if (isCharacterKey(input)) {
		return { ...state, input: state.input + input.key };
	}
	return null;
}

/**
 * 搜尋輸入框的內容變了（`Pager` 進搜尋模式時在狀態列放真的 `<input>`）。
 * 輸入法送出的中文、貼上的文字都是一次換掉整段，不是一個一個按鍵；不在搜尋模式時不動。
 */
export function setSearchInput(state: PagerState, text: string): PagerState {
	if (state.mode !== "search") {
		return state;
	}
	return { ...state, input: text, message: null };
}

/** 按了 `:` 之後的下一個鍵；F5 這類不是字的鍵不認得（回傳 null），仍在等下一個鍵。 */
function handleColonKey(state: PagerState, input: PagerKeyInput, view: PagerView): KeyOutcome {
	const normal: PagerState = { ...state, mode: "normal" };
	if (input.key === "q" || input.key === "Q") {
		return { state: normal, quit: true };
	}
	if (input.key === "n") {
		if (state.fileIndex >= view.fileCount - 1) {
			return { state: { ...normal, message: PAGER_MESSAGES.noNextFile }, quit: false };
		}
		return { state: { ...normal, fileIndex: state.fileIndex + 1, top: 0, targetLine: null }, quit: false };
	}
	if (input.key === "p") {
		if (state.fileIndex <= 0) {
			return { state: { ...normal, message: PAGER_MESSAGES.noPreviousFile }, quit: false };
		}
		return { state: { ...normal, fileIndex: state.fileIndex - 1, top: 0, targetLine: null }, quit: false };
	}
	// 接別的字或 Esc 就取消
	if (input.key === "Escape" || isCharacterKey(input)) {
		return { state: normal, quit: false };
	}
	return null;
}

/** 一般模式的按鍵：照 less 的預設鍵；不認得的鍵回傳 null。 */
function handleNormalKey(state: PagerState, input: PagerKeyInput, view: PagerView): KeyOutcome {
	const top = effectiveTop(state, view);
	const half = Math.max(1, Math.floor(view.pageSize / 2));
	const scrollTo = (next: number): KeyOutcome => ({ state: { ...state, top: clampTop(next, view) }, quit: false });
	const { key, ctrlKey } = input;

	if (ctrlKey) {
		switch (key) {
			case "f":
				return scrollTo(top + view.pageSize);
			case "b":
				return scrollTo(top - view.pageSize);
			case "d":
				return scrollTo(top + half);
			case "u":
				return scrollTo(top - half);
			default:
				return null;
		}
	}

	switch (key) {
		case "q":
		case "Q":
		case "Escape":
			return { state, quit: true };
		case " ":
		case "f":
		case "PageDown":
			return scrollTo(top + view.pageSize);
		case "b":
		case "PageUp":
			return scrollTo(top - view.pageSize);
		case "ArrowDown":
		case "j":
		case "Enter":
		case "e":
			return scrollTo(top + 1);
		case "ArrowUp":
		case "k":
		case "y":
			return scrollTo(top - 1);
		case "d":
			return scrollTo(top + half);
		case "u":
			return scrollTo(top - half);
		case "g":
		case "Home":
		case "<":
			return scrollTo(0);
		case "G":
		case "End":
		case ">":
			return scrollTo(maxTop(view));
		case "/":
			return { state: { ...state, mode: "search", searchDirection: "forward", input: "" }, quit: false };
		case "?":
			return { state: { ...state, mode: "search", searchDirection: "backward", input: "" }, quit: false };
		case "n":
			return { state: repeatSearch(state, view, false), quit: false };
		case "N":
			return { state: repeatSearch(state, view, true), quit: false };
		case ":":
			return { state: { ...state, mode: "colon" }, quit: false };
		default:
			return null;
	}
}

/** 處理一個按鍵。認得的鍵先清掉上一個訊息；不認得的鍵狀態原封不動，回報 `handled: false`。 */
export function handlePagerKey(state: PagerState, input: PagerKeyInput, view: PagerView): PagerKeyResult {
	const cleared: PagerState = { ...state, message: null };
	let outcome: KeyOutcome;
	if (state.mode === "search") {
		const next = handleSearchKey(cleared, input, view);
		outcome = next === null ? null : { state: next, quit: false };
	} else if (state.mode === "colon") {
		outcome = handleColonKey(cleared, input, view);
	} else {
		outcome = handleNormalKey(cleared, input, view);
	}
	if (outcome === null) {
		return { state, quit: false, handled: false };
	}
	return { ...outcome, handled: true };
}

/** 狀態列文字：輸入中顯示輸入列，有訊息顯示訊息，否則照 less -M 顯示位置。 */
export function describePagerStatus(state: PagerState, view: PagerView, request: PagerRequest): string {
	if (state.mode === "search") {
		const prompt = state.searchDirection === "forward" ? "/" : "?";
		return `${prompt}${state.input}`;
	}
	if (state.mode === "colon") {
		return ":";
	}
	if (state.message !== null) {
		return state.message;
	}

	const parts: string[] = [];
	const file = request.files[state.fileIndex];
	if (file !== undefined && file.name !== null) {
		parts.push(file.name);
	}
	if (request.files.length > 1) {
		parts.push(`(file ${state.fileIndex + 1} of ${request.files.length})`);
	}
	if (view.lines.length > 0) {
		const range = visibleLineRange(state, view);
		parts.push(`lines ${range.first}-${range.last}/${view.lines.length}`);
	}

	if (!isAtEnd(state, view)) {
		const range = visibleLineRange(state, view);
		parts.push(`${Math.floor((range.last / view.lines.length) * 100)}%`);
		return parts.join(" ");
	}

	parts.push("(END)");
	const next = request.files[state.fileIndex + 1];
	if (next !== undefined) {
		parts.push(`- Next: ${next.name ?? "(stdin)"}`);
	}
	return parts.join(" ");
}

/** 一列裡的一段文字，`match` 代表要標亮。 */
export interface HighlightSegment {
	text: string;
	match: boolean;
}

/** 把一列切成符合與不符合搜尋樣式的片段；沒有樣式或樣式不合法時整列一段。 */
export function highlightSegments(text: string, pattern: string | null): HighlightSegment[] {
	if (pattern === null || text === "") {
		return [{ text, match: false }];
	}
	const compiled = compileGrepPattern(pattern, "extended", false);
	if (!compiled.ok) {
		return [{ text, match: false }];
	}

	const segments: HighlightSegment[] = [];
	let cursor = 0;
	for (const matched of compiled.matches(text)) {
		const start = text.indexOf(matched, cursor);
		if (start < 0) {
			continue;
		}
		if (start > cursor) {
			segments.push({ text: text.slice(cursor, start), match: false });
		}
		segments.push({ text: matched, match: true });
		cursor = start + matched.length;
	}
	if (cursor < text.length) {
		segments.push({ text: text.slice(cursor), match: false });
	}
	if (segments.length === 0) {
		return [{ text, match: false }];
	}
	return segments;
}
