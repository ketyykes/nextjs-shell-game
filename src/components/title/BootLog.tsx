"use client";

import { useEffect, useRef, useState } from "react";
import { DialogueBlock } from "@/components/terminal/DialogueBlock";
import { TerminalFrame } from "@/components/terminal/TerminalFrame";
import { useTypewriter } from "@/components/terminal/useTypewriter";
import { TEXT_SPEED_MS, type TextSpeed } from "@/game/store/types";
import { cn } from "@/lib/utils";

export interface BootLogProps {
	textSpeed: TextSpeed;
	/** NOVA 第一句話，顯示在 boot log 最後 */
	novaFirstLine: string;
	onDone: () => void;
	/** 測試用：每行之間的停頓毫秒，預設 350 */
	lineGapMs?: number;
}

/** 行的語氣：normal 冷藍白、dim 次要、amber 警示（查無此人）。 */
export type BootLineTone = "normal" | "dim" | "amber";

export interface BootLine {
	text: string;
	tone: BootLineTone;
}

/**
 * 喚醒程序的 boot log（設計文件 4.7）。
 *
 * 注意：
 * - 不指涉主角的性別、年齡與名字（設計文件 4.1）。
 * - 相鄰兩行文字不可完全相同：打字動畫以「原文換掉」判斷是否從頭打，兩行一樣會直接跳過動畫。
 */
export const BOOT_LINES: readonly BootLine[] = [
	{ text: "KEPLER-9 LIFE SUPPORT v2.3", tone: "normal" },
	{ text: "(c) KEPLER-9 STATION SYSTEMS · BUILD 0611", tone: "dim" },
	{ text: "正在喚醒 pod_06……", tone: "normal" },
	{ text: "解凍程序………… 100%", tone: "normal" },
	{ text: "檢查生命跡象……正常", tone: "normal" },
	{ text: "心率 52 bpm · 血氧 94%", tone: "dim" },
	{ text: "查詢船員名單……", tone: "normal" },
	{ text: "查無此人", tone: "amber" },
	{ text: "重試 1/3……查無此人", tone: "amber" },
	{ text: "重試 2/3……查無此人", tone: "amber" },
	{ text: "重試 3/3……查無此人", tone: "amber" },
	{ text: "略過。", tone: "normal" },
	{ text: "主電源離線。低功率模式。", tone: "normal" },
	{ text: "移交站務系統……", tone: "dim" },
];

const DEFAULT_LINE_GAP_MS = 350;

const TONE_CLASS: Record<BootLineTone, string> = {
	normal: "text-game-text",
	dim: "text-game-dim",
	amber: "text-game-amber",
};

interface BootProgress {
	/** 目前正在打的項目索引；BOOT_LINES 之後的那一項是 NOVA 的台詞。等於總數代表全部跑完。 */
	index: number;
	/** 玩家按過 Enter 跳過動畫。 */
	skipped: boolean;
}

/**
 * 開場 boot log：用終端機外框逐行打字跑喚醒程序，名單查詢卡在「查無此人」，最後接 NOVA 的第一句話。
 *
 * Enter（或點擊畫面）的定義：
 * - 動畫還在跑：直接顯示全部內容（跳過），不呼叫 `onDone`。
 * - 全部顯示完（含 `instant` 速度一開始就是這個狀態）：呼叫 `onDone`，只會呼叫一次。
 * 所以一般速度下是「第一次 Enter 跳過、第二次 Enter 繼續」，`instant` 時第一次 Enter 就繼續。
 */
export function BootLog({
	textSpeed,
	novaFirstLine,
	onDone,
	lineGapMs = DEFAULT_LINE_GAP_MS,
}: BootLogProps) {
	const msPerChar = TEXT_SPEED_MS[textSpeed];
	const totalItems = BOOT_LINES.length + 1;
	const novaIndex = BOOT_LINES.length;

	const [progress, setProgress] = useState<BootProgress>({ index: 0, skipped: false });
	const isInstant = textSpeed === "instant";
	const isFinished = isInstant || progress.skipped || progress.index >= totalItems;

	/** 取第 index 項的原文。 */
	function getItemText(index: number): string {
		if (index === novaIndex) {
			return novaFirstLine;
		}
		return BOOT_LINES[index]?.text ?? "";
	}

	let typingSource = "";
	if (!isFinished) {
		typingSource = getItemText(progress.index);
	}
	const typed = useTypewriter(typingSource, msPerChar);
	const isCurrentLineDone = !isFinished && typed === typingSource;

	// 這行打完後停一下再換下一行
	useEffect(() => {
		if (!isCurrentLineDone) {
			return;
		}
		const timer = setTimeout(() => {
			setProgress((previous) => ({ ...previous, index: previous.index + 1 }));
		}, lineGapMs);
		return () => {
			clearTimeout(timer);
		};
	}, [isCurrentLineDone, progress.index, lineGapMs]);

	// 新的一行出現時捲到最底
	const scrollRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = scrollRef.current;
		if (element !== null) {
			element.scrollTop = element.scrollHeight;
		}
	}, [progress.index, typed, isFinished]);

	// onDone 只呼叫一次，避免連點或 Enter 與點擊同時發生時重複進入地圖
	const hasCalledDoneRef = useRef(false);

	/** Enter 與點擊共用：還在跑就跳過，跑完就繼續。 */
	function handleAdvance() {
		if (!isFinished) {
			setProgress((previous) => ({ ...previous, skipped: true }));
			return;
		}
		if (hasCalledDoneRef.current) {
			return;
		}
		hasCalledDoneRef.current = true;
		onDone();
	}

	// window 的 keydown 只掛一次，透過 ref 永遠呼叫最新的處理函式
	const advanceRef = useRef(handleAdvance);
	useEffect(() => {
		advanceRef.current = handleAdvance;
	});
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Enter") {
				return;
			}
			event.preventDefault();
			// 長按不連續觸發，避免一次跳過又直接繼續
			if (event.repeat) {
				return;
			}
			advanceRef.current();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	/** 第 index 項目前要顯示的文字；還沒輪到回傳 null。 */
	function getDisplayedText(index: number): string | null {
		if (isFinished || index < progress.index) {
			return getItemText(index);
		}
		if (index === progress.index) {
			return typed;
		}
		return null;
	}

	const novaText = getDisplayedText(novaIndex);

	return (
		// 點擊只是 Enter 的滑鼠版本，鍵盤操作已由 window keydown 涵蓋
		<div
			className="fixed inset-0 flex cursor-pointer items-center justify-center bg-black p-4 sm:p-8"
			data-testid="boot-log"
			onClick={handleAdvance}
		>
			<div className="h-[min(80vh,40rem)] w-full max-w-4xl">
				<TerminalFrame title="冷凍艙喚醒程序" learnedCommands={[]} hideFooter>
					<div
						ref={scrollRef}
						className="min-h-0 flex-1 overflow-y-auto bg-black px-4 py-3"
					>
						{BOOT_LINES.map((line, index) => {
							const text = getDisplayedText(index);
							if (text === null) {
								return null;
							}
							const isTyping = !isFinished && index === progress.index;
							return (
								<p
									key={line.text}
									data-testid="boot-line"
									className={cn("break-all whitespace-pre-wrap", TONE_CLASS[line.tone])}
								>
									{text}
									{isTyping && (
										<span aria-hidden="true" className="animate-pulse text-game-holo">
											▌
										</span>
									)}
								</p>
							);
						})}
						{novaText !== null && (
							// 打字進度由這裡控制，DialogueBlock 只負責呈現，所以 msPerChar 傳 0
							<div className="mt-2">
								<DialogueBlock speaker="NOVA" text={novaText} msPerChar={0} />
							</div>
						)}
						{isFinished ? (
							<p className="mt-4 animate-pulse text-game-prompt" data-testid="boot-continue">
								按 Enter 繼續
							</p>
						) : (
							<p className="mt-4 text-game-dim" data-testid="boot-skip">
								Enter 跳過
							</p>
						)}
					</div>
				</TerminalFrame>
			</div>
		</div>
	);
}
