import { useEffect, useMemo, useState } from "react";

interface TypewriterState {
	/** 目前在打的原文，原文換掉時要從頭打。 */
	source: string;
	/** 已經顯示的字數（以 code point 計）。 */
	count: number;
	/** 斷點上還要停幾拍才打下一個字。 */
	hold: number;
}

export interface TypewriterOptions {
	/**
	 * 打到這些字數（code point）時多停一下，低氧斷句用（4.25）。
	 * 陣列要由呼叫端 memo 住，每次 render 換新陣列會讓計時器重設。
	 */
	pauseAfter?: readonly number[];
	/** 每個停頓的毫秒數，換算成打字的拍數（至少一拍）。 */
	pauseMs?: number;
}

const NO_PAUSES: readonly number[] = [];

/**
 * 打字機效果：回傳目前應該顯示的文字（原文的前綴）。
 *
 * - `msPerChar` 為 0（或負數）時直接回傳全文，不開計時器。
 * - 以 code point 為單位前進，中文與 emoji 不會被切成半個字。
 * - `text` 換掉時從頭打；打完或卸載時清掉計時器。
 * - 給了 `pauseAfter` 時，打到那些字數後多停 `pauseMs`；停頓不改回傳的文字，「……」由呼叫端插。
 */
export function useTypewriter(text: string, msPerChar: number, options: TypewriterOptions = {}): string {
	const chars = useMemo(() => Array.from(text), [text]);
	const total = chars.length;
	const [state, setState] = useState<TypewriterState>({ source: text, count: 0, hold: 0 });
	const pauseAfter = options.pauseAfter ?? NO_PAUSES;
	const pauseMs = options.pauseMs ?? 0;

	// 原文換掉時在 render 期間重設進度（React 官方建議的「依 props 調整 state」寫法）
	if (state.source !== text) {
		setState({ source: text, count: 0, hold: 0 });
	}

	const isInstant = msPerChar <= 0;
	let count = 0;
	if (state.source === text) {
		count = state.count;
	}
	const isDone = isInstant || count >= total;

	let pauseTicks = 0;
	if (!isInstant && pauseMs > 0) {
		pauseTicks = Math.max(1, Math.ceil(pauseMs / msPerChar));
	}

	useEffect(() => {
		if (isDone) {
			return;
		}
		const timer = setInterval(() => {
			setState((previous) => {
				if (previous.source !== text || previous.count >= total) {
					return previous;
				}
				if (previous.hold > 0) {
					return { source: previous.source, count: previous.count, hold: previous.hold - 1 };
				}
				const next = previous.count + 1;
				let hold = 0;
				if (pauseAfter.includes(next)) {
					hold = pauseTicks;
				}
				return { source: previous.source, count: next, hold };
			});
		}, msPerChar);
		return () => {
			clearInterval(timer);
		};
	}, [text, total, msPerChar, isDone, pauseAfter, pauseTicks]);

	if (isInstant) {
		return text;
	}
	return chars.slice(0, count).join("");
}
