"use client";

/**
 * 終端機的「顯示不穩」狀態（設計文件 4.25）：目前只有 NOVA 斷句一項。
 *
 * 主線的 `TerminalModal` 依氧氣提供值，`DialogueBlock` 讀它；沙盒不提供，預設穩定。
 * 用 context 而不是一路傳 props，`Terminal` 本身不用知道氧氣。
 * 終端機輸出的文字不受影響（亂碼已拿掉，notes/decisions.md #150）。
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import { applyStutter, STABLE_DISPLAY, STUTTER_PAUSE_MS, stutterPoints, type DisplayInstability } from "./novaStutter";
import type { TypewriterOptions } from "./useTypewriter";

export const DisplayInstabilityContext = createContext<DisplayInstability>(STABLE_DISPLAY);

export function useDisplayInstability(): DisplayInstability {
	return useContext(DisplayInstabilityContext);
}

const NO_STUTTER_POINTS: readonly number[] = [];

export interface StutterControls {
	/** 交給 `useTypewriter` 的停頓設定。 */
	typewriter: TypewriterOptions;
	/** 把打字機回傳的原文前綴插上「……」。 */
	apply: (typed: string) => string;
}

/**
 * NOVA 台詞的低氧斷句（4.25）：每隔幾個字插「……」，打字動畫在那裡停一下。
 *
 * 終端機內的 `DialogueBlock` 讀 context；地圖上的 `NovaDialogue` 不在終端機裡，由父層用 `enabled` 直接指定。
 * 打字機一直數原文的字，所以斷句開關切換時不會從頭打，「……」只是畫面上插進去的。
 */
export function useStutter(text: string, enabled?: boolean): StutterControls {
	const context = useDisplayInstability();
	// 父層有指定就照父層，沒指定才看 context
	const active = enabled ?? context.stutter;
	const points = useMemo(() => {
		if (!active) {
			return NO_STUTTER_POINTS;
		}
		return stutterPoints(text);
	}, [active, text]);
	const typewriter = useMemo(() => ({ pauseAfter: points, pauseMs: STUTTER_PAUSE_MS }), [points]);
	const apply = useCallback((typed: string) => applyStutter(typed, points), [points]);
	return { typewriter, apply };
}
