/**
 * 存檔狀態（M12-5）：localStorage 寫不進去、或讀到比程式新的存檔時，讓畫面能提示玩家。
 *
 * 刻意不放進 zustand store：persist 每次 `set` 都會寫檔，寫入失敗時再 `set` 一個旗標會再觸發一次寫入，
 * 繞成遞迴；這裡用模組層的小型 external store，`gameStore` 的 storage 回報、元件用 `useSaveIssue` 讀。
 * 規則（什麼時候設、什麼時候清）在 `gameStore.ts` 的 `safeLocalStorage`，這裡只負責存與通知。
 */

import { useSyncExternalStore } from "react";

/**
 * - `write-failed`：最近一次寫入 localStorage 失敗（配額滿、瀏覽器封鎖儲存），之後寫入成功就清掉。
 * - `newer-version`：存檔版本比程式新，這次不讀也不寫，保住原始存檔；整個分頁期間都維持。
 */
export type SaveIssue = "write-failed" | "newer-version";

let currentIssue: SaveIssue | null = null;
const listeners = new Set<() => void>();

export function getSaveIssue(): SaveIssue | null {
	return currentIssue;
}

/** 設定目前的問題，跟原本一樣就不通知（每次寫入失敗都會呼叫，不能每次都觸發 render）。 */
export function setSaveIssue(issue: SaveIssue | null): void {
	if (currentIssue === issue) {
		return;
	}
	currentIssue = issue;
	for (const listener of [...listeners]) {
		listener();
	}
}

export function subscribeSaveIssue(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** 伺服器沒有 localStorage，一律當成沒有問題。 */
function getServerSaveIssue(): SaveIssue | null {
	return null;
}

/** 元件訂閱目前的存檔問題。 */
export function useSaveIssue(): SaveIssue | null {
	return useSyncExternalStore(subscribeSaveIssue, getSaveIssue, getServerSaveIssue);
}
