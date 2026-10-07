"use client";

import { useCallback, useRef, useState } from "react";
import type { NovaMessage } from "./NovaDialogue";

export interface UseNovaQueueResult {
	queue: NovaMessage[];
	/** 把一串台詞排進去；id 用 prefix 加序號，同一個 prefix 已在佇列或已顯示過就略過（避免重複觸發） */
	enqueue: (prefix: string, lines: string[]) => void;
	/** onShown 的 handler：移掉 id 對應的那則 */
	dismiss: (id: string) => void;
	/**
	 * 進入新艙區時呼叫：丟掉佇列裡「其他艙區的進房台詞」（id 以 `room-` 開頭且不屬於新艙區），
	 * 正在顯示的第一則讓它播完。台詞停留數秒、玩家走得比佇列快，不丟的話
	 * 走到下一間還在聽上一間的介紹（新手走查在五章都重現）。intro 與過關台詞不受影響。
	 */
	dropStaleRoomMessages: (roomId: string) => void;
	clear: () => void;
}

/**
 * 管理 NOVA 對話佇列。
 *
 * 「已排過」以 `useRef<Set<string>>` 記錄 prefix，只在元件存活期間有效，
 * 重整頁面後會重置；若要跨重整去重，請由父層用 store 旗標處理。
 * `clear()` 只清空佇列，不會清掉去重紀錄。
 */
export function useNovaQueue(): UseNovaQueueResult {
	const [queue, setQueue] = useState<NovaMessage[]>([]);
	const seenPrefixes = useRef<Set<string>>(new Set());

	const enqueue = useCallback((prefix: string, lines: string[]) => {
		if (seenPrefixes.current.has(prefix) || lines.length === 0) {
			return;
		}
		seenPrefixes.current.add(prefix);
		const messages = lines.map((text, index) => ({ id: `${prefix}-${index}`, text }));
		setQueue((previous) => [...previous, ...messages]);
	}, []);

	const dismiss = useCallback((id: string) => {
		setQueue((previous) => previous.filter((message) => message.id !== id));
	}, []);

	const dropStaleRoomMessages = useCallback((roomId: string) => {
		setQueue((previous) =>
			previous.filter((message, index) => {
				// 第一則正在顯示，讓它自然播完，不要突然消失
				if (index === 0) {
					return true;
				}
				return !message.id.startsWith("room-") || message.id.startsWith(`room-${roomId}-`);
			}),
		);
	}, []);

	const clear = useCallback(() => {
		setQueue([]);
	}, []);

	return { queue, enqueue, dismiss, dropStaleRoomMessages, clear };
}
