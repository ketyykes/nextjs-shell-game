/**
 * 「靠近終端機」的純計算，不依賴 Phaser，方便單元測試。
 */

import type { TerminalMarker } from "../scenes/mapObjects";

/**
 * 找出距離玩家最近、且在互動半徑內的終端機。
 *
 * - 距離剛好等於 `radius` 算在內（`<=`）。
 * - 多台距離完全相同時取陣列中較前面的那台。
 * - 沒有任何終端機在範圍內（或陣列為空）回傳 `null`。
 */
export function findNearestTerminal(
	x: number,
	y: number,
	terminals: readonly TerminalMarker[],
	radius: number,
): TerminalMarker | null {
	let nearest: TerminalMarker | null = null;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const terminal of terminals) {
		const distance = Math.hypot(x - terminal.x, y - terminal.y);
		if (distance > radius) {
			continue;
		}
		if (distance < nearestDistance) {
			nearest = terminal;
			nearestDistance = distance;
		}
	}

	return nearest;
}
