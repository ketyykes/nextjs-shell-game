"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { emitGameEvent } from "@/game/phaser/EventBus";

export interface UsePauseMenuOptions {
	/** 終端機開著時 true：Esc 是終端機自己的（關閉終端機），暫停選單不接。 */
	terminalOpen: boolean;
	/**
	 * 章節結束畫面開著時 true：結束畫面蓋住整個地圖，Esc 不開暫停選單。
	 * 否則兩個 dialog 疊在一起，兩邊的 Enter 都掛在 window，一下 Enter 會同時觸發。
	 */
	chapterEndOpen: boolean;
}

export interface UsePauseMenuResult {
	/** 暫停選單開著（設定選單疊在上面時仍是 true，關掉設定回到暫停選單）。 */
	paused: boolean;
	settingsOpen: boolean;
	/** 暫停或設定選單任一個開著；開著時 Phaser 停住角色輸入。 */
	menuOpen: boolean;
	resume: () => void;
	openSettings: () => void;
	closeSettings: () => void;
}

/**
 * 暫停選單（設計文件 4.7）的開關：地圖上按 Esc 開啟，選單開著時發 `game:pause`、關掉時發 `game:resume`。
 *
 * - 終端機、設定選單或章節結束畫面開著時不掛 Esc 監聽（前兩者各自處理 Esc，結束畫面不給暫停）；終端機的 Esc 另外有 `stopPropagation`，
 *   因為這個監聽會在終端機關閉的同一個 keydown 裡重新掛回 window（progress.md 第 5 節）。
 * - 按住 Esc 的重複事件不算。
 * - Phaser 場景本身不暫停，只停角色輸入（#22）。
 */
export function usePauseMenu({ terminalOpen, chapterEndOpen }: UsePauseMenuOptions): UsePauseMenuResult {
	const [paused, setPaused] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const pauseBlocked = terminalOpen || settingsOpen || chapterEndOpen;
	useEffect(() => {
		if (paused || pauseBlocked) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.repeat) {
				return;
			}
			event.preventDefault();
			setPaused(true);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [pauseBlocked, paused]);

	const menuOpen = paused || settingsOpen;
	useEffect(() => {
		if (!menuOpen) {
			return;
		}
		emitGameEvent("game:pause", { reason: "menu" });
		return () => {
			emitGameEvent("game:resume", { reason: "menu" });
		};
	}, [menuOpen]);

	const resume = useCallback(() => setPaused(false), []);
	const openSettings = useCallback(() => setSettingsOpen(true), []);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);

	return useMemo(
		() => ({ paused, settingsOpen, menuOpen, resume, openSettings, closeSettings }),
		[paused, settingsOpen, menuOpen, resume, openSettings, closeSettings],
	);
}
