/**
 * 目標面板要顯示哪一台終端機的目標（M10-2）：目標跟著玩家正在處理的終端機走，而不是固定指向編號最小的未解終端機。
 * 地圖不鎖順序（第 9 節只是建議順序），玩家在 T4 前面時面板還在講 T3 會誤導。
 *
 * 純函式，不 import React、Phaser 或 zustand。
 */

import type { TerminalDefinition } from "./types";

/** 玩家此刻關注的終端機：開著的那台、站在旁邊的那台（`terminal:nearby`），沒有就是 null。 */
export interface ObjectiveFocus {
	openTerminalId: string | null;
	nearbyTerminalId: string | null;
}

/**
 * 優先順序：開著且未過關的那台 > 附近且未過關的那台 > 這一章第一台未過關的。
 * 已過關的終端機不搶目標（走過已解的終端機時面板不會跳回舊目標）；不是這一章的 id 一律忽略。
 * 全部過關時回傳 undefined。
 */
export function currentObjectiveTerminal(
	terminals: readonly TerminalDefinition[],
	solvedTerminals: readonly string[],
	focus: ObjectiveFocus,
): TerminalDefinition | undefined {
	const unsolved = terminals.filter((terminal) => !solvedTerminals.includes(terminal.id));
	for (const focusedId of [focus.openTerminalId, focus.nearbyTerminalId]) {
		if (focusedId === null) {
			continue;
		}
		const focused = unsolved.find((terminal) => terminal.id === focusedId);
		if (focused !== undefined) {
			return focused;
		}
	}
	return unsolved[0];
}
