"use client";

/**
 * 終端機的「顯示不穩」狀態（設計文件 4.25）。
 *
 * 主線的 `TerminalModal` 依氧氣提供值，`OutputBlock` 與 `DialogueBlock` 讀它；沙盒不提供，預設穩定。
 * 用 context 而不是一路傳 props，`Terminal` 本身不用知道氧氣。
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import type { OutputEntry } from "@/game/store/types";
import {
	applyStutter,
	glitchLines,
	isSystemHelpInput,
	STABLE_DISPLAY,
	STUTTER_PAUSE_MS,
	stutterPoints,
	type DisplayInstability,
} from "./displayGlitch";
import type { TypewriterOptions } from "./useTypewriter";

export const DisplayInstabilityContext = createContext<DisplayInstability>(STABLE_DISPLAY);

export function useDisplayInstability(): DisplayInstability {
	return useContext(DisplayInstabilityContext);
}

type DisplayedEntry = Extract<OutputEntry, { kind: "command" } | { kind: "system" }>;

/** 指令輸出回傳玩家打的那一行，系統行回傳 null（系統行一律不亂碼）。 */
function commandInputOf(entry: DisplayedEntry): string | null {
	if (entry.kind === "command") {
		return entry.input;
	}
	return null;
}

/**
 * 這一筆輸出畫面上要顯示的行。
 *
 * 只有指令輸出會亂碼；系統行（目標達成、☆ 認可、Tab 候選、阿彬留言的收錄行）與跑到 `hint`、`help` 的那一行都照原文。
 * 以區塊 id 當種子，同一筆每次 render 一樣；比例 0 時直接回傳原本的陣列。
 */
export function useDisplayedOutputLines(entry: DisplayedEntry): readonly string[] {
	const { glitchRate } = useDisplayInstability();
	const input = commandInputOf(entry);
	return useMemo(() => {
		if (input === null || !(glitchRate > 0) || isSystemHelpInput(input)) {
			return entry.lines;
		}
		return glitchLines(entry.lines, entry.id, glitchRate);
	}, [entry.id, entry.lines, glitchRate, input]);
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
