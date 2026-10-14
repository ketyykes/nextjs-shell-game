"use client";

/**
 * HUD 左上角 O2 下面的除役倒數（設計文件 4.13）。
 *
 * 遊戲內時間＝喚醒時間 + 存檔裡第一章到這章的遊玩時間 + 上次寫進存檔之後、這裡自己數的那一段。
 * `usePlayTime` 每 30 秒才寫一次存檔（persist 每次 `set` 都整份序列化），所以秒數由這裡在前景每秒補上；
 * 存檔的值一變（`usePlayTime` 寫入了）就把自己數的歸零，兩邊不重複算。
 * `running` 必須跟 `usePlayTime` 的 `active` 是同一個條件，而且這個元件要一直掛著（終端機開著也是），
 * 卸載會丟掉還沒寫進存檔的那一段，重新掛上時倒數會往回跳。
 *
 * 不做任何動畫或閃爍，階段變了只換標籤與顏色；用 `timer` 角色，螢幕閱讀器不會每秒播報。
 */

import { useEffect, useState } from "react";
import { MAX_PLAY_TIME_STEP_MS } from "@/components/game/usePlayTime";
import { selectIsGameFinished, useGameStore } from "@/game/store";
import {
	COUNTDOWN_LABELS,
	countdownPhase,
	elapsedPlayTimeMs,
	formatCountdown,
	remainingMs,
	type VisibleCountdownPhase,
} from "./decommission";

/** 多久重算一次顯示的秒數。 */
export const COUNTDOWN_TICK_MS = 1000;

export interface DecommissionCountdownProps {
	/** PlayScreen 掛載時的章節。 */
	chapter: number;
	/** 遊戲內時間在不在走，跟 `usePlayTime` 的 `active` 同一個條件。 */
	running: boolean;
}

/** 前四章用不起眼的暗色，揭露之後換琥珀；NOVA 被終止之後數字換成全息藍，留白不說破。 */
const LABEL_CLASS: Record<VisibleCountdownPhase, string> = {
	schedule: "text-game-dim",
	decommission: "text-game-amber",
	unresponsive: "text-game-amber",
};
const VALUE_CLASS: Record<VisibleCountdownPhase, string> = {
	schedule: "text-game-prompt",
	decommission: "text-game-amber",
	unresponsive: "text-game-holo",
};

interface UnsavedPlayTime {
	/** 這段是接在哪個存檔值後面數的；存檔值變了就作廢。 */
	savedMs: number;
	ms: number;
}

function isPageVisible(): boolean {
	return document.visibilityState === "visible";
}

/**
 * 上次寫進存檔之後、前景遊玩中又過了多久。規則跟 `usePlayTime` 一樣：分頁在背景不算、單段最多算 2 分鐘。
 * 停下來（`running` 變 false）時保留最後的值，等 `usePlayTime` 把它寫進存檔再作廢，所以數字不會先倒退再跳回來。
 */
function useUnsavedPlayTime(savedMs: number, running: boolean): number {
	const [unsaved, setUnsaved] = useState<UnsavedPlayTime>({ savedMs, ms: 0 });

	useEffect(() => {
		if (!running) {
			return;
		}
		// 背景期間先收起來的部分；正常情況切到背景時 usePlayTime 就寫進存檔了，這裡會跟著整個重來
		let carriedMs = 0;
		let since: number | null = null;
		if (isPageVisible()) {
			since = Date.now();
		}

		const measure = () => {
			let ms = carriedMs;
			if (since !== null) {
				ms += Date.now() - since;
			}
			return Math.min(ms, MAX_PLAY_TIME_STEP_MS);
		};
		const tick = () => {
			setUnsaved({ savedMs, ms: measure() });
		};
		const handleVisibilityChange = () => {
			if (isPageVisible()) {
				since = Date.now();
			} else {
				carriedMs = measure();
				since = null;
			}
			tick();
		};

		const timer = window.setInterval(tick, COUNTDOWN_TICK_MS);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [savedMs, running]);

	if (unsaved.savedMs !== savedMs) {
		return 0;
	}
	return unsaved.ms;
}

export function DecommissionCountdown({ chapter, running }: DecommissionCountdownProps) {
	// selector 都回傳數字或字串，不組新物件
	const savedMs = useGameStore((state) => elapsedPlayTimeMs(state.stats, chapter));
	const phase = useGameStore((state) =>
		countdownPhase({
			chapter,
			solvedTerminals: state.progress.solvedTerminals,
			finished: selectIsGameFinished(state),
		}),
	);
	const unsavedMs = useUnsavedPlayTime(savedMs, running);

	if (phase === "hidden") {
		return null;
	}

	return (
		<div
			role="timer"
			// 地圖亮起來後牆面很淺，琥珀字會糊掉，墊一層半透明底色；left-2 加 px-2 讓字跟 O2 對齊
			className="pointer-events-none absolute top-12 left-2 z-30 flex items-baseline gap-3 bg-game-bg/75 px-2 text-2xl whitespace-nowrap"
			data-testid="hud-countdown"
			data-phase={phase}
		>
			<span className={LABEL_CLASS[phase]} data-testid="countdown-label">
				{COUNTDOWN_LABELS[phase]}
			</span>
			<span className={VALUE_CLASS[phase]} data-testid="countdown-value">
				{formatCountdown(remainingMs(savedMs + unsavedMs))}
			</span>
		</div>
	);
}
