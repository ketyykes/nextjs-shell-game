import { useEffect, useMemo, useState } from "react";

interface TypewriterState {
	/** 目前在打的原文，原文換掉時要從頭打。 */
	source: string;
	/** 已經顯示的字數（以 code point 計）。 */
	count: number;
}

/**
 * 打字機效果：回傳目前應該顯示的文字。
 *
 * - `msPerChar` 為 0（或負數）時直接回傳全文，不開計時器。
 * - 以 code point 為單位前進，中文與 emoji 不會被切成半個字。
 * - `text` 換掉時從頭打；打完或卸載時清掉計時器。
 */
export function useTypewriter(text: string, msPerChar: number): string {
	const chars = useMemo(() => Array.from(text), [text]);
	const total = chars.length;
	const [state, setState] = useState<TypewriterState>({ source: text, count: 0 });

	// 原文換掉時在 render 期間重設進度（React 官方建議的「依 props 調整 state」寫法）
	if (state.source !== text) {
		setState({ source: text, count: 0 });
	}

	const isInstant = msPerChar <= 0;
	let count = 0;
	if (state.source === text) {
		count = state.count;
	}
	const isDone = isInstant || count >= total;

	useEffect(() => {
		if (isDone) {
			return;
		}
		const timer = setInterval(() => {
			setState((previous) => {
				if (previous.source !== text || previous.count >= total) {
					return previous;
				}
				return { source: previous.source, count: previous.count + 1 };
			});
		}, msPerChar);
		return () => {
			clearInterval(timer);
		};
	}, [text, total, msPerChar, isDone]);

	if (isInstant) {
		return text;
	}
	return chars.slice(0, count).join("");
}
