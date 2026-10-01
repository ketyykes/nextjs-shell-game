"use client";

import { useEffect, useRef, useState } from "react";

/** 選單的移動軸：vertical 用 ↑↓、horizontal 用 ←→、both 兩組都可以。 */
export type MenuOrientation = "vertical" | "horizontal" | "both";

export interface UseMenuNavigationOptions {
	/** 選項數量。 */
	itemCount: number;
	/** 按 Enter 時呼叫，參數是目前選取的索引。 */
	onConfirm: (index: number) => void;
	/** 按 Esc 時呼叫；沒給就不處理 Esc。 */
	onCancel?: () => void;
	/**
	 * 垂直選單按 ←→ 時呼叫（水平選單則是 ↑↓），設定選單用它改值。
	 * `delta` 為 -1（← 或 ↑）或 1（→ 或 ↓）。
	 */
	onAdjust?: (index: number, delta: -1 | 1) => void;
	/** 移動軸，預設 vertical。 */
	orientation?: MenuOrientation;
	/** 初始選取的索引，預設 0。 */
	initialIndex?: number;
	/** 走到頭是否繞回另一端，預設 true。 */
	loop?: boolean;
	/** false 時不監聽鍵盤，例如內嵌確認面板開啟時停用外層選單。預設 true。 */
	enabled?: boolean;
}

export interface MenuNavigation {
	/** 目前選取的索引，已夾在 0 到 itemCount - 1 之間。 */
	selectedIndex: number;
	setSelectedIndex: (index: number) => void;
}

/** 把索引夾在合法範圍內；沒有選項時回傳 0。 */
function clampIndex(index: number, itemCount: number): number {
	if (itemCount <= 0) {
		return 0;
	}
	return Math.min(Math.max(index, 0), itemCount - 1);
}

/** 依目前索引、位移與是否繞回，算出下一個索引。 */
export function stepIndex(current: number, delta: number, itemCount: number, loop: boolean): number {
	if (itemCount <= 0) {
		return 0;
	}
	const next = current + delta;
	if (loop) {
		return ((next % itemCount) + itemCount) % itemCount;
	}
	return clampIndex(next, itemCount);
}

/** 把按鍵對應成主軸位移（移動選取）；不是主軸的鍵回傳 0。 */
function getMoveDelta(key: string, orientation: MenuOrientation): number {
	const useVertical = orientation === "vertical" || orientation === "both";
	const useHorizontal = orientation === "horizontal" || orientation === "both";
	if (useVertical && key === "ArrowUp") {
		return -1;
	}
	if (useVertical && key === "ArrowDown") {
		return 1;
	}
	if (useHorizontal && key === "ArrowLeft") {
		return -1;
	}
	if (useHorizontal && key === "ArrowRight") {
		return 1;
	}
	return 0;
}

/** 把按鍵對應成副軸位移（調整值）；both 沒有副軸。 */
function getAdjustDelta(key: string, orientation: MenuOrientation): -1 | 1 | 0 {
	if (orientation === "vertical") {
		if (key === "ArrowLeft") {
			return -1;
		}
		if (key === "ArrowRight") {
			return 1;
		}
	}
	if (orientation === "horizontal") {
		if (key === "ArrowUp") {
			return -1;
		}
		if (key === "ArrowDown") {
			return 1;
		}
	}
	return 0;
}

/**
 * 鍵盤選單共用邏輯：方向鍵移動選取、Enter 確認、Esc 取消。
 *
 * - 監聽 `window` 的 keydown，所以不需要焦點在元件上。
 * - Enter 會 `preventDefault`，避免焦點剛好在按鈕上時又觸發一次 click；長按 Enter 不連發。
 * - 回呼一律透過 ref 呼叫最新版本，父層每次 render 傳新函式也不會重掛監聽器。
 * - 同一畫面有兩個選單（例如外層選單與內嵌確認面板）時，用 `enabled` 讓只有一個在收鍵盤。
 */
export function useMenuNavigation({
	itemCount,
	onConfirm,
	onCancel,
	onAdjust,
	orientation = "vertical",
	initialIndex = 0,
	loop = true,
	enabled = true,
}: UseMenuNavigationOptions): MenuNavigation {
	const [rawIndex, setRawIndex] = useState(initialIndex);
	// 選項數量變少時（例如「繼續」消失）在讀取時夾回範圍內，不另外寫 effect
	const selectedIndex = clampIndex(rawIndex, itemCount);

	const latestRef = useRef({ itemCount, onConfirm, onCancel, onAdjust, orientation, loop, selectedIndex });
	useEffect(() => {
		latestRef.current = { itemCount, onConfirm, onCancel, onAdjust, orientation, loop, selectedIndex };
	});

	useEffect(() => {
		if (!enabled) {
			return;
		}
		function handleKeyDown(event: KeyboardEvent) {
			const latest = latestRef.current;

			if (event.key === "Enter") {
				event.preventDefault();
				if (event.repeat || latest.itemCount <= 0) {
					return;
				}
				latest.onConfirm(latest.selectedIndex);
				return;
			}

			if (event.key === "Escape") {
				if (latest.onCancel === undefined || event.repeat) {
					return;
				}
				event.preventDefault();
				latest.onCancel();
				return;
			}

			const moveDelta = getMoveDelta(event.key, latest.orientation);
			if (moveDelta !== 0) {
				event.preventDefault();
				setRawIndex((previous) => {
					const current = clampIndex(previous, latest.itemCount);
					return stepIndex(current, moveDelta, latest.itemCount, latest.loop);
				});
				return;
			}

			const adjustDelta = getAdjustDelta(event.key, latest.orientation);
			if (adjustDelta !== 0 && latest.onAdjust !== undefined) {
				event.preventDefault();
				latest.onAdjust(latest.selectedIndex, adjustDelta);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [enabled]);

	return { selectedIndex, setSelectedIndex: setRawIndex };
}
