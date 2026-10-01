"use client";

import type { KeyboardEvent, RefObject } from "react";

export interface PromptInputProps {
	/** 提示符，例如 `crew@kepler9:~$`。 */
	prompt: string;
	value: string;
	onChange: (value: string) => void;
	onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	/** 即時提示（例如偵測到全形字元），有值時在輸入列下方顯示一行琥珀色文字。 */
	warning?: string;
}

/** 終端機的輸入列：提示符加一個透明的受控輸入框。 */
export function PromptInput({ prompt, value, onChange, onKeyDown, inputRef, warning }: PromptInputProps) {
	return (
		<div>
			<div className="flex items-baseline gap-2">
				<span className="shrink-0 text-game-prompt">{prompt}</span>
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
					aria-label="指令輸入"
					className="min-w-0 flex-1 border-0 bg-transparent p-0 font-terminal text-lg text-game-text caret-game-text outline-none"
				/>
			</div>
			{warning !== undefined && warning !== "" && (
				<p role="alert" className="text-game-amber">
					{warning}
				</p>
			)}
		</div>
	);
}
