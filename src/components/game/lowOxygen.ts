/**
 * 低氧氣的後果（設計文件 4.25）：氧氣低於 `OXYGEN_CRITICAL_THRESHOLD`（20%）時的顯示不穩與心跳聲，純函式。
 *
 * 沒有失敗狀態（4.8）：氧氣最低 5%、不會歸零，這裡只決定「多不穩」「多大聲」。
 * 30% 的暗角（`OxygenVignette`）是另一條，不受影響。
 */

import { STABLE_DISPLAY, type DisplayInstability } from "@/components/terminal/displayGlitch";
import type { RoomId } from "@/game/phaser/events";
import { OXYGEN_CRITICAL_THRESHOLD } from "@/game/store/selectors";
import { OXYGEN_MIN } from "@/game/store/types";

/** 剛低於門檻（19%）時每個字被換成亂碼的機率。 */
export const GLITCH_RATE_MIN = 0.02;
/** 氧氣到最低（5%）時的機率。 */
export const GLITCH_RATE_MAX = 0.08;

/** 最後一個還算「低」的整數百分比，嚴重度從這裡的 0 開始。 */
const CRITICAL_START = OXYGEN_CRITICAL_THRESHOLD - 1;

export function isOxygenCritical(oxygen: number): boolean {
	return oxygen < OXYGEN_CRITICAL_THRESHOLD;
}

/**
 * 低氧的嚴重度：19% 是 0、最低氧氣 5% 是 1，線性；低於 5% 也夾在 1。
 * 只在 `isOxygenCritical` 為 true 時有意義。
 */
function criticalSeverity(oxygen: number): number {
	const clamped = Math.min(CRITICAL_START, Math.max(OXYGEN_MIN, oxygen));
	return (CRITICAL_START - clamped) / (CRITICAL_START - OXYGEN_MIN);
}

/** 終端機輸出的亂碼比例：20% 以上是 0，19% 起從 2% 線性升到 5% 時的 8%。 */
export function glitchRateFor(oxygen: number): number {
	if (!isOxygenCritical(oxygen)) {
		return 0;
	}
	return GLITCH_RATE_MIN + (GLITCH_RATE_MAX - GLITCH_RATE_MIN) * criticalSeverity(oxygen);
}

/** 給 `DisplayInstabilityContext` 的值：低氧時亂碼與斷句一起開，回到 20% 以上立刻恢復。 */
export function displayInstabilityFor(oxygen: number): DisplayInstability {
	if (!isOxygenCritical(oxygen)) {
		return STABLE_DISPLAY;
	}
	return { glitchRate: glitchRateFor(oxygen), stutter: true };
}

/** `audio:heartbeat` 的內容。 */
export interface HeartbeatLevel {
	active: boolean;
	/** 0 到 1，Phaser 端換算成音量（`audio.ts` 的 `heartbeatVolume`）。 */
	intensity: number;
}

/** 心跳聲：低於 20% 開始循環，19% 強度 0（最小聲）、5% 強度 1（最大聲）；20% 以上停。 */
export function heartbeatFor(oxygen: number): HeartbeatLevel {
	if (!isOxygenCritical(oxygen)) {
		return { active: false, intensity: 0 };
	}
	return { active: true, intensity: criticalSeverity(oxygen) };
}

/** NOVA 低語的第二個時機：第六章第一次走進 NOVA 核心艙（`nv_core`，對話框立繪換成本體的同一刻）。 */
export function shouldWhisperOnRoomEnter(chapter: number, roomId: RoomId): boolean {
	return chapter === 6 && roomId === "nv_core";
}
