"use client";

import { useCallback } from "react";
import { emitGameEvent } from "@/game/phaser/EventBus";
import type { ChapterDefinition, TerminalDefinition } from "@/game/story";
import {
	FLICKER_DURATION_MS,
	novaErrorLine,
	STUCK_REMINDER_LINES,
	stuckLines,
	type PressureReaction,
} from "@/game/story/pressure";
import { useGameStore } from "@/game/store";
import { createDialogueEntries } from "./terminalSession";
import { useTerminalPressure, type UseTerminalPressureResult } from "./useTerminalPressure";

export interface UsePressureReactionsOptions {
	chapter: ChapterDefinition;
	/** 目前開著的終端機，關著是 null。已過關的終端機不計數。 */
	openTerminal: TerminalDefinition | null;
	solvedTerminals: readonly string[];
}

/**
 * 卡關偵測與環境反應階梯（設計文件 4.8）接到遊戲上：只對開著且未過關的終端機計數，
 * 累積錯誤次數存進 store，反應依種類送到 Phaser 或終端機輸出區。
 *
 * - 燈閃：發 `ambient:flicker`，設定關閉閃爍時不發（光敏安全）。
 * - 門聲：發 `sfx:play door`。
 * - 第 9 次錯誤的 NOVA 台詞、卡關台詞：只內嵌在終端機（#21），地圖對話框被彈窗蓋住看不到。
 *   重複的卡關提醒用系統行提示輸入 hint（M10-5），第一次才是 NOVA 的劇本台詞。
 *
 * 回傳 `useTerminalPressure` 的 `recordExecution` 與 `reset`，給過關流程呼叫。
 */
export function usePressureReactions({
	chapter,
	openTerminal,
	solvedTerminals,
}: UsePressureReactionsOptions): UseTerminalPressureResult {
	let pressureTerminalId: string | null = null;
	if (openTerminal !== null && !solvedTerminals.includes(openTerminal.id)) {
		pressureTerminalId = openTerminal.id;
	}

	const handleReaction = useCallback(
		(reaction: PressureReaction) => {
			if (openTerminal === null) {
				return;
			}
			const { appendTranscript, settings } = useGameStore.getState();
			switch (reaction.type) {
				case "flicker":
					if (settings.flickerEnabled) {
						emitGameEvent("ambient:flicker", { durationMs: FLICKER_DURATION_MS });
					}
					return;
				case "door":
					emitGameEvent("sfx:play", { sound: "door" });
					return;
				case "nova": {
					const text = novaErrorLine(chapter.novaErrorLines, reaction.lineIndex);
					appendTranscript(
						openTerminal.id,
						createDialogueEntries(`nova-error-${openTerminal.id}-${reaction.lineIndex}-${Date.now()}`, [text]),
					);
					return;
				}
				case "stuck":
					if (reaction.repeat) {
						appendTranscript(openTerminal.id, [
							{ kind: "system", id: `stuck-reminder-${openTerminal.id}-${Date.now()}`, lines: [...STUCK_REMINDER_LINES] },
						]);
						return;
					}
					appendTranscript(
						openTerminal.id,
						createDialogueEntries(`nova-stuck-${openTerminal.id}-${Date.now()}`, stuckLines(openTerminal)),
					);
					return;
			}
		},
		[chapter.novaErrorLines, openTerminal],
	);

	const handleErrorCountChange = useCallback(
		(count: number) => {
			if (pressureTerminalId !== null) {
				useGameStore.getState().setTerminalErrorCount(pressureTerminalId, count);
			}
		},
		[pressureTerminalId],
	);

	return useTerminalPressure({
		terminalId: pressureTerminalId,
		initialErrorCount:
			pressureTerminalId !== null ? (useGameStore.getState().terminals[pressureTerminalId]?.errorCount ?? 0) : 0,
		onReaction: handleReaction,
		onErrorCountChange: handleErrorCountChange,
	});
}
