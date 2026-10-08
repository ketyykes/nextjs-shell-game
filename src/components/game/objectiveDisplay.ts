/**
 * 目標面板要顯示的內容。純函式，不碰 React 與 store。
 */

import { findTerminal } from "@/game/chapters";
import type { TerminalDefinition } from "@/game/story";
import { currentObjectiveTerminal } from "@/game/story/currentObjective";

export interface ObjectiveDisplayInput {
	terminals: readonly TerminalDefinition[];
	solvedTerminals: readonly string[];
	openTerminalId: string | null;
	nearbyTerminalId: string | null;
	/** 剛過關、目標面板還在打勾的那台（`useSolveFlow().justSolvedId`）。 */
	justSolvedId: string | null;
}

export interface ObjectiveDisplay {
	/** null 代表這一章全部過關，面板不顯示目標。 */
	title: string | null;
	description: string | undefined;
	/** 目標面板打勾。 */
	solved: boolean;
}

/**
 * 剛過關的那台優先（打勾 3 秒）；否則目標跟著終端機走（M10-2）：開著的 > 附近的 > 第一台未過關的，已過關的不搶目標。
 */
export function objectiveDisplay({
	terminals,
	solvedTerminals,
	openTerminalId,
	nearbyTerminalId,
	justSolvedId,
}: ObjectiveDisplayInput): ObjectiveDisplay {
	const justSolved = justSolvedId !== null ? findTerminal(justSolvedId) : undefined;
	if (justSolved !== undefined) {
		return { title: justSolved.objective.title, description: justSolved.objective.description, solved: true };
	}
	const current = currentObjectiveTerminal(terminals, solvedTerminals, { openTerminalId, nearbyTerminalId });
	if (current !== undefined) {
		return { title: current.objective.title, description: current.objective.description, solved: false };
	}
	return { title: null, description: undefined, solved: false };
}
