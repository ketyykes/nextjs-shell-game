/**
 * 「靠近終端機」與「靠近便條」的純計算，不依賴 Phaser，方便單元測試。
 */

import type { NoteMarker, TerminalMarker } from "../scenes/mapObjects";

/** 有中心點的標記（終端機、便條）。 */
interface PointMarker {
	x: number;
	y: number;
}

/**
 * 找出距離玩家最近、且在互動半徑內的標記。
 *
 * - 距離剛好等於 `radius` 算在內（`<=`）。
 * - 多個距離完全相同時取陣列中較前面的那個。
 * - 沒有任何標記在範圍內（或陣列為空）回傳 `null`。
 */
function findNearestMarker<T extends PointMarker>(x: number, y: number, markers: readonly T[], radius: number): T | null {
	let nearest: T | null = null;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const marker of markers) {
		const distance = Math.hypot(x - marker.x, y - marker.y);
		if (distance > radius) {
			continue;
		}
		if (distance < nearestDistance) {
			nearest = marker;
			nearestDistance = distance;
		}
	}

	return nearest;
}

/** 找出距離玩家最近、且在互動半徑內的終端機，規則見 `findNearestMarker`。 */
export function findNearestTerminal(
	x: number,
	y: number,
	terminals: readonly TerminalMarker[],
	radius: number,
): TerminalMarker | null {
	return findNearestMarker(x, y, terminals, radius);
}

/**
 * 找出距離玩家最近、且在互動半徑內的便條（設計文件 4.19）。
 * 同時靠近終端機（`terminalNearby`）時一律回 `null`：終端機優先，按 E 不會兩個一起開。
 * 地圖產生時已經讓兩者至少隔 3 格，這裡是第二道保險。
 */
export function findNearestNote(
	x: number,
	y: number,
	notes: readonly NoteMarker[],
	radius: number,
	terminalNearby: boolean,
): NoteMarker | null {
	if (terminalNearby) {
		return null;
	}
	return findNearestMarker(x, y, notes, radius);
}
