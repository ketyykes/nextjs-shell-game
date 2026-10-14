"use client";

import { useCallback, useMemo, useState } from "react";
import { CHAPTERS } from "@/game/chapters";
import { emitGameEvent } from "@/game/phaser/EventBus";
import type { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import { createObjectiveContext, evaluateObjective, type TerminalDefinition } from "@/game/story";
import { findSolutionInsights, insightFlag } from "@/game/story/solutionInsight";
import { useGameStore } from "@/game/store";
import { createInsightEntry, createObjectiveDoneEntry, solvedSoundFor } from "./solvedFeedback";
import { createDialogueEntries, toCommandName } from "./terminalSession";
import type { UseTerminalPressureResult } from "./useTerminalPressure";

/** 過關後目標面板保持打勾狀態的毫秒數，之後切到下一個目標。 */
export const SOLVED_FLASH_MS = 3000;

export interface UseSolveFlowOptions {
	/** 卡關計數，見 `usePressureReactions`；未過關的終端機每次執行都記一筆，過關時歸零。 */
	pressure: UseTerminalPressureResult;
	/** 過關當下呼叫，PlayScreen 用它記下 NOVA 過關台詞的最後一句（#5）。 */
	onSolved: (definition: TerminalDefinition) => void;
}

export interface UseSolveFlowResult {
	/** 給 `TerminalModal.onExecuted`：每次指令執行後呼叫。 */
	handleExecuted: (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => void;
	/** 剛過關的終端機 id，目標面板打勾 `SOLVED_FLASH_MS` 毫秒後變回 null。 */
	justSolvedId: string | null;
}

/**
 * 指令執行後的判定（設計文件 4.8）：
 *
 * - 每道指令播一次按鍵聲（#14）。
 * - 未過關的終端機記進卡關計數；錯誤扣 1% 氧氣（已過關的終端機打錯也扣）。
 * - 錯誤與 hint 記進目前章節的遊玩統計（M14-1），過關不歸零。
 * - 成功且達成目標就過關：卡關歸零、記錄過關、回氧、學會這台教的指令（#1、#2，store 存完整字串、shell 只學指令名）、
 *   存檔、目標面板打勾、發 `puzzle:solved` 讓 Phaser 播演出（終端機開著時 Station 自己延到關閉才播，#4）、
 *   播過關音效（M10-1），最後在終端機插「目標達成」系統行與 NOVA 過關台詞。
 * - 過關那一行用了還沒教的東西（4.9），在「目標達成」與 NOVA 台詞之間插一行認可，並記下 `insight.<概念>` 旗標，
 *   同一個東西整份存檔只認可一次（重玩章節不清，新遊戲才清）。
 */
export function useSolveFlow({ pressure, onSolved }: UseSolveFlowOptions): UseSolveFlowResult {
	const [justSolvedId, setJustSolvedId] = useState<string | null>(null);
	const { recordExecution, reset } = pressure;

	const handleExecuted = useCallback(
		(definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => {
			// 按鍵聲（4.10）：每送出一道指令響一次，每個按鍵都響太吵
			emitGameEvent("sfx:play", { sound: "key" });
			const store = useGameStore.getState();
			// 遊玩統計（M14-1）：終端機只會在目前章節打開，記在目前章節
			store.recordCommandStats(store.progress.chapter, execution);
			const alreadySolved = store.progress.solvedTerminals.includes(definition.id);
			if (!alreadySolved) {
				recordExecution(execution.isError, execution.hintUsed);
			}
			if (execution.isError) {
				store.loseOxygen();
				return;
			}
			if (alreadySolved) {
				return;
			}
			const context = createObjectiveContext(definition.id, execution, shell.fs, shell.home);
			if (!evaluateObjective(definition, context)) {
				return;
			}

			// 認可要用過關「之前」的已學清單與旗標，所以在學會這台教的指令之前算
			const insights = findSolutionInsights({
				execution,
				definition,
				learnedCommands: store.progress.learnedCommands,
				storyFlags: store.storyFlags,
				chapters: CHAPTERS,
			});
			for (const insight of insights) {
				store.setFlag(insightFlag(insight.concept));
			}

			// 過關：記錄、回氧、學會這台教的指令、存檔、通知 Phaser 播演出
			reset();
			store.markTerminalSolved(definition.id);
			store.restoreOxygen();
			for (const teach of definition.teaches) {
				store.learnCommand(teach);
				shell.learn(toCommandName(teach));
			}
			store.touchSave();
			setJustSolvedId(definition.id);
			window.setTimeout(() => setJustSolvedId(null), SOLVED_FLASH_MS);
			emitGameEvent("puzzle:solved", { terminalId: definition.id });
			// 過關音效（M10-1）：powerRestored 的那台交給 Station 亮燈時播，避免響兩次；blackout 的那台不播
			const solvedSound = solvedSoundFor(definition);
			if (solvedSound !== null) {
				emitGameEvent("sfx:play", { sound: solvedSound });
			}

			// 先插一行青綠的「目標達成」，有提前用上的東西再插認可行，最後接 NOVA 的過關台詞
			const solvedLines = definition.nova?.onSolved ?? [];
			const insightEntry = createInsightEntry(definition, insights);
			store.appendTranscript(definition.id, [
				createObjectiveDoneEntry(definition),
				...(insightEntry === null ? [] : [insightEntry]),
				...createDialogueEntries(`nova-solved-${definition.id}`, solvedLines),
			]);
			onSolved(definition);
		},
		[onSolved, recordExecution, reset],
	);

	return useMemo(() => ({ handleExecuted, justSolvedId }), [handleExecuted, justSolvedId]);
}
