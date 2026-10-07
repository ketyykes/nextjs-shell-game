/**
 * 角色位置的存檔與還原（存檔 v2，推翻決策 #15）。
 *
 * 刻意不 import Phaser，方便單元測試：Station 每幀把角色座標與目前艙區餵給 `PositionReporter`，
 * 角色走動後停下時發 `player:stopped`，React 端存進 store；重開時 Station 用 `resolveSpawnPoint`
 * 決定從存的位置還是地圖出生點出生。
 */

import { emitGameEvent } from "../EventBus";
import type { RoomId } from "../events";

export interface Point {
	x: number;
	y: number;
}

/** 偵測「走動後停下」的那一幀，停在艙區內才發 `player:stopped`。 */
export class PositionReporter {
	private previous: Point | null = null;
	private moving = false;
	private lastReported: Point | null = null;

	update(x: number, y: number, roomId: RoomId | null): void {
		const previous = this.previous;
		this.previous = { x, y };
		if (previous === null) {
			return;
		}

		if (previous.x !== x || previous.y !== y) {
			this.moving = true;
			return;
		}

		if (!this.moving) {
			return;
		}
		this.moving = false;

		// 停在門框這種不屬於任何艙區的格子上時不存，下次停在艙區內再存
		if (roomId === null) {
			return;
		}

		const rounded = { x: Math.round(x), y: Math.round(y) };
		if (this.lastReported !== null && this.lastReported.x === rounded.x && this.lastReported.y === rounded.y) {
			return;
		}
		this.lastReported = rounded;
		emitGameEvent("player:stopped", { ...rounded, roomId });
	}

	/**
	 * 立刻回報目前位置，不等「連續兩幀同座標」的停止偵測。
	 * 開終端機會暫停場景、update 不再跑，走到終端機旁立刻按 E 的那段路就存不到；
	 * 場景暫停前呼叫這裡，重新整理後角色才會從終端機旁出發。
	 */
	flush(x: number, y: number, roomId: RoomId | null): void {
		this.moving = false;
		this.previous = { x, y };
		if (roomId === null) {
			return;
		}
		const rounded = { x: Math.round(x), y: Math.round(y) };
		if (this.lastReported !== null && this.lastReported.x === rounded.x && this.lastReported.y === rounded.y) {
			return;
		}
		this.lastReported = rounded;
		emitGameEvent("player:stopped", { ...rounded, roomId });
	}
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * 存的位置（registry 讀出來，沒有型別保證）合法且在地圖範圍內就用它，否則用地圖出生點。
 * 右、下邊界不算在地圖內。
 */
export function resolveSpawnPoint(saved: unknown, fallback: Point, bounds: { width: number; height: number }): Point {
	if (typeof saved !== "object" || saved === null) {
		return fallback;
	}

	const { x, y } = saved as Record<string, unknown>;
	if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
		return fallback;
	}
	if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
		return fallback;
	}

	return { x, y };
}
