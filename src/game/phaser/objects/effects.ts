/**
 * 過關演出用的純函式（M4-3）：亮燈順序、人影閃現位置、主艙門格座標；
 * 環境反應階梯「燈閃一下」的播法判斷與時間切分（M5-4）；
 * 以及六個甲板共用的過關演出對照表解析與重整還原的最終狀態計算。
 *
 * 刻意不 import Phaser，讓 Vitest 在 node 環境直接測。
 * Station 場景把地圖資料傳進來，拿算好的結果去驅動 LightMask、ShadowFigure 與 tile 圖層。
 */

import { TILE_SIZE } from "../constants";
import { DECK_ROOMS, type RoomId, type RoomSlot, type SolvedEffect } from "../events";
import type { DoorMarker, RectData } from "../scenes/mapObjects";

/**
 * 亮燈順序（以平面圖位置表示）：從上排右（第一章的配電室）出發，依地圖上的距離由近到遠。
 *
 * 六個甲板共用同一張平面圖（設計文件第 9 節）：上排右下方接走廊；
 * 上排中、上排左沿上排往左；出口在走廊右端；下排中、下排左離上排右最遠。
 * 下排左（出生房）排最後，讓「醒來的地方」最後才亮。
 */
export const POWER_ON_SLOT_ORDER: readonly RoomSlot[] = [
	"fourth",
	"corridor",
	"fifth",
	"third",
	"exit",
	"second",
	"start",
];

/** 第一章的亮燈順序：配電室、主走廊、醫療艙、宿舍、主艙門、維生艙、冷凍艙。 */
export const POWER_ON_ORDER: readonly RoomId[] = POWER_ON_SLOT_ORDER.map((slot) => DECK_ROOMS[1][slot]);

/** 艙區 id → 平面圖位置，從 `DECK_ROOMS` 反查（六個甲板的 id 不重複）。 */
const SLOT_BY_ROOM_ID: ReadonlyMap<RoomId, RoomSlot> = buildSlotLookup();

function buildSlotLookup(): Map<RoomId, RoomSlot> {
	const lookup = new Map<RoomId, RoomSlot>();
	for (const slots of Object.values(DECK_ROOMS)) {
		for (const [slot, roomId] of Object.entries(slots) as [RoomSlot, RoomId][]) {
			lookup.set(roomId, slot);
		}
	}
	return lookup;
}

/** 艙區在亮燈順序裡的名次，查不到位置的排到最後（`Infinity`）。 */
function powerOnRank(roomId: RoomId): number {
	const slot = SLOT_BY_ROOM_ID.get(roomId);
	if (slot === undefined) {
		return Number.POSITIVE_INFINITY;
	}
	return POWER_ON_SLOT_ORDER.indexOf(slot);
}

/** 人影離走廊端點往內縮的距離（px），避免貼在牆上被牆的 tile 擋住輪廓。 */
export const SHADOW_INSET = 48;

/**
 * 依平面圖位置的固定距離順序排出亮燈順序，六個甲板通用。
 *
 * - `from` 一定排第一個（就算它不在 `POWER_ON_SLOT_ORDER` 的開頭）。
 * - 只回傳 `rooms` 裡有的艙區，地圖上不存在的跳過。
 * - 查不到平面圖位置的艙區（不在 `DECK_ROOMS` 裡），依輸入順序接在最後，不會被吃掉。
 * - 重複的 id 只保留一次。
 */
export function powerOnOrder(rooms: readonly RoomId[], from: RoomId): RoomId[] {
	const unique: RoomId[] = [];
	for (const roomId of rooms) {
		if (!unique.includes(roomId)) {
			unique.push(roomId);
		}
	}

	const result: RoomId[] = [];
	if (unique.includes(from)) {
		result.push(from);
	}

	// Array.prototype.sort 是穩定排序，同名次（都查不到位置）的保留輸入順序
	const rest = unique.filter((roomId) => roomId !== from);
	rest.sort((a, b) => {
		const rankA = powerOnRank(a);
		const rankB = powerOnRank(b);
		if (rankA === rankB) {
			return 0;
		}
		if (rankA < rankB) {
			return -1;
		}
		return 1;
	});
	result.push(...rest);

	return result;
}

/** 找出走廊艙區：第一章叫 `corridor`，其他甲板是 `<前綴>_corridor`。找不到回傳 undefined。 */
export function findCorridorRoomId(rooms: readonly RoomId[]): RoomId | undefined {
	return rooms.find((roomId) => roomId === "corridor" || roomId.endsWith("_corridor"));
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

// ---------------------------------------------------------------------------
// 過關演出對照表（registry 的 `terminalEffects`）與重整還原
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 單一演出的格式檢查，合法就回傳只含必要欄位的新物件，不合法回傳 null。 */
function parseSolvedEffect(value: unknown): SolvedEffect | null {
	if (!isPlainObject(value)) {
		return null;
	}
	switch (value.kind) {
		case "powerRestored":
			return { kind: "powerRestored" };
		case "shadowFlash":
			return { kind: "shadowFlash" };
		case "flicker":
			return { kind: "flicker" };
		case "blackout":
			return { kind: "blackout" };
		case "openDoor":
			if (typeof value.doorId !== "string" || value.doorId.length === 0) {
				return null;
			}
			return { kind: "openDoor", doorId: value.doorId };
		default:
			return null;
	}
}

/**
 * 解析 registry 的 `terminalEffects`（registry 沒有型別保證）。
 * 不是物件就當空表；格式不對的項目直接丟掉，其餘拷貝一份回傳。
 */
export function parseTerminalEffects(value: unknown): Record<string, SolvedEffect> {
	const result: Record<string, SolvedEffect> = {};
	if (!isPlainObject(value)) {
		return result;
	}
	for (const [terminalId, raw] of Object.entries(value)) {
		const effect = parseSolvedEffect(raw);
		if (effect === null) {
			continue;
		}
		result[terminalId] = effect;
	}
	return result;
}

/**
 * 重整還原後的最終狀態：
 * - `power`：`on` 全亮、`off` 全黑、`unchanged` 維持開場狀態（`startDark` 決定）。
 * - `openDoorIds`：要直接打開的鎖門 doorId（不重複）。
 */
export interface SolvedState {
	power: "on" | "off" | "unchanged";
	openDoorIds: string[];
}

/**
 * 依已過關清單的順序套演出，算出重整後應該呈現的最終狀態（不播動畫）。
 *
 * - `powerRestored`：全亮。
 * - `openDoor`：開門加全亮（門開了代表電早就恢復，存檔若漏了供電那台也不要讓玩家摸黑）。
 * - `blackout`：全黑。和上面兩種誰在清單後面誰說了算。
 * - `shadowFlash`、`flicker` 與沒宣告演出的終端機：只是一次性演出，不影響最終狀態。
 */
export function resolveSolvedState(
	solvedTerminalIds: readonly string[],
	terminalEffects: Readonly<Record<string, SolvedEffect>>,
): SolvedState {
	let power: SolvedState["power"] = "unchanged";
	const openDoorIds: string[] = [];

	for (const terminalId of solvedTerminalIds) {
		if (!Object.prototype.hasOwnProperty.call(terminalEffects, terminalId)) {
			continue;
		}
		const effect = terminalEffects[terminalId];
		switch (effect.kind) {
			case "powerRestored":
				power = "on";
				break;
			case "openDoor":
				power = "on";
				if (!openDoorIds.includes(effect.doorId)) {
					openDoorIds.push(effect.doorId);
				}
				break;
			case "blackout":
				power = "off";
				break;
			default:
				break;
		}
	}

	return { power, openDoorIds };
}

/** 過關演出在光敏安全設定下的播法，Station 依它決定各個視覺要不要播。 */
export interface EffectSafety {
	/** `flash`：人影閃一幀（約 120ms）；`fade`：慢慢浮現再淡出，劇情點保留但不閃。 */
	shadowStyle: "flash" | "fade";
	/** 人影出現時的鏡頭微震。 */
	cameraShake: boolean;
	/** 開門時鏡頭閃全息藍。 */
	cameraFlash: boolean;
	/** 燈閃（`flicker` 過關演出與環境反應階梯的 `ambient:flicker`）。 */
	lightFlicker: boolean;
}

/**
 * 設定的「關閉閃爍」是光敏體質玩家的安全項（設計文件 4.7），關掉時 Phaser 裡所有快速明暗變化與震動都要停：
 * 人影改成淡入淡出、鏡頭不震不閃、燈不閃。亮燈序列與斷電是緩慢淡變，不受影響。
 */
export function effectSafety(flickerEnabled: boolean): EffectSafety {
	if (flickerEnabled) {
		return { shadowStyle: "flash", cameraShake: true, cameraFlash: true, lightFlicker: true };
	}
	return { shadowStyle: "fade", cameraShake: false, cameraFlash: false, lightFlicker: false };
}
