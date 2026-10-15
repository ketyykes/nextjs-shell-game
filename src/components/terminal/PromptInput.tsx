"use client";

import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { cn } from "@/lib/utils";
import type { HistorySearchView } from "./useTerminalKeyboard";

export interface PromptInputProps {
	/** 提示符，例如 `crew@kepler9:~$`。 */
	prompt: string;
	value: string;
	onChange: (value: string) => void;
	onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	/** 即時提示（例如偵測到全形字元），有值時在輸入列下方顯示一行琥珀色文字。 */
	warning?: string;
	/**
	 * Ctrl+R 歷史搜尋模式（第十九場）：提示符換成 bash 的 `(reverse-i-search)\`關鍵字': 符合的那筆`，
	 * 輸入框改打關鍵字（`value` 是關鍵字），符合的那筆接在後面顯示。沒給或 null 是一般輸入列。
	 */
	search?: HistorySearchView | null;
}

/** 關鍵字輸入框的寬度（以 `ch` 計）：中文這類全形字算兩格，多留一格放游標。 */
function queryWidth(query: string): number {
	let width = 1;
	for (const char of query) {
		const codePoint = char.codePointAt(0) ?? 0;
		if (codePoint >= 0x2e80) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}

/**
 * 終端機的輸入列：提示符加一個透明的受控輸入框。
 * 搜尋模式只換提示符、輸入框的寬度與標籤，並在後面接符合的那筆；輸入框是同一個元素，焦點與輸入法狀態不會斷。
 */
export function PromptInput({ prompt, value, onChange, onKeyDown, inputRef, warning, search }: PromptInputProps) {
	const searching = search !== undefined && search !== null;

	let label = prompt;
	let ariaLabel = "指令輸入";
	let inputStyle: CSSProperties | undefined;
	if (searching) {
		label = search.label;
		ariaLabel = "歷史搜尋關鍵字";
		inputStyle = { width: `${queryWidth(value)}ch` };
	}

	return (
		<div>
			<div className={cn("flex items-baseline", !searching && "gap-2")}>
				<span className="shrink-0 text-game-prompt">{label}</span>
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={onKeyDown}
					autoFocus
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					aria-label={ariaLabel}
					style={inputStyle}
					className={cn(
						"border-0 bg-transparent p-0 font-terminal text-lg text-game-text caret-game-text outline-none",
						searching ? "shrink-0" : "min-w-0 flex-1",
					)}
				/>
				{searching && (
					<span className="min-w-0 break-all whitespace-pre-wrap text-game-text">{`': ${search.match}`}</span>
				)}
			</div>
			{warning !== undefined && warning !== "" && (
				<p role="alert" className="text-game-amber">
					{warning}
				</p>
			)}
		</div>
	);
}
