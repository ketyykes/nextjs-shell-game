"use client";

/**
 * 觸控裝置提示（設計文件 4.6：第一版只支援桌機）。
 *
 * 用「主要指標是粗的、而且不能懸停」判斷手機與平板。接了實體鍵盤但沒有觸控板的 iPad 也會被判成觸控裝置，
 * 所以這只是可以略過的警告，不擋人；略過後記在 sessionStorage，同一個分頁回標題不再出現。
 * 不用 `navigator.maxTouchPoints`：觸控螢幕筆電也大於 0，會誤判。
 */

import { useCallback, useState, useSyncExternalStore } from "react";

/** 主要指標粗、不能懸停：手機與平板。 */
export const TOUCH_PRIMARY_QUERY = "(pointer: coarse) and (hover: none)";

/** 略過紀錄的 sessionStorage key。 */
export const TOUCH_WARNING_DISMISSED_KEY = "kepler9-touch-warning-dismissed";

export interface TouchWarning {
	/** 觸控為主的裝置且這個分頁還沒略過。 */
	visible: boolean;
	/** 「仍要繼續」：隱藏提示並記下來。 */
	dismiss: () => void;
}

/** 取得媒體查詢；SSR 或瀏覽器不支援時回傳 null。 */
function getTouchQuery(): MediaQueryList | null {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return null;
	}
	return window.matchMedia(TOUCH_PRIMARY_QUERY);
}

function subscribeTouchQuery(onChange: () => void): () => void {
	const query = getTouchQuery();
	if (query === null) {
		return () => {};
	}
	query.addEventListener("change", onChange);
	return () => {
		query.removeEventListener("change", onChange);
	};
}

function getTouchSnapshot(): boolean {
	return getTouchQuery()?.matches ?? false;
}

/** 伺服器端一律當桌機，hydrate 後才讀真正的值。 */
function getServerTouchSnapshot(): boolean {
	return false;
}

/** 讀略過紀錄；隱私模式等情況讀不到就當沒略過。 */
function readDismissed(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		return window.sessionStorage.getItem(TOUCH_WARNING_DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

function writeDismissed(): void {
	try {
		window.sessionStorage.setItem(TOUCH_WARNING_DISMISSED_KEY, "1");
	} catch {
		// 寫不進去只代表回標題會再提示一次，不影響遊玩
	}
}

export function useTouchWarning(): TouchWarning {
	const isTouchPrimary = useSyncExternalStore(subscribeTouchQuery, getTouchSnapshot, getServerTouchSnapshot);
	const [dismissed, setDismissed] = useState(readDismissed);

	const dismiss = useCallback(() => {
		writeDismissed();
		setDismissed(true);
	}, []);

	return { visible: isTouchPrimary && !dismissed, dismiss };
}
