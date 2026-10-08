"use client";

/**
 * 右側面板組的鍵盤快捷鍵：Alt（Mac 是 Option）加一個字母，在 window 上聽。
 *
 * 選 Alt＋字母的原因（設計文件 4.6）：
 * - 地圖的鍵是方向鍵、WASD、E、Esc、Enter；終端機吃一般字元、Tab、↑↓、Enter、Esc，Alt 組合兩邊都沒用到，
 *   所以終端機開著時也能直接按，輸入框焦點不動、打到一半的字也不會被吃掉。
 * - Ctrl＋字母大多是瀏覽器保留鍵或真 shell 的編輯鍵（Ctrl+C、Ctrl+L、Ctrl+R），F 鍵在 Mac 筆電要多按 fn。
 * - 字母避開 Firefox 選單列的 Alt 加速鍵（F、E、V、S、B、T、H）與 Mac Option 的組字死鍵（E、I、N、U）。
 *
 * 比對用 `event.code`（實體鍵位）：Mac 按 Option+L 的 `event.key` 是「¬」，比 key 會認不得。
 */

import { useEffect, useRef } from "react";

export type SidePanelId = "commands" | "log";

/** 每個面板的快捷鍵字母，搭配 Alt。還沒有快捷鍵的面板不列。 */
const SHORTCUT_LETTERS: Partial<Record<SidePanelId, string>> = {
	log: "L",
};

/** 依 keydown 事件找出要切換的面板；不是面板快捷鍵回 null。 */
function matchSidePanelShortcut(event: KeyboardEvent): SidePanelId | null {
	// 只認單純的 Alt：Ctrl+Alt 在 Windows 是 AltGr（歐系鍵盤用來打 ł 之類的字）
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
		return null;
	}
	if (event.isComposing) {
		return null;
	}
	for (const [id, letter] of Object.entries(SHORTCUT_LETTERS)) {
		if (event.code === `Key${letter}`) {
			return id as SidePanelId;
		}
	}
	return null;
}

/** 面板快捷鍵的顯示文字：一般鍵盤「Alt+L」，Apple 鍵盤「⌥L」。沒有快捷鍵的面板回 null。 */
export function formatShortcut(id: SidePanelId, apple: boolean): string | null {
	const letter = SHORTCUT_LETTERS[id];
	if (letter === undefined) {
		return null;
	}
	if (apple) {
		return `⌥${letter}`;
	}
	return `Alt+${letter}`;
}

/** 給 `aria-keyshortcuts` 用的標準寫法，跟平台無關。 */
export function ariaShortcut(id: SidePanelId): string | undefined {
	const letter = SHORTCUT_LETTERS[id];
	if (letter === undefined) {
		return undefined;
	}
	return `Alt+${letter}`;
}

/** Mac、iPad 的鍵盤把 Alt 標成 Option（⌥）。iPadOS 的 Safari 也自稱 Macintosh。 */
export function isAppleUserAgent(userAgent: string): boolean {
	return /Mac|iPhone|iPad|iPod/.test(userAgent);
}

export interface UseSidePanelShortcutsOptions {
	/** 暫停選單、設定選單、章節結束畫面這類全畫面介面開著時傳 false */
	enabled: boolean;
	/** 按下某個面板的快捷鍵 */
	onToggle: (id: SidePanelId) => void;
}

/**
 * 在 window 上聽面板快捷鍵。輸入框（終端機）裡按下的也會冒泡上來，
 * 終端機的 keydown handler 不處理 Alt 組合，所以兩邊不會打架。
 */
export function useSidePanelShortcuts({ enabled, onToggle }: UseSidePanelShortcutsOptions): void {
	// 用 ref 保存最新的 onToggle，父層每次 render 傳新函式時不用重掛監聽
	const onToggleRef = useRef(onToggle);
	useEffect(() => {
		onToggleRef.current = onToggle;
	}, [onToggle]);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			const id = matchSidePanelShortcut(event);
			if (id === null) {
				return;
			}
			// 不擋的話 Mac 的 Option+字母會在終端機輸入框打出特殊符號
			event.preventDefault();
			if (event.repeat) {
				return;
			}
			onToggleRef.current(id);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [enabled]);
}
