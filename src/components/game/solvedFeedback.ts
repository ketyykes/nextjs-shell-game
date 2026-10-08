/**
 * 過關當下的系統級回饋（M10-1）：終端機裡的「目標達成」行與過關音效。
 * 純函式，不碰 store 與 EventBus，由過關流程（`useSolveFlow`）呼叫。
 */

import type { SfxName } from "@/game/phaser/events";
import type { TerminalDefinition } from "@/game/story";
import type { OutputEntry } from "@/game/store/types";

/**
 * 過關時插在 NOVA 過關台詞前面的系統行，青綠成功色（4.9）。
 * 每台終端機只會過關一次（重玩本章會清掉紀錄），所以 id 帶終端機 id 就不會撞。
 * 打勾用 ☑ 而不是 U+2713 的勾：Fusion Pixel 與 VT323 都沒有那個字，會退回系統字型；☑ 也跟目標面板的打勾同一個符號。
 */
export function createObjectiveDoneEntry(definition: TerminalDefinition): OutputEntry {
	return {
		kind: "system",
		id: `objective-done-${definition.id}`,
		tone: "success",
		lines: [`☑ 目標達成：${definition.objective.title}`],
	};
}

/**
 * 過關當下要播的音效，重用 power（4.10 只有五種音效，不新增音檔）。
 * `powerRestored` 演出的終端機回傳 null：Station 在關掉終端機、燈亮起來時已經會播 power，
 * 這裡再播一次就變成同一次過關響兩聲，留給亮燈那一刻比較有戲。
 */
export function solvedSoundFor(definition: TerminalDefinition): SfxName | null {
	if (definition.effect?.kind === "powerRestored") {
		return null;
	}
	return "power";
}
