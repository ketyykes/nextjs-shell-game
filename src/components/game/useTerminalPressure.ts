"use client";

import { useCallback, useEffect, useRef } from "react";
import {
	checkIdle,
	createPressureState,
	recordExecution as recordPressureExecution,
	resetPressure,
} from "@/game/story/pressure";
import type { PressureReaction, PressureResult, PressureState } from "@/game/story/pressure";

/** 閒置檢查的間隔（毫秒）。卡關門檻是三分鐘、重複提醒兩分鐘，10 秒的誤差玩家感覺不到。 */
export const IDLE_CHECK_INTERVAL_MS = 10_000;

export interface UseTerminalPressureOptions {
	/** 目前開著、而且還沒過關的終端機；null 代表關著（或不需要偵測），此時不計數也不跑閒置檢查。 */
	terminalId: string | null;
	/** 開啟時的累積錯誤次數，從 store 的 `record.errorCount ?? 0` 來；只在 `terminalId` 變動時讀取。 */
	initialErrorCount: number;
	/** 卡關或階梯反應發生時呼叫，可能一次執行收到兩個（例如 door 與 stuck）。 */
	onReaction: (reaction: PressureReaction) => void;
	/** 累積錯誤次數變動時呼叫，整合者用它存進 store（`setTerminalErrorCount`）。 */
	onErrorCountChange: (count: number) => void;
}

export interface UseTerminalPressureResult {
	/**
	 * 每次指令執行後呼叫，`isError` 與 `hintUsed` 就是 `execution.isError`、`execution.hintUsed`。
	 * 輸入 hint 會把閒置計時往後推，其他合法指令不會。終端機關著時不做事。
	 */
	recordExecution: (isError: boolean, hintUsed?: boolean) => void;
	/** 過關時呼叫：計數歸零（並回報 `onErrorCountChange(0)`），這台的卡關提示可以再給。 */
	reset: () => void;
}

/**
 * 卡關偵測與環境反應階梯（設計文件 4.8）的 React 接頭，純邏輯在 `@/game/story/pressure`。
 *
 * - 狀態放在 `useRef`，計數變動不會讓元件重新 render；要顯示或存檔請透過 callback。
 * - `terminalId` 變動時用 `initialErrorCount` 重建狀態：累積次數接續存檔，連續次數與閒置計時重新開始。
 * - 「已給過第一次卡關提示」在這個 hook 存活期間按終端機記住，關掉再開同一台不會重給第一次的提示，
 *   之後只會是重複提醒（`repeat: true`）；過關（`reset`）才清掉。
 * - 終端機開著時每 `IDLE_CHECK_INTERVAL_MS` 跑一次 `checkIdle`，關著或卸載時清掉 interval。
 * - callback 用 ref 保存最新的版本，interval 與回傳的函式都不會讀到舊的 closure。
 */
export function useTerminalPressure(options: UseTerminalPressureOptions): UseTerminalPressureResult {
	const { terminalId, initialErrorCount, onReaction, onErrorCountChange } = options;

	const stateRef = useRef<PressureState | null>(null);
	const terminalIdRef = useRef<string | null>(null);
	/** 這次過關前已給過卡關提示的終端機。 */
	const stuckGivenRef = useRef<Set<string>>(new Set());

	const initialErrorCountRef = useRef(initialErrorCount);
	const onReactionRef = useRef(onReaction);
	const onErrorCountChangeRef = useRef(onErrorCountChange);

	// 每次 render 後同步最新的值；宣告在下面的 effect 之前，同一輪 commit 會先跑這個
	useEffect(() => {
		initialErrorCountRef.current = initialErrorCount;
		onReactionRef.current = onReaction;
		onErrorCountChangeRef.current = onErrorCountChange;
	});

	/** 把結果寫回 ref，記錄卡關提示，再依序通知呼叫端。 */
	const applyResult = useCallback((currentId: string, previous: PressureState, result: PressureResult) => {
		stateRef.current = result.state;

		if (result.state.stuckHintGiven) {
			stuckGivenRef.current.add(currentId);
		}
		if (result.state.errorCount !== previous.errorCount) {
			onErrorCountChangeRef.current(result.state.errorCount);
		}
		for (const reaction of result.reactions) {
			onReactionRef.current(reaction);
		}
	}, []);

	useEffect(() => {
		terminalIdRef.current = terminalId;

		if (terminalId === null) {
			stateRef.current = null;
			return;
		}

		const created = createPressureState(Date.now(), initialErrorCountRef.current);
		stateRef.current = { ...created, stuckHintGiven: stuckGivenRef.current.has(terminalId) };

		const intervalId = window.setInterval(() => {
			const current = stateRef.current;
			if (current === null || terminalIdRef.current !== terminalId) {
				return;
			}
			applyResult(terminalId, current, checkIdle(current, Date.now()));
		}, IDLE_CHECK_INTERVAL_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [terminalId, applyResult]);

	const recordExecution = useCallback(
		(isError: boolean, hintUsed = false) => {
			const currentId = terminalIdRef.current;
			const current = stateRef.current;
			if (currentId === null || current === null) {
				return;
			}
			applyResult(currentId, current, recordPressureExecution(current, isError, Date.now(), hintUsed));
		},
		[applyResult],
	);

	const reset = useCallback(() => {
		const currentId = terminalIdRef.current;
		if (currentId !== null) {
			stuckGivenRef.current.delete(currentId);
			stateRef.current = resetPressure(Date.now());
		}
		onErrorCountChangeRef.current(0);
	}, []);

	return { recordExecution, reset };
}
