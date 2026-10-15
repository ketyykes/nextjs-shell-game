import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { formatCompletionCandidates } from "@/game/shell/completion";
import {
	acceptSearch,
	cancelSearch,
	currentMatch,
	searchOlder,
	searchPromptLabel,
	startHistorySearch,
	updateSearchQuery,
} from "@/game/shell/historySearch";
import type { HistorySearchState } from "@/game/shell/historySearch";
import type { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import type { OutputEntry } from "@/game/store/types";

export interface UseTerminalKeyboardOptions {
	shell: Shell;
	/** 目前的輸出區內容，新區塊會接在後面交給 `onEntriesChange`。 */
	entries: OutputEntry[];
	onEntriesChange: (next: OutputEntry[]) => void;
	onExecuted?: (execution: ShellExecution) => void;
	onClose: () => void;
	inputRef: RefObject<HTMLInputElement | null>;
}

/** Ctrl+R 搜尋模式時輸入列要顯示的東西（第十九場）。 */
export interface HistorySearchView {
	/** 關鍵字前面的提示符：`(reverse-i-search)\``，找不到時 `(failed reverse-i-search)\``。 */
	label: string;
	/** 關鍵字後面顯示的那筆歷史；還沒找到時是按 Ctrl+R 之前的輸入。 */
	match: string;
}

export interface TerminalKeyboard {
	/** 輸入框目前的內容；Ctrl+R 搜尋模式時是搜尋的關鍵字。 */
	value: string;
	/** 輸入框的 onChange。 */
	handleChange: (value: string) => void;
	/** 輸入框的 onKeyDown。 */
	handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	/** Ctrl+R 搜尋模式時的提示符內容，不在搜尋模式是 null。 */
	search: HistorySearchView | null;
}

/**
 * 判斷這次按鍵是否發生在輸入法組字中。
 * Safari 在組字結束的那一下 Enter，`isComposing` 會是 false 但 `keyCode` 是 229，一併攔下。
 */
function isImeComposing(event: KeyboardEvent<HTMLInputElement>): boolean {
	if (event.nativeEvent.isComposing) {
		return true;
	}
	return event.nativeEvent.keyCode === 229;
}

/**
 * 是不是單純的 Ctrl+字母：Mac 也是 Control 鍵（不是 Command），加了 Shift、Alt 的不算
 * （Ctrl+Shift+R 是瀏覽器的強制重新整理，留給瀏覽器）。
 */
function isCtrlLetter(event: KeyboardEvent<HTMLInputElement>, letter: string): boolean {
	if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
		return false;
	}
	return event.key.toLowerCase() === letter;
}

/**
 * 終端機的鍵盤處理：Enter 執行、Tab 補全、↑↓ 歷史、Esc 關閉、Ctrl+R 搜尋歷史。
 * 輸入框內容由這個 hook 持有，輸出區內容由父層持有。
 */
export function useTerminalKeyboard({
	shell,
	entries,
	onEntriesChange,
	onExecuted,
	onClose,
	inputRef,
}: UseTerminalKeyboardOptions): TerminalKeyboard {
	const [value, setValue] = useState("");
	const idCounterRef = useRef(0);
	/** 下一次 value 更新後要把游標移到結尾（歷史與補全換掉整行時用）。 */
	const caretToEndRef = useRef(false);

	useLayoutEffect(() => {
		if (!caretToEndRef.current) {
			return;
		}
		caretToEndRef.current = false;
		const input = inputRef.current;
		if (input !== null) {
			input.setSelectionRange(value.length, value.length);
		}
	}, [value, inputRef]);

	const createId = useCallback((): string => {
		idCounterRef.current += 1;
		return `entry-${Date.now()}-${idCounterRef.current}`;
	}, []);

	const replaceInput = useCallback((next: string) => {
		caretToEndRef.current = true;
		setValue(next);
	}, []);

	const submitLine = useCallback((line: string) => {
		// 提示符要在 execute 之前取，cd 會改變工作目錄
		const prompt = shell.prompt();
		const execution = shell.execute(line);

		const entry: OutputEntry = {
			kind: "command",
			id: createId(),
			prompt,
			input: line,
			lines: execution.lines,
			isError: execution.isError,
		};

		if (!execution.clearScreen) {
			onEntriesChange([...entries, entry]);
		} else if (execution.lines.length > 0) {
			// `clear ; pwd` 這種寫法：清完畫面之後同一行還有輸出（shell 已經丟掉 clear 之前的），只留這一行
			onEntriesChange([entry]);
		} else {
			onEntriesChange([]);
		}

		setValue("");
		onExecuted?.(execution);
	}, [shell, entries, onEntriesChange, onExecuted, createId]);

	const submit = useCallback(() => {
		submitLine(value);
	}, [submitLine, value]);

	const completeInput = useCallback(() => {
		const result = shell.complete(value);
		replaceInput(result.completed);

		// 多個候選時跟 bash 一樣把候選列出來；指令選項附說明，一行一個
		if (result.candidates.length > 1) {
			onEntriesChange([
				...entries,
				{
					kind: "system",
					id: createId(),
					lines: formatCompletionCandidates(result),
				},
			]);
		}
	}, [shell, value, entries, onEntriesChange, replaceInput, createId]);

	// ---- Ctrl+R 歷史搜尋（第十九場），純邏輯在 `@/game/shell/historySearch` ----
	const [search, setSearch] = useState<HistorySearchState | null>(null);
	/** 上一次搜尋的關鍵字：關鍵字空白時再按 Ctrl+R 沿用它（bash 行為）。 */
	const lastSearchQueryRef = useRef("");

	/** 離開搜尋模式：記下關鍵字，輸入列換成 `next`。 */
	const finishSearch = useCallback(
		(state: HistorySearchState, next: string) => {
			if (state.query !== "") {
				lastSearchQueryRef.current = state.query;
			}
			setSearch(null);
			// 搜尋時 value 一直留著原本的輸入；沒變的話 replaceInput 的游標 effect 不會跑，旗標會殘留到下一次打字，
			// 這時輸入框從關鍵字換回原本的內容，瀏覽器自己會把游標放到結尾
			if (next === value) {
				return;
			}
			replaceInput(next);
		},
		[replaceInput, value],
	);

	/** 搜尋模式時輸入框的 onChange：改的是關鍵字，改完馬上重找。 */
	const handleChange = useCallback(
		(next: string) => {
			if (search === null) {
				setValue(next);
				return;
			}
			setSearch(updateSearchQuery(shell.historyEntries, search, next));
		},
		[shell, search],
	);

	/**
	 * 搜尋模式時的按鍵。Enter 照 bash 直接執行符合的那筆；Esc、←、→（以及 ↑、↓、Tab）把它帶回輸入列；
	 * Ctrl+G 放棄、還原原本的輸入。打字與 Backspace 交給輸入框的 onChange。
	 */
	const handleSearchKey = useCallback(
		(event: KeyboardEvent<HTMLInputElement>, state: HistorySearchState): void => {
			const history = shell.historyEntries;
			if (isCtrlLetter(event, "g")) {
				event.preventDefault();
				finishSearch(state, cancelSearch(state));
				return;
			}
			switch (event.key) {
				case "Enter": {
					event.preventDefault();
					if (state.query !== "") {
						lastSearchQueryRef.current = state.query;
					}
					setSearch(null);
					submitLine(acceptSearch(history, state));
					break;
				}
				case "Escape": {
					// 只取消搜尋，不關終端機（跟 less 的 Esc 一樣），也不往 window 傳
					event.preventDefault();
					event.stopPropagation();
					finishSearch(state, acceptSearch(history, state));
					break;
				}
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown":
				case "Tab": {
					event.preventDefault();
					finishSearch(state, acceptSearch(history, state));
					break;
				}
				default:
					break;
			}
		},
		[shell, finishSearch, submitLine],
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			// 組字中的按鍵交給輸入法（例如注音選字的 Enter、取消組字的 Esc）
			if (isImeComposing(event)) {
				return;
			}

			if (isCtrlLetter(event, "r")) {
				// 瀏覽器的 Ctrl+R 是重新整理，一定要擋
				event.preventDefault();
				if (search === null) {
					setSearch(startHistorySearch(value));
				} else {
					setSearch(searchOlder(shell.historyEntries, search, lastSearchQueryRef.current));
				}
				return;
			}
			if (search !== null) {
				handleSearchKey(event, search);
				return;
			}

			switch (event.key) {
				case "Enter": {
					event.preventDefault();
					submit();
					break;
				}
				case "Tab": {
					// 擋掉預設行為，避免焦點跳出終端機
					event.preventDefault();
					completeInput();
					break;
				}
				case "ArrowUp": {
					// 擋掉預設行為，避免游標跳到行首
					event.preventDefault();
					const previous = shell.historyUp();
					if (previous !== null) {
						replaceInput(previous);
					}
					break;
				}
				case "ArrowDown": {
					event.preventDefault();
					replaceInput(shell.historyDown());
					break;
				}
				case "Escape": {
					event.preventDefault();
					// 關閉是終端機自己的事，不讓 keydown 繼續冒泡到 window：
					// 暫停選單（usePauseMenu）的監聽掛在 window，而且會在終端機關閉的同一個事件裡重新掛回去，
					// 不擋下來的話，這一下 Esc 會同時關終端機又打開暫停選單。
					event.stopPropagation();
					onClose();
					break;
				}
				default:
					break;
			}
		},
		[shell, submit, completeInput, replaceInput, onClose, search, value, handleSearchKey],
	);

	if (search === null) {
		return { value, handleChange, handleKeyDown, search: null };
	}
	const history = shell.historyEntries;
	const view: HistorySearchView = {
		label: searchPromptLabel(search),
		match: currentMatch(history, search) ?? search.originalLine,
	};
	return { value: search.query, handleChange, handleKeyDown, search: view };
}
