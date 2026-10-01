/**
 * 過關演出用的純函式（M4-3）：亮燈順序、人影閃現位置、主艙門格座標；
 * 以及環境反應階梯「燈閃一下」的播法判斷與時間切分（M5-4）。
 *
 * 刻意不 import Phaser，讓 Vitest 在 node 環境直接測。
 * Station 場景把地圖資料傳進來，拿算好的結果去驅動 LightMask、ShadowFigure 與 tile 圖層。
 */

import { TILE_SIZE } from "../constants";
import type { RoomId } from "../events";
import type { DoorMarker, RectData } from "../scenes/mapObjects";

/**
 * 第一章配電箱過關後的亮燈順序：從配電室出發，依地圖上離配電室的距離由近到遠。
 *
 * deck1 的配置（設計文件第 9 節）：配電室在右上，下方接主走廊；
 * 醫療艙、宿舍沿上排往左；主艙門在走廊右端；維生艙、冷凍艙在下排，離配電室最遠。
 * 冷凍艙排最後，讓「醒來的地方」最後才亮。
 */
export const POWER_ON_ORDER: readonly RoomId[] = [
	"power",
	"corridor",
	"medbay",
	"quarters",
	"airlock",
	"lifesupport",
	"cryo",
];

/** 人影離走廊端點往內縮的距離（px），避免貼在牆上被牆的 tile 擋住輪廓。 */
export const SHADOW_INSET = 48;

/**
 * 依固定的距離順序排出亮燈順序。
 *
 * - `from` 一定排第一個（就算它不在 `POWER_ON_ORDER` 的開頭）。
 * - 只回傳 `rooms` 裡有的艙區，地圖上不存在的跳過。
 * - `rooms` 裡有、但順序表沒列到的艙區（之後章節新增的），依輸入順序接在最後，不會被吃掉。
 * - 重複的 id 只保留一次。
 */
export function powerOnOrder(rooms: readonly RoomId[], from: RoomId): RoomId[] {
	const available = new Set(rooms);
	const result: RoomId[] = [];

	if (available.has(from)) {
		result.push(from);
	}

	for (const roomId of POWER_ON_ORDER) {
		if (available.has(roomId) && !result.includes(roomId)) {
			result.push(roomId);
		}
	}

	for (const roomId of rooms) {
		if (!result.includes(roomId)) {
			result.push(roomId);
		}
	}

	return result;
}

/**
 * 走廊「盡頭」的人影位置：取離玩家較遠的那一端。
 *
 * 玩家在走廊中線左側（含剛好在中線）就取右端，反之取左端；x 往內縮 `SHADOW_INSET`，y 取走廊垂直中心。
 */
export function shadowFlashPosition(
	corridor: RectData,
	playerX: number,
	maxDistance?: number,
): { x: number; y: number } {
	const centerX = corridor.x + corridor.width / 2;
	const centerY = corridor.y + corridor.height / 2;

	let x: number;
	if (playerX <= centerX) {
		x = corridor.x + corridor.width - SHADOW_INSET;
	} else {
		x = corridor.x + SHADOW_INSET;
	}

	// 鏡頭放大兩倍只看得到 15 格寬，走廊真正的盡頭常常在視野外；
	// 給 maxDistance 時把人影夾在玩家兩側這個距離內，「走廊盡頭」變成「視野的盡頭」，玩家才看得到那一幀
	if (maxDistance !== undefined) {
		const nearest = Math.max(playerX - maxDistance, Math.min(playerX + maxDistance, x));
		x = Math.max(corridor.x + SHADOW_INSET, Math.min(corridor.x + corridor.width - SHADOW_INSET, nearest));
	}

	return { x, y: centerY };
}

/** 門標記的像素座標（中心點）換算成 tile 格座標。 */
export function airlockTilePosition(door: Pick<DoorMarker, "x" | "y">): { tileX: number; tileY: number } {
	return {
		tileX: Math.floor(door.x / TILE_SIZE),
		tileY: Math.floor(door.y / TILE_SIZE),
	};
}

// ---------------------------------------------------------------------------
// 環境反應階梯：燈閃一下（M5-4）
// ---------------------------------------------------------------------------

/** 一次「燈閃一下」裡暗下去的次數。 */
export const FLICKER_PULSES = 3;

/** 每一段（暗下去或亮回來）最短的毫秒數，避免 durationMs 太小時 tween 長度變 0。 */
const FLICKER_MIN_LEG_MS = 16;

/**
 * 燈閃怎麼播：
 * - `skip`：亮燈序列或通電淡出進行中，或已經在閃，不打擾。
 * - `mask`：還在斷電，遮罩整層再暗到全黑幾次。
 * - `camera`：已通電、遮罩隱藏，改用鏡頭黑色 flash 做暗一下。
 */
export type FlickerMode = "skip" | "mask" | "camera";

export interface FlickerConditions {
	/** `powerOnSequence` 進行中（艙區一間間亮起）。 */
	sequenceRunning: boolean;
	/** 已呼叫 `setPowered(true)`。 */
	isPowered: boolean;
	/** 通電淡出完成、遮罩已隱藏。 */
	isFullyLit: boolean;
	/** 上一次燈閃還沒結束。 */
	isFlickering: boolean;
}

/** 依燈光遮罩目前的狀態決定燈閃的播法。 */
export function flickerMode(conditions: FlickerConditions): FlickerMode {
	if (conditions.sequenceRunning || conditions.isFlickering) {
		return "skip";
	}
	if (conditions.isFullyLit) {
		return "camera";
	}
	// 已通電但還在淡出：不要跟淡出的 tween 搶遮罩
	if (conditions.isPowered) {
		return "skip";
	}
	return "mask";
}

/**
 * yoyo tween 單段（暗下去或亮回來）的毫秒數：總長 `durationMs` 平均分給 `pulses` 次暗下去再亮回來。
 * Phaser tween 的 duration 是單段長度，yoyo 加 repeat 後總長是 `duration × 2 × pulses`。
 */
export function flickerLegDuration(durationMs: number, pulses = FLICKER_PULSES): number {
	const safePulses = Math.max(1, Math.trunc(pulses));
	return Math.max(FLICKER_MIN_LEG_MS, Math.round(durationMs / (safePulses * 2)));
}
