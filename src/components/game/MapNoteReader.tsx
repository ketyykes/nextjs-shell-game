"use client";

import { motion } from "motion/react";
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import frameStyles from "@/components/terminal/TerminalFrame.module.css";
import type { MapNote } from "@/game/story/mapNotes";
import { cn } from "@/lib/utils";

export interface MapNoteReaderProps {
	note: MapNote;
	/** Esc、E 或點「[Esc] 關閉」時呼叫；由 PlayScreen 收起視窗並發 `note:close` 讓場景恢復。 */
	onClose: () => void;
}

/**
 * 關閉便條的按鍵：Esc 或 E。按住不放的重複事件不算（剛用 E 打開時手還按著），
 * 帶 Alt、Ctrl、Cmd 的組合鍵也不算（Alt+C／L／A 是右側面板的快捷鍵，要照常往下傳）。
 */
function isCloseKey(event: KeyboardEvent): boolean {
	if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
		return false;
	}
	if (event.key === "Escape") {
		return true;
	}
	return event.code === "KeyE" || event.key === "e" || event.key === "E";
}

/**
 * 地圖便條的閱讀視窗（設計文件 4.19）：像素邊框沿用終端機彈窗的 9-slice，標題是物件名、內容逐行、底部「[Esc] 關閉」。
 *
 * 鍵盤掛在 window 的 capture 階段：Esc 與 E 在這裡就 `preventDefault` 加 `stopPropagation`，
 * - 暫停選單（usePauseMenu）的 Esc 監聽在 window 的 bubble 階段，而且會在便條關閉的同一個 keydown 裡重新掛回去
 *   （docs/notes/pitfalls.md），不擋下來這一下 Esc 會關了便條又打開暫停選單；
 * - Phaser 的鍵盤也在 window 的 bubble 階段、只收沒被 preventDefault 的事件，關閉用的 E 不會被當成「再打開一次」。
 * 監聽用 `useLayoutEffect` 跟畫面同一次 commit 掛上：視窗一出現就接得到 Esc 與 E，
 * 不會有「看得到視窗、但 E 還是交給 Phaser 再開一次」的空窗。
 * 不存檔、不記對話紀錄、不算進任何統計。
 */
export function MapNoteReader({ note, onClose }: MapNoteReaderProps) {
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const handleClose = useEffectEvent(onClose);

	useLayoutEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!isCloseKey(event)) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			handleClose();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
		};
	}, []);

	// 焦點移到關閉鈕：螢幕閱讀器會念出這個對話框，Enter 與空白鍵也能關
	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	return (
		<div
			className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-6"
			data-testid="map-note-reader"
		>
			<motion.div
				role="dialog"
				aria-modal="true"
				aria-label={note.objectName}
				initial={{ scaleY: 0.6, opacity: 0 }}
				animate={{ scaleY: 1, opacity: 1 }}
				transition={{ duration: 0.12, ease: "easeOut" }}
				className={cn(
					frameStyles.frame,
					"flex w-full max-w-xl flex-col bg-game-bg font-terminal text-xl text-game-text",
				)}
			>
				<div className="border-b-2 border-game-holo/40 px-4 py-1">
					<h2 className="text-game-holo">{note.objectName}</h2>
				</div>
				<div className="flex flex-col gap-1 px-4 py-3">
					{note.lines.map((line, index) => (
						<p key={index} data-testid="map-note-line" className="whitespace-pre-wrap">
							{line === "" ? " " : line}
						</p>
					))}
				</div>
				<div className="flex justify-end border-t-2 border-game-holo/40 px-4 py-1">
					<button
						ref={closeButtonRef}
						type="button"
						aria-label="關閉便條"
						onClick={onClose}
						className="cursor-pointer text-game-dim transition-colors hover:text-game-amber focus-visible:text-game-amber focus-visible:outline-none"
					>
						[Esc] 關閉
					</button>
				</div>
			</motion.div>
		</div>
	);
}
