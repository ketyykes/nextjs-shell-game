"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { NovaMessage } from "./NovaDialogue";

/** 對話紀錄裡的一則台詞。 */
export interface NovaLogEntry {
	id: string;
	text: string;
	/** `shown`：在地圖對話框播完；`missed`：換艙區時被 `dropStaleRoomMessages` 丟掉，沒有播出 */
	status: "shown" | "missed";
}

/** 內部紀錄：排進佇列當下就記一筆 `pending`，離開佇列時才改成播完或被丟掉，順序因此永遠是排入順序。 */
interface TrackedMessage {
	id: string;
	text: string;
	status: "pending" | NovaLogEntry["status"];
}

interface NovaQueueState {
	queue: NovaMessage[];
	tracked: TrackedMessage[];
}

const INITIAL_STATE: NovaQueueState = { queue: [], tracked: [] };

/** 把指定 id 的紀錄改成離開佇列時的狀態。 */
function settleTracked(
	tracked: TrackedMessage[],
	ids: Set<string>,
	status: NovaLogEntry["status"],
): TrackedMessage[] {
	return tracked.map((message) => {
		if (!ids.has(message.id)) {
			return message;
		}
		return { ...message, status };
	});
}

function isSettled(message: TrackedMessage): message is NovaLogEntry {
	return message.status !== "pending";
}

export interface UseNovaQueueResult {
	queue: NovaMessage[];
	/**
	 * 本次遊玩離開佇列的台詞（對話紀錄面板用），照排進佇列的順序：
	 * 播完的標 `shown`，換艙區被丟掉的標 `missed`；還在佇列裡的不列。
	 */
	history: NovaLogEntry[];
	/** 把一串台詞排進去；id 用 prefix 加序號，同一個 prefix 已在佇列或已顯示過就略過（避免重複觸發） */
	enqueue: (prefix: string, lines: string[]) => void;
	/** onShown 的 handler：移掉 id 對應的那則，記進紀錄 */
	dismiss: (id: string) => void;
	/**
	 * 進入新艙區時呼叫：丟掉佇列裡「其他艙區的進房台詞」（id 以 `room-` 開頭且不屬於新艙區），
	 * 正在顯示的第一則讓它播完。台詞停留數秒、玩家走得比佇列快，不丟的話
	 * 走到下一間還在聽上一間的介紹（新手走查在五章都重現）。intro 與過關台詞不受影響。
	 * 被丟掉的台詞記進紀錄、標成未播出，玩家還能在對話紀錄面板讀到。
	 */
	dropStaleRoomMessages: (roomId: string) => void;
	clear: () => void;
}

/**
 * 管理 NOVA 對話佇列與本次遊玩的對話紀錄。
 *
 * 「已排過」以 `useRef<Set<string>>` 記錄 prefix，只在元件存活期間有效，
 * 重整頁面後會重置；若要跨重整去重，請由父層用 store 旗標處理。對話紀錄同樣只在記憶體裡。
 * `clear()` 只清空佇列，不會清掉去重紀錄。
 */
export function useNovaQueue(): UseNovaQueueResult {
	const [state, setState] = useState<NovaQueueState>(INITIAL_STATE);
	const seenPrefixes = useRef<Set<string>>(new Set());

	const enqueue = useCallback((prefix: string, lines: string[]) => {
		if (seenPrefixes.current.has(prefix) || lines.length === 0) {
			return;
		}
		seenPrefixes.current.add(prefix);
		const messages = lines.map((text, index) => ({ id: `${prefix}-${index}`, text }));
		setState((previous) => ({
			queue: [...previous.queue, ...messages],
			tracked: [...previous.tracked, ...messages.map((message) => ({ ...message, status: "pending" as const }))],
		}));
	}, []);

	const dismiss = useCallback((id: string) => {
		setState((previous) => {
			if (!previous.queue.some((message) => message.id === id)) {
				return previous;
			}
			return {
				queue: previous.queue.filter((message) => message.id !== id),
				tracked: settleTracked(previous.tracked, new Set([id]), "shown"),
			};
		});
	}, []);

	const dropStaleRoomMessages = useCallback((roomId: string) => {
		setState((previous) => {
			const kept: NovaMessage[] = [];
			const droppedIds = new Set<string>();
			previous.queue.forEach((message, index) => {
				// 第一則正在顯示，讓它自然播完，不要突然消失
				const isShowing = index === 0;
				const isStaleRoomMessage = message.id.startsWith("room-") && !message.id.startsWith(`room-${roomId}-`);
				if (isShowing || !isStaleRoomMessage) {
					kept.push(message);
					return;
				}
				droppedIds.add(message.id);
			});
			if (droppedIds.size === 0) {
				return previous;
			}
			return { queue: kept, tracked: settleTracked(previous.tracked, droppedIds, "missed") };
		});
	}, []);

	const clear = useCallback(() => {
		setState((previous) => ({ ...previous, queue: [] }));
	}, []);

	const history = useMemo(() => state.tracked.filter(isSettled), [state.tracked]);

	return { queue: state.queue, history, enqueue, dismiss, dropStaleRoomMessages, clear };
}
