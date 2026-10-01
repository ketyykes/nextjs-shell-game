import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
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

export interface TerminalKeyboard {
	/** 輸入框目前的內容。 */
	value: string;
	/** 輸入框的 onChange。 */
	handleChange: (value: string) => void;
	/** 輸入框的 onKeyDown。 */
	handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
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
 * 終端機的鍵盤處理：Enter 執行、Tab 補全、↑↓ 歷史、Esc 關閉。
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

	const submit = useCallback(() => {
		// 提示符要在 execute 之前取，cd 會改變工作目錄
		const prompt = shell.prompt();
		const execution = shell.execute(value);

		if (execution.clearScreen) {
			onEntriesChange([]);
		} else {
			onEntriesChange([
				...entries,
				{
					kind: "command",
					id: createId(),
					prompt,
					input: value,
					lines: execution.lines,
					isError: execution.isError,
				},
			]);
		}

		setValue("");
		onExecuted?.(execution);
	}, [shell, value, entries, onEntriesChange, onExecuted, createId]);

	const completeInput = useCallback(() => {
		const result = shell.complete(value);
		replaceInput(result.completed);

		// 多個候選時跟 bash 一樣把候選列出來
		if (result.candidates.length > 1) {
			onEntriesChange([
				...entries,
				{
					kind: "system",
					id: createId(),
					lines: [result.candidates.join("  ")],
				},
			]);
		}
	}, [shell, value, entries, onEntriesChange, replaceInput, createId]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			// 組字中的按鍵交給輸入法（例如注音選字的 Enter、取消組字的 Esc）
			if (isImeComposing(event)) {
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
					// PlayScreen 的暫停選單監聽掛在 window，而且會在終端機關閉的同一個事件裡重新掛回去，
					// 不擋下來的話，這一下 Esc 會同時關終端機又打開暫停選單。
					event.stopPropagation();
					onClose();
					break;
				}
				default:
					break;
			}
		},
		[shell, submit, completeInput, replaceInput, onClose],
	);

	return { value, handleChange: setValue, handleKeyDown };
}
