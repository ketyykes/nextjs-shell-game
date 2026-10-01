"use client";

import { useTypewriter } from "./useTypewriter";

export interface DialogueBlockProps {
	/** 說話者，目前只有 NOVA。 */
	speaker: "NOVA";
	text: string;
	/** 每個字的毫秒數，通常由 `TEXT_SPEED_MS[textSpeed]` 取得；0 代表直接全部顯示。 */
	msPerChar: number;
}

/**
 * 終端機輸出區裡的 NOVA 對話區塊（設計文件 4.9）：
 * 左側全息藍邊、上方名字標籤、文字逐字出現，跟指令輸出排在一起，不打斷打字。
 */
export function DialogueBlock({ speaker, text, msPerChar }: DialogueBlockProps) {
	const displayed = useTypewriter(text, msPerChar);

	return (
		<div className="my-1 border-l-[3px] border-game-holo pl-3" data-testid="dialogue-block">
			<div className="text-sm text-game-holo">{speaker}</div>
			{/* 螢幕閱讀器直接讀全文，避免逐字朗讀 */}
			<span className="sr-only">{text}</span>
			<p
				aria-hidden="true"
				className="break-all whitespace-pre-wrap text-game-holo"
				data-testid="dialogue-text"
			>
				{displayed}
			</p>
		</div>
	);
}
