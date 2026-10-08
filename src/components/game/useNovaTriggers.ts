"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { emitGameEvent } from "@/game/phaser/EventBus";
import type { RoomId } from "@/game/phaser/events";
import { introShownFlag, roomEnteredFlag, type ChapterDefinition, type TerminalDefinition } from "@/game/story";
import { useGameStore } from "@/game/store";
import type { NovaMessage } from "./NovaDialogue";
import { useNovaQueue, type NovaLogEntry } from "./useNovaQueue";

export interface UseNovaTriggersResult {
	/** 地圖對話框的佇列，交給 `NovaDialogue`。 */
	queue: NovaMessage[];
	/** 對話紀錄面板用，見 `useNovaQueue().history`。 */
	history: NovaLogEntry[];
	/** `NovaDialogue.onShown`。 */
	dismiss: (id: string) => void;
	/**
	 * `room:enter` 時呼叫：先丟掉佇列裡其他艙區還沒播的進房台詞（#61）；
	 * 第一次進這間（劇情旗標跨重整去重，#6）就立旗標、排進房台詞並播 nova-blip。
	 * 回傳是不是第一次進來，呼叫端用它決定要不要秀插圖卡。
	 */
	enterRoom: (roomId: RoomId) => boolean;
	/** 過關時呼叫：記下這台過關台詞的最後一句，等終端機關掉再在地圖上說（#5）。沒有過關台詞就不記。 */
	deferSolvedLine: (definition: TerminalDefinition) => void;
	/** 關閉終端機時呼叫：把記下的那句排進地圖佇列，然後清掉。 */
	flushSolvedLine: () => void;
}

/**
 * NOVA 在地圖對話框說話的三個時機（設計文件 4.6、決策 #5、#6、#61）：
 *
 * - 開場：第一次進這一章時說 `intro`。第一章的第一句已在標題流程的 boot log 說過，從第二句開始。
 * - 進艙區：每間只說一次，換艙區時丟掉舊房還沒播的台詞。
 * - 過關：台詞全部內嵌在終端機輸出區（由過關流程寫入），關閉終端機後地圖只重說最後一句。
 *
 * 開終端機的 `onOpen` 與卡關台詞只在終端機內嵌（#21），不經過這裡。
 */
export function useNovaTriggers(chapter: ChapterDefinition): UseNovaTriggersResult {
	const { queue, history, enqueue, dismiss, dropStaleRoomMessages } = useNovaQueue();
	// 這次開啟期間過關的 NOVA 最後一句，關閉後在地圖上再說一次
	const pendingSolvedLineRef = useRef<{ prefix: string; text: string } | null>(null);

	// 開場台詞：只在第一次進該章時說，用劇情旗標跨重整去重
	useEffect(() => {
		const flag = introShownFlag(chapter.chapter);
		const store = useGameStore.getState();
		if (store.storyFlags[flag] === true) {
			return;
		}
		store.setFlag(flag);
		let lines = chapter.intro ?? [];
		if (chapter.chapter === 1) {
			lines = lines.slice(1);
		}
		enqueue(`intro-${chapter.chapter}`, lines);
	}, [chapter, enqueue]);

	const enterRoom = useCallback(
		(roomId: RoomId) => {
			// 玩家走得比台詞佇列快：換房時丟掉還沒播的舊房介紹，才不會在新房聽上一間的台詞
			dropStaleRoomMessages(roomId);
			// 進房台詞每間只說一次，用劇情旗標跨重整去重
			const store = useGameStore.getState();
			const flag = roomEnteredFlag(chapter.chapter, roomId);
			if (store.storyFlags[flag] === true) {
				return false;
			}
			store.setFlag(flag);
			const terminal = chapter.terminals.find((item) => item.roomId === roomId);
			const lines = terminal?.nova?.onEnterRoom ?? [];
			if (lines.length > 0) {
				enqueue(`room-${roomId}`, lines);
				emitGameEvent("sfx:play", { sound: "nova-blip" });
			}
			return true;
		},
		[chapter, dropStaleRoomMessages, enqueue],
	);

	const deferSolvedLine = useCallback((definition: TerminalDefinition) => {
		const solvedLines = definition.nova?.onSolved ?? [];
		if (solvedLines.length === 0) {
			return;
		}
		pendingSolvedLineRef.current = {
			prefix: `solved-${definition.id}`,
			text: solvedLines[solvedLines.length - 1],
		};
	}, []);

	const flushSolvedLine = useCallback(() => {
		const pending = pendingSolvedLineRef.current;
		if (pending === null) {
			return;
		}
		pendingSolvedLineRef.current = null;
		enqueue(pending.prefix, [pending.text]);
	}, [enqueue]);

	return useMemo(
		() => ({ queue, history, dismiss, enterRoom, deferSolvedLine, flushSolvedLine }),
		[queue, history, dismiss, enterRoom, deferSolvedLine, flushSolvedLine],
	);
}
