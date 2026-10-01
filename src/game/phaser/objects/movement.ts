/**
 * 角色移動的純邏輯：把「哪些方向鍵按著」換算成速度與面向。
 *
 * 刻意不 import Phaser，讓 Vitest 在 node 環境直接測（Phaser 一 import 就會碰 `window`）。
 */

import type { Direction } from "../constants";

/** 四個方向鍵是否按著，方向鍵與 WASD 已在呼叫端合併。 */
export interface MovementInput {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

export interface MovementResult {
	/** 水平速度（px/s），向右為正。 */
	vx: number;
	/** 垂直速度（px/s），向下為正。 */
	vy: number;
	/** 該播哪個方向的走路動畫；沒有移動時為 null。 */
	direction: Direction | null;
	moving: boolean;
}

/**
 * 依按鍵算出速度與面向。
 *
 * - 同軸相反方向同時按著時互相抵消，該軸速度為 0。
 * - 斜向移動會正規化，合速度長度等於 `speed`，不會比直走快。
 * - 面向規則：如果 `currentFacing` 仍是這一幀實際移動的方向之一就維持不變，
 *   避免「往上走時補按右鍵」造成面向突然跳到右邊；
 *   否則水平優先於垂直（斜向走時側身比背對/正對更容易看出移動方向）。
 *
 * @param input 四個方向鍵的按下狀態
 * @param speed 直線移動速度（px/s）
 * @param currentFacing 目前面向，省略時直接套用水平優先
 */
export function resolveMovement(
	input: MovementInput,
	speed: number,
	currentFacing?: Direction,
): MovementResult {
	const axisX = toAxis(input.left, input.right);
	const axisY = toAxis(input.up, input.down);

	if (axisX === 0 && axisY === 0) {
		return { vx: 0, vy: 0, direction: null, moving: false };
	}

	// 斜向時兩軸都是 ±1，長度為 √2，除掉它讓合速度等於 speed
	const length = Math.hypot(axisX, axisY);
	const vx = (axisX / length) * speed;
	const vy = (axisY / length) * speed;

	const activeDirections: Direction[] = [];
	if (axisX < 0) {
		activeDirections.push("left");
	}
	if (axisX > 0) {
		activeDirections.push("right");
	}
	if (axisY < 0) {
		activeDirections.push("up");
	}
	if (axisY > 0) {
		activeDirections.push("down");
	}

	let direction: Direction;
	if (currentFacing !== undefined && activeDirections.includes(currentFacing)) {
		direction = currentFacing;
	} else {
		// activeDirections 依水平、垂直的順序放入，第一個就是水平優先的結果
		direction = activeDirections[0];
	}

	return { vx, vy, direction, moving: true };
}

/** 把一組相反方向的按鍵換成 -1、0、1，兩個都按就抵消成 0。 */
function toAxis(negative: boolean, positive: boolean): number {
	let axis = 0;
	if (negative) {
		axis -= 1;
	}
	if (positive) {
		axis += 1;
	}
	return axis;
}
