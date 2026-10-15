"use client";

/**
 * 阿彬的隱藏留言（設計文件 4.12）在終端機裡的判定：包在 `useSolveFlow` 的 `handleExecuted` 外層，
 * 每道指令執行後先看這次有沒有讀到留言，再交給原本的流程（扣氧、過關）。
 *
 * - 讀到：這次看得到的輸出裡有某則還沒找到的留言的 signature（定義見 `@/game/story/abinNotes`）。
 *   收進存檔、在終端機輸出區插一行系統行「［已收進「阿彬的留言」n/8　Alt+A 打開］」，再通知外面。
 *   用 nano 打開留言也算（4.22）：編輯器裡的內容跟 less 分頁一樣是玩家看得到的，接在輸出行後面一起看。
 * - 回信：只在第四章通訊紀錄終端機（請玩家回信的那則留言所在的那台），每道指令執行後讀 `/home/abin/reply.txt`，
 *   有非空白內容就把第一個非空行（整理過）存進存檔；之後再改就用最新的，刪掉或改成空白保留上一次的。
 *   不插系統行：回信的回應是第五、六章才出現的證據（`abinEvidenceFiles`）。
 * - 只在主線生效：沙盒不經過 PlayScreen，不會呼叫這裡。
 *
 * 給第二波（NOVA 對這些事的反應）的介面：`onAbinEvent` callback 與 `handleExecuted` 的回傳值是同一個 `AbinNotesEvent`，
 * 只有這次真的有事（新找到留言、回信被寫入或改寫）才不是 null。
 */

import { useCallback, useMemo } from "react";
import { editorVisibleLines } from "@/game/shell/editor";
import type { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import type { TerminalDefinition } from "@/game/story";
import {
	ABIN_NOTE_TOTAL,
	ABIN_REPLY_TERMINAL_ID,
	countFoundAbinNotes,
	readAbinReply,
	revealedAbinNotes,
	type AbinNote,
} from "@/game/story/abinNotes";
import { useGameStore } from "@/game/store";
import type { OutputEntry } from "@/game/store/types";

/** 跟 `TerminalModal.onExecuted` 同一個簽名。 */
export type ExecutedHandler = (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => void;

/** 一道指令執行後跟阿彬的留言有關的事。 */
export interface AbinNotesEvent {
	/** 在哪一台終端機。 */
	terminalId: string;
	/** 這次新找到的留言，依 `ABIN_NOTES` 的順序；沒有是空陣列。 */
	found: AbinNote[];
	/** 這次之後一共找到幾則（只算認得的 id）。 */
	foundCount: number;
	/** 這次回信被寫入或改寫成的文字（已清理過）；沒有變動是 null。 */
	reply: string | null;
}

export interface UseAbinNotesOptions {
	/** 原本的 `onExecuted`（`useSolveFlow` 的 `handleExecuted`），判定完之後一定會呼叫。 */
	onExecuted: ExecutedHandler;
	/** 系統行裡的快捷鍵文字，例如 `Alt+A`，Apple 鍵盤是 `⌥A`。 */
	shortcutLabel: string;
	/** 這次有新找到的留言、或回信被寫入／改寫時呼叫，在原本的 `onExecuted` 之前。 */
	onAbinEvent?: (event: AbinNotesEvent) => void;
}

export interface UseAbinNotesResult {
	/** 給 `TerminalModal.onExecuted`；回傳這次的事件，沒有事是 null。 */
	handleExecuted: (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => AbinNotesEvent | null;
}

/** 收進留言時插在終端機輸出區的系統行。 */
export function createAbinFoundEntry(notes: AbinNote[], foundCount: number, shortcutLabel: string): OutputEntry {
	let progress = `${foundCount}/${ABIN_NOTE_TOTAL}`;
	if (foundCount >= ABIN_NOTE_TOTAL) {
		progress = `${progress}，全部找齊了`;
	}
	return {
		kind: "system",
		id: `abin-note-${notes.map((note) => note.id).join("-")}`,
		lines: [`［已收進「阿彬的留言」${progress}　${shortcutLabel} 打開］`],
	};
}

export function useAbinNotes({ onExecuted, shortcutLabel, onAbinEvent }: UseAbinNotesOptions): UseAbinNotesResult {
	const handleExecuted = useCallback(
		(definition: TerminalDefinition, shell: Shell, execution: ShellExecution): AbinNotesEvent | null => {
			const store = useGameStore.getState();
			// nano 打開的內容不在 lines 裡（不進輸出區），判定時接在後面
			const visible = { ...execution, lines: [...execution.lines, ...editorVisibleLines(execution)] };
			const revealed = revealedAbinNotes(definition.id, visible, store.abinNotes.found);
			if (revealed.length > 0) {
				store.markAbinNotesFound(revealed.map((note) => note.id));
			}

			let reply: string | null = null;
			if (definition.id === ABIN_REPLY_TERMINAL_ID) {
				const written = readAbinReply(shell.fs);
				if (written !== null && written !== store.abinNotes.reply) {
					store.setAbinReply(written);
					reply = written;
				}
			}

			let event: AbinNotesEvent | null = null;
			if (revealed.length > 0 || reply !== null) {
				const foundCount = countFoundAbinNotes(useGameStore.getState().abinNotes.found);
				if (revealed.length > 0) {
					store.appendTranscript(definition.id, [createAbinFoundEntry(revealed, foundCount, shortcutLabel)]);
				}
				event = { terminalId: definition.id, found: revealed, foundCount, reply };
				onAbinEvent?.(event);
			}

			onExecuted(definition, shell, execution);
			return event;
		},
		[onAbinEvent, onExecuted, shortcutLabel],
	);

	return useMemo(() => ({ handleExecuted }), [handleExecuted]);
}
