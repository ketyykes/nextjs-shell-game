"use client";

/**
 * NOVA 看狀態（設計文件 4.14）接到遊戲上：包在最外層，每道指令先跑完原本的流程
 * （阿彬的留言 → 扣氧、卡關、過關），再看這道指令要不要讓 NOVA 插一句。判定是 `@/game/story/novaReactions` 的純函式。
 *
 * - 阿彬的留言與回信：用內層 `handleExecuted` 的回傳值（就是 `useAbinNotes` 的 `AbinNotesEvent`）。
 *   不用 `onAbinEvent` callback：那個在過關流程之前就呼叫，這裡要等過關流程跑完才知道 NOVA 這道指令有沒有說過話。
 * - 這道指令 NOVA 已經說過話：比對執行前後的輸出區，新增的區塊裡有對話（過關台詞、第一次卡關、第 9 次錯誤）就不插嘴，
 *   觸發的反應留在記憶體裡，下一道沒有 NOVA 台詞的指令再說（換一台終端機也算）；重新整理就沒了。
 * - 說的時候：在這台的輸出區插一個 NOVA 對話區塊（跟開場白、卡關台詞一樣），立 `ch<n>.nova.<反應>` 旗標。
 *   `unset NOVA_DIR` 那一句同時讓燈閃一下，照「關閉閃爍」設定（光敏安全）。
 * - 只在主線 `/play`：沙盒不經過 PlayScreen，沒有 NOVA。
 */

import { useCallback, useMemo, useRef } from "react";
import { emitGameEvent } from "@/game/phaser/EventBus";
import type { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import {
	decideNovaReaction,
	detectNovaReactions,
	novaPhase,
	type AbinReactionEvent,
	type NovaReactionTrigger,
	type TerminalDefinition,
} from "@/game/story";
import { FLICKER_DURATION_MS } from "@/game/story/pressure";
import { useGameStore } from "@/game/store";
import type { OutputEntry } from "@/game/store/types";
import { createDialogueEntries } from "./terminalSession";

/** 內層的 `onExecuted`（`useAbinNotes` 的 `handleExecuted`），回傳這道指令跟阿彬留言有關的事。 */
export type InnerExecutedHandler = (
	definition: TerminalDefinition,
	shell: Shell,
	execution: ShellExecution,
) => AbinReactionEvent | null;

export interface UseNovaReactionsOptions {
	/** 目前章節（PlayScreen 掛載時讀的那一章）。 */
	chapter: number;
	/** 內層流程，判定之前一定會先呼叫。 */
	onExecuted: InnerExecutedHandler;
}

export interface UseNovaReactionsResult {
	/** 給 `TerminalModal.onExecuted`。 */
	handleExecuted: (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => void;
}

/**
 * 執行後才加進輸出區的區塊。輸出區只會從後面加、超過上限從前面裁，所以找執行前最後一個區塊在哪；
 * 找不到（例如整段被裁掉）就當作全部都是新的，這道指令乾脆不插嘴。
 */
function entriesAddedSince(before: readonly OutputEntry[], after: readonly OutputEntry[]): readonly OutputEntry[] {
	const lastBefore = before.at(-1);
	if (lastBefore === undefined) {
		return after;
	}
	const index = after.lastIndexOf(lastBefore);
	if (index === -1) {
		return after;
	}
	return after.slice(index + 1);
}

export function useNovaReactions({ chapter, onExecuted }: UseNovaReactionsOptions): UseNovaReactionsResult {
	// 撞到別的 NOVA 台詞而延後的反應，只放記憶體
	const pendingRef = useRef<NovaReactionTrigger[]>([]);

	const handleExecuted = useCallback(
		(definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => {
			const before = useGameStore.getState().terminals[definition.id]?.transcript ?? [];
			const abin = onExecuted(definition, shell, execution);

			const store = useGameStore.getState();
			const after = store.terminals[definition.id]?.transcript ?? [];
			const novaAlreadySpoke = entriesAddedSince(before, after).some((entry) => entry.kind === "dialogue");

			const detected = detectNovaReactions({
				execution,
				abin,
				chapterHints: store.stats[String(chapter)]?.hints ?? 0,
				terminalHints: shell.hintCount,
				hintStages: definition.hints.length,
			});
			const decision = decideNovaReaction({
				chapter,
				// 過關流程跑完之後的過關紀錄：殺掉 NOVA 核心的那一道指令本身就不再說話
				phase: novaPhase(chapter, store.progress.solvedTerminals),
				storyFlags: store.storyFlags,
				pending: pendingRef.current,
				detected,
				novaAlreadySpoke,
			});
			pendingRef.current = decision.pending;

			const { say } = decision;
			if (say === null) {
				return;
			}
			store.setFlag(say.flag);
			store.appendTranscript(
				definition.id,
				createDialogueEntries(`nova-react-${definition.id}-${say.kind}-${Date.now()}`, say.lines),
			);
			// 重現「那三秒」時燈閃一下；關閉閃爍時不閃（4.7 光敏安全）
			if (say.kind === "unsetNovaDir" && store.settings.flickerEnabled) {
				emitGameEvent("ambient:flicker", { durationMs: FLICKER_DURATION_MS });
			}
		},
		[chapter, onExecuted],
	);

	return useMemo(() => ({ handleExecuted }), [handleExecuted]);
}
