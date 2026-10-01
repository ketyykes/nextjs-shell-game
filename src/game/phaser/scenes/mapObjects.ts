/**
 * Tiled 物件層 `markers` 的解析函式（契約見 `constants.ts`）。
 *
 * 輸入型別刻意定義成純資料介面，不用 `Phaser.Types.Tilemaps.TiledObject`，
 * 讓測試與其他模組不需要 Phaser 的執行環境。
 * Phaser 的 `getObjectLayer(name).objects` 會保留 Tiled 的 `properties` 陣列與 `type` 欄位，
 * 結構與這裡的 `TiledObject` 相容。
 */

import { MAP_OBJECT_TYPES } from "../constants";
import { CHAPTER_COUNT, ROOM_NAMES, type RoomId } from "../events";

/**
 * 解析 registry 的 `chapter`（registry 沒有型別保證），決定載入哪一張甲板地圖。
 * 不是 1 到 `CHAPTER_COUNT` 的整數就當第 1 章。
 */
export function parseChapter(value: unknown): number {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return 1;
	}
	if (value < 1 || value > CHAPTER_COUNT) {
		return 1;
	}
	return value;
}

// ---------------------------------------------------------------------------
// 輸入：Tiled JSON 的物件資料
// ---------------------------------------------------------------------------

export type TiledPropertyValue = string | number | boolean;

/** Tiled 物件的自訂屬性，JSON 裡是 `{ name, type, value }` 陣列。 */
export interface TiledProperty {
	name: string;
	type?: string;
	value: TiledPropertyValue;
}

/** Tiled 物件層裡的一個物件，x、y 是左上角。點物件的 width、height 為 0。 */
export interface TiledObject {
	id: number;
	name?: string;
	type?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	properties?: TiledProperty[];
}

// ---------------------------------------------------------------------------
// 輸出：解析後的標記
// ---------------------------------------------------------------------------

/** 純資料矩形，x、y 是左上角。Station 需要時再包成 `Phaser.Geom.Rectangle`。 */
export interface RectData {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SpawnPoint {
	x: number;
	y: number;
}

/** 終端機互動區，x、y 是中心點。 */
export interface TerminalMarker {
	terminalId: string;
	title: string;
	roomId: RoomId;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** 艙區範圍，rect 是左上角加寬高。 */
export interface RoomMarker {
	roomId: RoomId;
	rect: RectData;
}

/** 門的位置，x、y 是中心點。 */
export interface DoorMarker {
	doorId: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface MapMarkers {
	spawnPoint: SpawnPoint;
	terminals: TerminalMarker[];
	rooms: RoomMarker[];
	doors: DoorMarker[];
}

// ---------------------------------------------------------------------------
// 工具函式
// ---------------------------------------------------------------------------

/** 產生錯誤訊息用的物件描述，例如 `物件 #3（type=terminal, name=t1）`。 */
function describeObject(obj: TiledObject): string {
	const typeText = obj.type ?? "(無 type)";
	const nameText = obj.name ? `, name=${obj.name}` : "";
	return `物件 #${obj.id}（type=${typeText}${nameText}）`;
}

/** 從 Tiled 物件的 `properties` 陣列取值，找不到就丟出明確的 Error。 */
export function readProperty(obj: TiledObject, name: string): TiledPropertyValue {
	const property = obj.properties?.find((item) => item.name === name);
	if (!property) {
		throw new Error(`[mapObjects] ${describeObject(obj)} 缺少 property「${name}」`);
	}
	return property.value;
}

/** 讀字串屬性，值不是非空字串時丟錯。 */
export function readStringProperty(obj: TiledObject, name: string): string {
	const value = readProperty(obj, name);
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`[mapObjects] ${describeObject(obj)} 的 property「${name}」必須是非空字串，實際為 ${JSON.stringify(value)}`);
	}
	return value;
}

function isRoomId(value: string): value is RoomId {
	return Object.prototype.hasOwnProperty.call(ROOM_NAMES, value);
}

/** 讀 `roomId` 屬性並確認是已知的艙區 id。 */
export function readRoomIdProperty(obj: TiledObject): RoomId {
	const value = readStringProperty(obj, "roomId");
	if (!isRoomId(value)) {
		throw new Error(`[mapObjects] ${describeObject(obj)} 的 roomId「${value}」不是已知的艙區 id`);
	}
	return value;
}

/** 取物件的左上角與寬高，缺值當 0（點物件）。 */
export function toRect(obj: TiledObject): RectData {
	return {
		x: obj.x ?? 0,
		y: obj.y ?? 0,
		width: obj.width ?? 0,
		height: obj.height ?? 0,
	};
}

/** Tiled 的 x、y 是左上角，換算成中心點。 */
export function toCenter(obj: TiledObject): { x: number; y: number } {
	const rect = toRect(obj);
	return {
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
	};
}

// ---------------------------------------------------------------------------
// 個別物件解析
// ---------------------------------------------------------------------------

export function parseTerminal(obj: TiledObject): TerminalMarker {
	const rect = toRect(obj);
	const center = toCenter(obj);
	return {
		terminalId: readStringProperty(obj, "terminalId"),
		title: readStringProperty(obj, "title"),
		roomId: readRoomIdProperty(obj),
		x: center.x,
		y: center.y,
		width: rect.width,
		height: rect.height,
	};
}

export function parseRoom(obj: TiledObject): RoomMarker {
	return {
		roomId: readRoomIdProperty(obj),
		rect: toRect(obj),
	};
}

export function parseDoor(obj: TiledObject): DoorMarker {
	const rect = toRect(obj);
	const center = toCenter(obj);
	return {
		doorId: readStringProperty(obj, "doorId"),
		x: center.x,
		y: center.y,
		width: rect.width,
		height: rect.height,
	};
}

/** 出生點取中心；點物件的寬高是 0，中心就是原座標。 */
export function parseSpawn(obj: TiledObject): SpawnPoint {
	return toCenter(obj);
}

// ---------------------------------------------------------------------------
// 整層解析
// ---------------------------------------------------------------------------

/**
 * 解析整個 `markers` 物件層。
 *
 * - 未知 type 的物件直接忽略，方便之後在地圖上加註記用的物件。
 * - 出生點必須剛好一個，否則丟錯。
 * - 任何已知 type 的物件缺必要 property 都會丟錯，錯誤訊息帶物件 id。
 */
export function parseMapMarkers(objects: readonly TiledObject[]): MapMarkers {
	const spawnPoints: SpawnPoint[] = [];
	const terminals: TerminalMarker[] = [];
	const rooms: RoomMarker[] = [];
	const doors: DoorMarker[] = [];

	for (const obj of objects) {
		switch (obj.type) {
			case MAP_OBJECT_TYPES.spawn:
				spawnPoints.push(parseSpawn(obj));
				break;
			case MAP_OBJECT_TYPES.terminal:
				terminals.push(parseTerminal(obj));
				break;
			case MAP_OBJECT_TYPES.room:
				rooms.push(parseRoom(obj));
				break;
			case MAP_OBJECT_TYPES.door:
				doors.push(parseDoor(obj));
				break;
			default:
				// 未知 type：忽略
				break;
		}
	}

	if (spawnPoints.length === 0) {
		throw new Error(`[mapObjects] 物件層找不到 type=${MAP_OBJECT_TYPES.spawn} 的出生點`);
	}
	if (spawnPoints.length > 1) {
		throw new Error(`[mapObjects] 物件層有 ${spawnPoints.length} 個出生點，只能有一個`);
	}

	return {
		spawnPoint: spawnPoints[0],
		terminals,
		rooms,
		doors,
	};
}
