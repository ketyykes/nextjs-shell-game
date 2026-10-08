/**
 * 卡關偵測與環境反應階梯的純邏輯（設計文件 4.8，progress M5-3、M5-4、M10-5）。
 *
 * - **卡關偵測**：同一台終端機連續 `STUCK_ERROR_STREAK` 次錯誤，或從「開啟終端機或上次輸入 hint」起
 *   `STUCK_IDLE_MS` 還沒過關，NOVA 主動用劇情台詞給方向（內容等同 hint 第一段）。
 *   合法但沒用的指令（反覆 ls、cd 來回）不會重設閒置計時，這是新手最常見的卡法。
 *   第一次之後改成重複提醒（`repeat: true`，由整合者顯示 `STUCK_REMINDER_LINES`），
 *   距離上次提醒或上次輸入 hint 至少 `STUCK_REPEAT_MS`，而且這段時間玩家有打過指令（沒打就是離開座位，不洗版）；
 *   錯誤路徑則要重新連續錯滿 `STUCK_ERROR_STREAK` 次。
 * - **環境反應階梯**：同一台終端機「累積」錯誤次數，3 次燈閃一下、6 次遠處門關上的聲音、
 *   9 次 NOVA 說「你確定你是技師？」這類台詞。過關後歸零。
 *
 * 「錯誤」的定義是 `execution.isError`；合法指令不算錯，不扣氧也不推進階梯，不懲罰探索。
 * 階梯看累積次數，卡關看連續次數：中間打對一次只會把連續次數歸零，累積次數不變。
 *
 * 這個檔案不 import React、Phaser 或 zustand，全部是回傳新物件的純函式。
 */

import type { TerminalDefinition } from "./types";

/** 連續幾次錯誤算卡關。 */
export const STUCK_ERROR_STREAK = 5;

/** 從開啟終端機或上次輸入 hint 起，多久還沒過關算卡關（毫秒）。 */
export const STUCK_IDLE_MS = 3 * 60 * 1000;

/** 給過第一次卡關提示之後，重複提醒的最短間隔（毫秒），從上次提醒或上次輸入 hint 起算。 */
export const STUCK_REPEAT_MS = 2 * 60 * 1000;

/**
 * 重複提醒的文字，整合者用系統行（不是 NOVA 台詞）顯示：提示來自遊戲系統（4.6），
 * 而且第六章 NOVA 被終止之後的終端機也能用，不會出現 NOVA 口吻而出戲。
 */
export const STUCK_REMINDER_LINES: string[] = ["卡住了嗎？輸入 hint 取得提示，重複輸入會一段比一段詳細。"];

/**
 * 環境反應階梯的門檻（累積錯誤次數）。
 *
 * 一輪是 9 次，之後整個階梯每 9 次循環一輪：
 * - 累積次數除以 9 餘 3（3、12、21…）：燈閃一下
 * - 累積次數除以 9 餘 6（6、15、24…）：遠處門關上的聲音
 * - 累積次數是 9 的倍數（9、18、27…）：NOVA 台詞，`lineIndex` 為第幾輪減一（9 → 0、18 → 1、27 → 2）
 *
 * 也就是說第 12 次會再閃一次燈，第 18 次 NOVA 換下一句。這樣錯越多，「它一直在看」的感覺越重，
 * 但不會每次錯都有反應，頻率維持跟第一輪一樣。
 */
export const LADDER_STEPS = { flicker: 3, door: 6, nova: 9 } as const;

/** 階梯循環的週期，等於最後一階的門檻。 */
const LADDER_CYCLE = LADDER_STEPS.nova;

/** 建議的「燈閃一下」總長度（毫秒），整合者發 `ambient:flicker` 時用。 */
export const FLICKER_DURATION_MS = 600;

/** 章節沒寫 `novaErrorLines` 時用的預設台詞，依序輪流。不指涉性別、年齡、名字。 */
export const DEFAULT_NOVA_ERROR_LINES: string[] = [
	"你確定你是技師？",
	"……技師不會這樣打。我記得是這樣。",
	"我有在數。每一次都有。",
	"慢慢來。我在看。",
];

/** 沒寫 `onStuck` 時，接在 `hints[0]` 前面的 NOVA 開場白。 */
const STUCK_PREFIX_LINE = "技師，我猜你在找方向。";

export interface PressureState {
	/** 這台終端機這次過關前的累積錯誤次數，階梯用；會存進 store 跨重整保留。 */
	errorCount: number;
	/** 連續錯誤次數，卡關偵測用；打對一次就歸零。 */
	errorStreak: number;
	/** 閒置計時的起點：開啟終端機、上次輸入 hint 或上次卡關提醒的時間戳，毫秒。合法指令不會重設它。 */
	idleSince: number;
	/** 這台終端機這次過關前是否已給過第一次卡關提示；給過之後再提醒就是重複提醒。 */
	stuckHintGiven: boolean;
	/** 開啟終端機或上次卡關提醒之後，玩家有沒有打過任何指令。重複提醒要求有，免得離開座位時洗版。 */
	activeSinceReminder: boolean;
}

export type PressureReaction =
	| { type: "flicker" }
	| { type: "door" }
	| { type: "nova"; lineIndex: number }
	/** `repeat` 為 false 是第一次（NOVA 用劇本台詞給方向），true 是之後的重複提醒（提示輸入 hint）。 */
	| { type: "stuck"; repeat: boolean };

export interface PressureResult {
	state: PressureState;
	reactions: PressureReaction[];
}

/** 開啟終端機時建立狀態：累積次數從存檔帶進來，連續次數與閒置計時重新開始。 */
export function createPressureState(now: number, errorCount = 0): PressureState {
	return {
		errorCount: Math.max(0, Math.trunc(errorCount)),
		errorStreak: 0,
		idleSince: now,
		stuckHintGiven: false,
		activeSinceReminder: false,
	};
}

/** 給一次卡關提醒：標記已給、閒置計時與連續錯誤從這裡重新算。 */
function giveStuckReminder(state: PressureState, now: number): PressureResult {
	return {
		state: { ...state, stuckHintGiven: true, idleSince: now, errorStreak: 0, activeSinceReminder: false },
		reactions: [{ type: "stuck", repeat: state.stuckHintGiven }],
	};
}

/** 依累積錯誤次數回傳這一次的階梯反應；沒落在門檻上回傳 null。 */
function ladderReaction(errorCount: number): PressureReaction | null {
	if (errorCount <= 0) {
		return null;
	}

	const position = errorCount % LADDER_CYCLE;
	if (position === LADDER_STEPS.flicker) {
		return { type: "flicker" };
	}
	if (position === LADDER_STEPS.door) {
		return { type: "door" };
	}
	if (position === 0) {
		return { type: "nova", lineIndex: errorCount / LADDER_CYCLE - 1 };
	}
	return null;
}

/**
 * 指令執行後呼叫。`hintUsed` 就是 `execution.hintUsed`：輸入 hint 會把閒置計時重設到 `now`。
 *
 * - `isError` 為 true：累積與連續次數各加一。新的累積次數落在階梯門檻上就回傳對應反應；
 *   連續次數達到 `STUCK_ERROR_STREAK` 時，還沒給過卡關提示就回傳第一次的 `stuck`，
 *   給過了則要距離上次提醒（或上次輸入 hint）滿 `STUCK_REPEAT_MS` 才回傳重複提醒。
 *   兩者可能同時發生，順序固定是階梯反應在前、`stuck` 在後。
 * - `isError` 為 false：連續次數歸零，不回傳反應；沒輸入 hint 的話閒置計時不動。
 */
export function recordExecution(
	state: PressureState,
	isError: boolean,
	now: number,
	hintUsed = false,
): PressureResult {
	let idleSince = state.idleSince;
	if (hintUsed) {
		idleSince = now;
	}
	const active: PressureState = { ...state, idleSince, activeSinceReminder: true };

	if (!isError) {
		return {
			state: { ...active, errorStreak: 0 },
			reactions: [],
		};
	}

	const errorCount = state.errorCount + 1;
	const errorStreak = state.errorStreak + 1;
	const counted: PressureState = { ...active, errorCount, errorStreak };
	const reactions: PressureReaction[] = [];

	const ladder = ladderReaction(errorCount);
	if (ladder !== null) {
		reactions.push(ladder);
	}

	const reminderDue = !counted.stuckHintGiven || now - counted.idleSince >= STUCK_REPEAT_MS;
	if (errorStreak >= STUCK_ERROR_STREAK && reminderDue) {
		const reminded = giveStuckReminder(counted, now);
		return { state: reminded.state, reactions: [...reactions, ...reminded.reactions] };
	}

	return { state: counted, reactions };
}

/**
 * 定時呼叫（例如每 10 秒），沒到時間就原樣回傳 state 與空陣列：
 * - 還沒給過卡關提示：距離 `idleSince` 滿 `STUCK_IDLE_MS` 就回傳第一次的 `stuck`。
 * - 給過了：距離 `idleSince` 滿 `STUCK_REPEAT_MS`，而且上次提醒之後玩家有打過指令，才回傳重複提醒。
 */
export function checkIdle(state: PressureState, now: number): PressureResult {
	const elapsed = now - state.idleSince;

	if (!state.stuckHintGiven) {
		if (elapsed < STUCK_IDLE_MS) {
			return { state, reactions: [] };
		}
		return giveStuckReminder(state, now);
	}

	if (!state.activeSinceReminder || elapsed < STUCK_REPEAT_MS) {
		return { state, reactions: [] };
	}
	return giveStuckReminder(state, now);
}

/** 過關：累積、連續次數與卡關提示全部歸零，閒置計時從 `now` 重新開始。 */
export function resetPressure(now: number): PressureState {
	return createPressureState(now, 0);
}

/**
 * 組 NOVA 的卡關台詞。
 * 劇本有寫 `nova.onStuck` 就用它（拷貝一份）；沒寫就在 `hints[0]` 前面加一句 NOVA 的開場白。
 */
export function stuckLines(definition: Pick<TerminalDefinition, "hints" | "nova">): string[] {
	const custom = definition.nova?.onStuck;
	if (custom !== undefined && custom.length > 0) {
		return [...custom];
	}

	const firstHint = definition.hints[0];
	if (firstHint === undefined) {
		return [STUCK_PREFIX_LINE];
	}
	return [STUCK_PREFIX_LINE, firstHint];
}

/**
 * 取階梯第 9 次（以及之後每 9 次）的 NOVA 台詞。
 * `lines` 是章節的 `novaErrorLines`，沒寫或是空陣列就用 `DEFAULT_NOVA_ERROR_LINES`；`lineIndex` 取餘數輪流。
 */
export function novaErrorLine(lines: string[] | undefined, lineIndex: number): string {
	let source = DEFAULT_NOVA_ERROR_LINES;
	if (lines !== undefined && lines.length > 0) {
		source = lines;
	}

	const length = source.length;
	const index = ((Math.trunc(lineIndex) % length) + length) % length;
	return source[index];
}
