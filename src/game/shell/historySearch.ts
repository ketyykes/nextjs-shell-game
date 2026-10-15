/**
 * Ctrl+R 歷史搜尋（第十九場，bash 的 reverse-i-search）。
 *
 * 純函式，狀態放在 `HistorySearchState`，UI（`useTerminalKeyboard`）每按一個鍵就換成新的狀態：
 * - 按 Ctrl+R 進入：`startHistorySearch(輸入列目前的內容)`。
 * - 打字、刪字：`updateSearchQuery`。關鍵字變長時從目前符合的那筆往舊找（bash 行為，目前那筆還符合就留著）；
 *   其他改法（刪字、貼上整段）從最新的重新找。比對是子字串，分大小寫。
 * - 再按 Ctrl+R：`searchOlder` 往更舊找下一筆，跟目前那筆一模一樣的重複歷史跳過（readline 行為）；
 *   關鍵字空白時沿用上一次搜尋的關鍵字。
 * - 找不到時 `failed` 為 true，`matchIndex` 留在上一筆符合的（畫面上還看得到它），跟 bash 一樣。
 * - 離開：`acceptSearch` 帶回目前符合的那筆（Enter 直接執行它，Esc、←、→ 放回輸入列），
 *   沒有符合的就留著原本的輸入；`cancelSearch`（Ctrl+G）還原進搜尋前的輸入列。
 *
 * 歷史陣列最舊在前，跟 `Shell.historyEntries` 一樣。這個檔案不可以 import React 或 Phaser。
 */

export interface HistorySearchState {
	/** 按 Ctrl+R 之前輸入列上的內容，Ctrl+G 取消或一筆都沒找到時還原。 */
	originalLine: string;
	/** 搜尋的關鍵字。 */
	query: string;
	/** 目前符合的那筆在歷史裡的索引（最舊是 0）；還沒找到過是 null。 */
	matchIndex: number | null;
	/** 最近一次搜尋沒有找到（提示符顯示 failed）。 */
	failed: boolean;
}

/** 從 `from`（含）往舊找第一筆含 `query`、而且不等於 `skip` 的歷史，找不到回 null。 */
function findOlder(history: readonly string[], query: string, from: number, skip: string | null): number | null {
	for (let index = Math.min(from, history.length - 1); index >= 0; index -= 1) {
		const entry = history[index];
		if (entry !== skip && entry.includes(query)) {
			return index;
		}
	}
	return null;
}

/** 搜尋的結果套回狀態：找到就換成那一筆，找不到就標失敗、留著上一筆。 */
function applyFound(state: HistorySearchState, query: string, found: number | null): HistorySearchState {
	if (found === null) {
		return { ...state, query, failed: true };
	}
	return { ...state, query, matchIndex: found, failed: false };
}

/** 按下 Ctrl+R 進入搜尋模式。 */
export function startHistorySearch(originalLine: string): HistorySearchState {
	return { originalLine, query: "", matchIndex: null, failed: false };
}

/** 關鍵字改成 `query` 之後重新搜尋。 */
export function updateSearchQuery(history: readonly string[], state: HistorySearchState, query: string): HistorySearchState {
	if (query === "") {
		return { ...state, query, matchIndex: null, failed: false };
	}

	const extendsQuery = state.query !== "" && query.startsWith(state.query);
	let from = history.length - 1;
	if (extendsQuery && state.matchIndex !== null) {
		from = state.matchIndex;
	}
	return applyFound(state, query, findOlder(history, query, from, null));
}

/** 再按一次 Ctrl+R：往更舊找下一筆。關鍵字空白時用 `lastQuery`（上一次搜尋的關鍵字），從最新的開始找。 */
export function searchOlder(history: readonly string[], state: HistorySearchState, lastQuery = ""): HistorySearchState {
	if (state.query === "") {
		if (lastQuery === "") {
			return state;
		}
		return applyFound(state, lastQuery, findOlder(history, lastQuery, history.length - 1, null));
	}

	if (state.matchIndex === null) {
		return applyFound(state, state.query, findOlder(history, state.query, history.length - 1, null));
	}
	const skip = history[state.matchIndex] ?? null;
	return applyFound(state, state.query, findOlder(history, state.query, state.matchIndex - 1, skip));
}

/** 目前符合的那一筆；還沒找到過是 null。 */
export function currentMatch(history: readonly string[], state: HistorySearchState): string | null {
	if (state.matchIndex === null) {
		return null;
	}
	return history[state.matchIndex] ?? null;
}

/** 離開搜尋並採用結果（Enter、Esc、←、→）：目前符合的那筆，沒有就是原本的輸入。 */
export function acceptSearch(history: readonly string[], state: HistorySearchState): string {
	return currentMatch(history, state) ?? state.originalLine;
}

/** Ctrl+G：放棄搜尋，還原進搜尋前的輸入列。 */
export function cancelSearch(state: HistorySearchState): string {
	return state.originalLine;
}

/** 搜尋模式的提示符開頭（關鍵字前面那一段），照 bash 的寫法。 */
export function searchPromptLabel(state: HistorySearchState): string {
	if (state.failed) {
		return "(failed reverse-i-search)`";
	}
	return "(reverse-i-search)`";
}
