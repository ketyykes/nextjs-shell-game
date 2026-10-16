/**
 * 低氧氣的後果（設計文件 4.25）：氧氣低於 `OXYGEN_CRITICAL_THRESHOLD`（20%）時 NOVA 斷句、心跳聲與 HUD 標示，純函式。
 *
 * 沒有失敗狀態（4.8）：氧氣最低 5%、不會歸零，這裡只決定「要不要斷句」「多大聲」。
 * 終端機輸出的文字不動（亂碼已拿掉，notes/decisions.md #150）；30% 的暗角（`OxygenVignette`）是另一條，不受影響。
 */

import { STABLE_DISPLAY, type DisplayInstability } from "@/components/terminal/novaStutter";
import type { RoomId } from "@/game/phaser/events";
import { OXYGEN_CRITICAL_THRESHOLD } from "@/game/store/selectors";
import { OXYGEN_MIN } from "@/game/store/types";

/** 最後一個還算「低」的整數百分比，嚴重度從這裡的 0 開始。 */
const CRITICAL_START = OXYGEN_CRITICAL_THRESHOLD - 1;

export function isOxygenCritical(oxygen: number): boolean {
	return oxygen < OXYGEN_CRITICAL_THRESHOLD;
}

/**
 * 低氧的嚴重度：19% 是 0、最低氧氣 5% 是 1，線性；低於 5% 也夾在 1。
 * 只在 `isOxygenCritical` 為 true 時有意義，目前只有心跳音量用它。
 */
function criticalSeverity(oxygen: number): number {
	const clamped = Math.min(CRITICAL_START, Math.max(OXYGEN_MIN, oxygen));
	return (CRITICAL_START - clamped) / (CRITICAL_START - OXYGEN_MIN);
}

/** 給 `DisplayInstabilityContext` 的值：低氧時 NOVA 斷句打開，回到 20% 以上立刻恢復。 */
export function displayInstabilityFor(oxygen: number): DisplayInstability {
	if (!isOxygenCritical(oxygen)) {
		return STABLE_DISPLAY;
	}
	return { stutter: true };
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
