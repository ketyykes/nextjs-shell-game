"use client";

/**
 * 系統的「減少動態效果」設定（`prefers-reduced-motion: reduce`），光敏確認面板用它多說一句（設計文件 4.20）。
 *
 * 寫法跟 `useTouchWarning` 的媒體查詢一樣：伺服器端一律當沒設定，hydrate 後才讀真正的值；
 * 不用 motion 的 `useReducedMotion`：它在模組層只初始化一次、元件用 useState 留住第一次讀到的值，
 * 系統設定改了畫面不會跟著變，測試也換不掉。
 */

import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 取得媒體查詢；SSR 或瀏覽器不支援時回傳 null。 */
function getReducedMotionQuery(): MediaQueryList | null {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return null;
	}
	return window.matchMedia(REDUCED_MOTION_QUERY);
}

function subscribeReducedMotion(onChange: () => void): () => void {
	const query = getReducedMotionQuery();
	if (query === null) {
		return () => {};
	}
	query.addEventListener("change", onChange);
	return () => {
		query.removeEventListener("change", onChange);
	};
}

function getReducedMotionSnapshot(): boolean {
	return getReducedMotionQuery()?.matches ?? false;
}

function getServerReducedMotionSnapshot(): boolean {
	return false;
}

export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getServerReducedMotionSnapshot);
}
