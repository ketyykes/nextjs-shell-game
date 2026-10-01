#!/usr/bin/env node
/**
 * 產生第一章的 Tiled 地圖 `public/maps/deck1.json`（Tiled 1.10 相容），給 Phaser 的 Station 場景讀。
 *
 * 配置依設計文件第 9 節：上排宿舍（T3）、醫療艙（T5）、配電室（T4），
 * 中間橫向主走廊，右端是主艙門區（T6），下排冷凍艙（T1，起點）與維生艙（T2）。
 * 命名契約（圖層名、物件 type、tileset name）見 `src/game/phaser/constants.ts`，這裡用字面值對照。
 *
 * 產生方式：
 *   1. 把每個房間的內部範圍與門的通道標成「可走格」。
 *   2. 可走格依上下左右是否可走自動挑地板邊框（藍色或紅色警示條），轉角缺口另外挑。
 *   3. 不可走格全部進 `walls` 層：正上方是可走格的放牆面，牆面上方放牆頂，其餘放深色虛空。
 *   4. 終端機控制台嵌在房間上緣的牆面那一列（`objects` 層），互動區是它正下方那一格。
 *   5. 主艙門放 `objects` 層並在 `collision` 層同一格加阻擋；房間門不碰撞，畫在 `floor` 層。
 *   6. 從出生點做 BFS，確認六台終端機都走得到。
 *
 * 用法：
 *   pnpm map:build
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {"cryo" | "lifesupport" | "quarters" | "medbay" | "power" | "corridor" | "airlock"} RoomId
 * @typedef {"blue" | "red"} FramePalette
 * @typedef {{ x: number, y: number }} TilePoint
 * @typedef {{ x: number, y: number, width: number, height: number }} TileRect
 * @typedef {{ name: string, terminalId: string, title: string, x: number, y: number, consoleTile: number }} TerminalSpec
 *   x、y 是控制台本體的格座標（房間上緣牆面那一列），互動區是 (x, y + 1)。
 * @typedef {{ x: number, y: number, passage: TileRect }} DoorSpec
 *   x、y 是門片（tile 2）的格座標，passage 是門所在通道要挖開的可走範圍。
 * @typedef {TileRect & { id: RoomId, name: string, palette: FramePalette, door: DoorSpec | null, terminal: TerminalSpec | null }} RoomSpec
 *   x、y、width、height 是房間內部可走範圍（不含牆）。
 * @typedef {{ doorId: string, roomId: RoomId, x: number, y: number }} LockedDoorSpec
 * @typedef {{
 *   width: number,
 *   height: number,
 *   tileSize: number,
 *   spawnRoomId: RoomId,
 *   rooms: RoomSpec[],
 *   lockedDoor: LockedDoorSpec,
 *   vents: TilePoint[],
 * }} MapLayout
 *
 * @typedef {{ name: string, type: string, value: string }} TiledProperty
 * @typedef {{
 *   id: number,
 *   name: string,
 *   type: string,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   rotation: number,
 *   visible: boolean,
 *   point?: boolean,
 *   properties?: TiledProperty[],
 * }} TiledObject
 * @typedef {{
 *   id: number,
 *   name: string,
 *   type: "tilelayer",
 *   width: number,
 *   height: number,
 *   x: number,
 *   y: number,
 *   visible: boolean,
 *   opacity: number,
 *   data: number[],
 * }} TiledTileLayer
 * @typedef {{
 *   id: number,
 *   name: string,
 *   type: "objectgroup",
 *   draworder: "topdown",
 *   x: number,
 *   y: number,
 *   visible: boolean,
 *   opacity: number,
 *   objects: TiledObject[],
 * }} TiledObjectLayer
 * @typedef {{
 *   firstgid: number,
 *   name: string,
 *   image: string,
 *   imagewidth: number,
 *   imageheight: number,
 *   tilewidth: number,
 *   tileheight: number,
 *   tilecount: number,
 *   columns: number,
 *   margin: number,
 *   spacing: number,
 * }} TiledTileset
 * @typedef {{
 *   type: "map",
 *   version: string,
 *   tiledversion: string,
 *   orientation: "orthogonal",
 *   renderorder: "right-down",
 *   width: number,
 *   height: number,
 *   tilewidth: number,
 *   tileheight: number,
 *   infinite: boolean,
 *   nextlayerid: number,
 *   nextobjectid: number,
 *   tilesets: TiledTileset[],
 *   layers: (TiledTileLayer | TiledObjectLayer)[],
 * }} TiledMap
 * @typedef {{ ok: boolean, unreachable: string[] }} ConnectivityResult
 */

/** @type {string} */
const ROOT = path.resolve(import.meta.dirname, "..");
/** @type {string} */
const OUT_PATH = path.join(ROOT, "public", "maps", "deck1.json");

// ---------------------------------------------------------------------------
// tileset 與 tile 編號（0 起算的格子編號，寫進 data 時要加 FIRST_GID）
// ---------------------------------------------------------------------------

/** @type {number} */
export const FIRST_GID = 1;

/** @type {TiledTileset} */
const TILESET = {
	firstgid: FIRST_GID,
	name: "scifi",
	image: "../tiles/tileset-buch-scifi.png",
	imagewidth: 448,
	imageheight: 192,
	tilewidth: 32,
	tileheight: 32,
	tilecount: 84,
	columns: 14,
	margin: 0,
	spacing: 0,
};

/** 固定用途的格子編號 @type {Record<string, number>} */
export const TILES = {
	/** 素面淡藍地板 */
	floor: 20,
	/** 通風格地板，零星點綴走廊 */
	vent: 62,
	/** 藍色地板門片，房間門（斷電時全開，不碰撞） */
	roomDoor: 2,
	/** 紅色地板門片，主艙門（鎖住，碰撞） */
	lockedDoor: 72,
	/** 牆面下半（紫色踢腳），放在可走格正上方 */
	wallFace: 42,
	/** 牆頂（上半深色、下半灰牆），放在牆面正上方，和牆面疊成有立體感的上緣 */
	wallTop: 29,
	/** 深色虛空，其餘所有不可走格 */
	void: 17,
	/** 完全透明的格子，當 collision 層的阻擋標記 */
	collisionMarker: 83,
};

/**
 * 地板邊框對照表。key 是 `邊|缺口`：
 * - 邊：上下左右哪一側不可走，依 T、B、L、R 順序串接，例如 `TL` 是上與左。
 * - 缺口：兩側都可走但斜角不可走的轉角，依 tl、tr、bl、br 順序以逗號串接。
 * 查不到完整組合時退回只看邊，再退回素面地板。
 * @type {Record<FramePalette, Record<string, number>>}
 */
const FRAME_TILES = {
	blue: {
		"|": 20,
		"T|": 6,
		"B|": 34,
		"L|": 19,
		"R|": 21,
		"TL|": 5,
		"TR|": 7,
		"BL|": 33,
		"BR|": 35,
		"TB|": 32,
		"LR|": 18,
		"TBLR|": 4,
		"|br": 8,
		"|bl": 9,
		"|tr": 22,
		"|tl": 23,
		"|bl,br": 36,
		"|tl,bl": 37,
		"|tl,tr": 38,
		"|tr,br": 39,
		"T|bl,br": 12,
		"R|bl": 13,
		"L|tr,br": 26,
		"B|tl,tr": 27,
		"TL|br": 10,
		"TR|bl": 11,
		"BL|tr": 24,
		"BR|tl": 25,
	},
	red: {
		"|": 20,
		"T|": 48,
		"B|": 76,
		"L|": 61,
		"R|": 63,
		"TL|": 47,
		"TR|": 49,
		"BL|": 75,
		"BR|": 77,
		"TB|": 74,
		"LR|": 60,
		"TBLR|": 46,
		"|br": 50,
		"|bl": 51,
		"|tr": 64,
		"|tl": 65,
		"|bl,br": 78,
		"|tl,bl": 79,
		"|tl,tr": 80,
		"|tr,br": 81,
		"T|bl,br": 40,
		"R|bl": 41,
		"L|tr,br": 54,
		"B|tl,tr": 55,
		"TL|br": 52,
		"TR|bl": 53,
		"BL|tr": 66,
		"BR|tl": 67,
	},
};

// ---------------------------------------------------------------------------
// 第一章配置（設計文件第 9 節）。所有座標都是格座標，房間範圍是內部可走區。
// ---------------------------------------------------------------------------

/** @type {MapLayout} */
export const DEFAULT_LAYOUT = {
	width: 40,
	height: 24,
	tileSize: 32,
	spawnRoomId: "cryo",
	rooms: [
		{
			id: "quarters",
			name: "宿舍",
			x: 2,
			y: 2,
			width: 9,
			height: 6,
			palette: "blue",
			door: { x: 6, y: 8, passage: { x: 6, y: 8, width: 1, height: 2 } },
			terminal: { name: "T3", terminalId: "ch1-t3", title: "宿舍終端機", x: 4, y: 1, consoleTile: 43 },
		},
		{
			id: "medbay",
			name: "醫療艙",
			x: 14,
			y: 2,
			width: 9,
			height: 6,
			palette: "blue",
			door: { x: 18, y: 8, passage: { x: 18, y: 8, width: 1, height: 2 } },
			terminal: { name: "T5", terminalId: "ch1-t5", title: "醫療艙終端機", x: 20, y: 1, consoleTile: 44 },
		},
		{
			id: "power",
			name: "配電室",
			x: 26,
			y: 2,
			width: 9,
			height: 6,
			palette: "red",
			door: { x: 30, y: 8, passage: { x: 30, y: 8, width: 1, height: 2 } },
			terminal: { name: "T4", terminalId: "ch1-t4", title: "配電箱", x: 32, y: 1, consoleTile: 43 },
		},
		{
			id: "corridor",
			name: "主走廊",
			x: 2,
			y: 10,
			width: 33,
			height: 3,
			palette: "blue",
			door: null,
			terminal: null,
		},
		{
			id: "airlock",
			name: "主艙門",
			x: 35,
			y: 9,
			width: 4,
			height: 5,
			palette: "red",
			door: null,
			terminal: { name: "T6", terminalId: "ch1-t6", title: "艙門控制台", x: 37, y: 8, consoleTile: 44 },
		},
		{
			id: "cryo",
			name: "冷凍艙",
			x: 2,
			y: 15,
			width: 10,
			height: 7,
			palette: "blue",
			door: { x: 6, y: 14, passage: { x: 6, y: 13, width: 1, height: 2 } },
			terminal: { name: "T1", terminalId: "ch1-t1", title: "冷凍艙控制台", x: 4, y: 14, consoleTile: 44 },
		},
		{
			id: "lifesupport",
			name: "維生艙",
			x: 14,
			y: 15,
			width: 10,
			height: 7,
			palette: "blue",
			door: { x: 18, y: 14, passage: { x: 18, y: 13, width: 1, height: 2 } },
			terminal: { name: "T2", terminalId: "ch1-t2", title: "維生系統監控台", x: 21, y: 14, consoleTile: 43 },
		},
	],
	/** 主艙門在主艙門區右牆，通往 deck2，T4 過關前鎖住。 */
	lockedDoor: { doorId: "airlock", roomId: "airlock", x: 39, y: 11 },
	/** 走廊中線的通風格 */
	vents: [
		{ x: 10, y: 11 },
		{ x: 14, y: 11 },
		{ x: 24, y: 11 },
		{ x: 33, y: 11 },
	],
};

// ---------------------------------------------------------------------------
// 格子工具
// ---------------------------------------------------------------------------

/** @type {(x: number, y: number, width: number) => number} */
const toIndex = (x, y, width) => y * width + x;

/** @type {(rect: TileRect, x: number, y: number) => boolean} */
const rectContains = (rect, x, y) =>
	x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;

/** @type {(tileIndex: number) => number} */
const toGid = (tileIndex) => tileIndex + FIRST_GID;

/**
 * 依四周是否可走挑地板邊框格。
 * @type {(isOpen: (x: number, y: number) => boolean, x: number, y: number, palette: FramePalette) => number}
 */
const pickFrameTile = (isOpen, x, y, palette) => {
	const top = isOpen(x, y - 1);
	const bottom = isOpen(x, y + 1);
	const left = isOpen(x - 1, y);
	const right = isOpen(x + 1, y);

	let edges = "";
	if (!top) edges += "T";
	if (!bottom) edges += "B";
	if (!left) edges += "L";
	if (!right) edges += "R";

	/** @type {string[]} */
	const notches = [];
	if (top && left && !isOpen(x - 1, y - 1)) notches.push("tl");
	if (top && right && !isOpen(x + 1, y - 1)) notches.push("tr");
	if (bottom && left && !isOpen(x - 1, y + 1)) notches.push("bl");
	if (bottom && right && !isOpen(x + 1, y + 1)) notches.push("br");

	const table = FRAME_TILES[palette];
	const exactKey = `${edges}|${notches.join(",")}`;
	if (exactKey in table) return table[exactKey];
	const edgeOnlyKey = `${edges}|`;
	if (edgeOnlyKey in table) return table[edgeOnlyKey];
	return TILES.floor;
};

/**
 * 找出 terminal 名稱對應的 terminal 規格與所在房間，依 T1 到 T6 排序。
 * @type {(layout: MapLayout) => { room: RoomSpec, terminal: TerminalSpec }[]}
 */
const collectTerminals = (layout) => {
	/** @type {{ room: RoomSpec, terminal: TerminalSpec }[]} */
	const list = [];
	for (const room of layout.rooms) {
		if (room.terminal !== null) list.push({ room, terminal: room.terminal });
	}
	list.sort((a, b) => a.terminal.name.localeCompare(b.terminal.name));
	return list;
};

// ---------------------------------------------------------------------------
// 主要產生函式
// ---------------------------------------------------------------------------

/**
 * 把配置轉成 Tiled JSON 物件。純函式，不碰檔案系統。
 * @type {(layout: MapLayout) => TiledMap}
 */
export const buildMap = (layout) => {
	const { width, height, tileSize } = layout;
	const cellCount = width * height;

	/** @type {(x: number, y: number) => boolean} */
	const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;

	// 1. 標出可走格與每格的邊框配色
	/** @type {boolean[]} */
	const walkable = new Array(cellCount).fill(false);
	/** @type {(FramePalette | null)[]} */
	const palettes = new Array(cellCount).fill(null);

	/** @type {(rect: TileRect, palette: FramePalette) => void} */
	const carve = (rect, palette) => {
		for (let y = rect.y; y < rect.y + rect.height; y += 1) {
			for (let x = rect.x; x < rect.x + rect.width; x += 1) {
				if (!inBounds(x, y)) {
					throw new Error(`可走範圍 (${x}, ${y}) 超出地圖 ${width}x${height}`);
				}
				walkable[toIndex(x, y, width)] = true;
				palettes[toIndex(x, y, width)] = palette;
			}
		}
	};

	for (const room of layout.rooms) {
		carve(room, room.palette);
		if (room.door !== null) carve(room.door.passage, room.palette);
	}

	const lockedDoor = layout.lockedDoor;
	const lockedDoorIndex = toIndex(lockedDoor.x, lockedDoor.y, width);
	const lockedDoorRoom = layout.rooms.find((room) => room.id === lockedDoor.roomId);
	if (lockedDoorRoom === undefined) {
		throw new Error(`主艙門所屬房間 ${lockedDoor.roomId} 不存在`);
	}

	/** 可走格判斷，地圖外一律不可走 @type {(x: number, y: number) => boolean} */
	const isWalkable = (x, y) => inBounds(x, y) && walkable[toIndex(x, y, width)];
	/** 挑邊框時把主艙門當地板看，門旁的地板就不會畫出警示條 @type {(x: number, y: number) => boolean} */
	const isVisualFloor = (x, y) => isWalkable(x, y) || (x === lockedDoor.x && y === lockedDoor.y);

	// 2. 控制台位置（牆面那一列，放 objects 層）
	/** @type {Map<number, number>} */
	const consoleTiles = new Map();
	for (const { room, terminal } of collectTerminals(layout)) {
		if (!rectContains(room, terminal.x, terminal.y + 1)) {
			throw new Error(`${terminal.name} 的互動區 (${terminal.x}, ${terminal.y + 1}) 不在 ${room.id} 內`);
		}
		if (isWalkable(terminal.x, terminal.y)) {
			throw new Error(`${terminal.name} 的控制台 (${terminal.x}, ${terminal.y}) 壓在可走格上`);
		}
		consoleTiles.set(toIndex(terminal.x, terminal.y, width), terminal.consoleTile);
	}

	/** @type {Set<number>} */
	const ventSet = new Set(layout.vents.map((point) => toIndex(point.x, point.y, width)));

	// 3. 逐格填四個 tile 層
	/** @type {number[]} */
	const floor = new Array(cellCount).fill(0);
	/** @type {number[]} */
	const walls = new Array(cellCount).fill(0);
	/** @type {number[]} */
	const objects = new Array(cellCount).fill(0);
	/** @type {number[]} */
	const collision = new Array(cellCount).fill(0);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = toIndex(x, y, width);

			if (walkable[index]) {
				const palette = /** @type {FramePalette} */ (palettes[index]);
				let tile = pickFrameTile(isVisualFloor, x, y, palette);
				if (tile === TILES.floor && ventSet.has(index)) tile = TILES.vent;
				floor[index] = toGid(tile);
				continue;
			}

			if (index === lockedDoorIndex) {
				floor[index] = toGid(pickFrameTile(isVisualFloor, x, y, lockedDoorRoom.palette));
				objects[index] = toGid(TILES.lockedDoor);
				collision[index] = toGid(TILES.collisionMarker);
				continue;
			}

			const consoleTile = consoleTiles.get(index);
			if (consoleTile !== undefined) {
				objects[index] = toGid(consoleTile);
				continue;
			}

			// 牆：正上方是可走格放牆面；牆面（或控制台）上方放牆頂；其餘深色虛空
			if (isWalkable(x, y + 1)) {
				walls[index] = toGid(TILES.wallFace);
			} else if (inBounds(x, y + 1) && isWalkable(x, y + 2)) {
				walls[index] = toGid(TILES.wallTop);
			} else {
				walls[index] = toGid(TILES.void);
			}
		}
	}

	// 房間門片蓋在通道地板上（只換 floor 層，不碰撞）
	for (const room of layout.rooms) {
		if (room.door === null) continue;
		if (!isWalkable(room.door.x, room.door.y)) {
			throw new Error(`${room.id} 的門 (${room.door.x}, ${room.door.y}) 不在可走範圍內`);
		}
		floor[toIndex(room.door.x, room.door.y, width)] = toGid(TILES.roomDoor);
	}

	// 4. 物件層 markers
	/** @type {TiledObject[]} */
	const markers = [];
	let nextObjectId = 1;

	const spawnRoom = layout.rooms.find((room) => room.id === layout.spawnRoomId);
	if (spawnRoom === undefined) {
		throw new Error(`出生房間 ${layout.spawnRoomId} 不存在`);
	}
	markers.push({
		id: nextObjectId,
		name: "spawn",
		type: "spawn",
		x: (spawnRoom.x + spawnRoom.width / 2) * tileSize,
		y: (spawnRoom.y + spawnRoom.height / 2) * tileSize,
		width: 0,
		height: 0,
		rotation: 0,
		visible: true,
		point: true,
	});
	nextObjectId += 1;

	for (const { room, terminal } of collectTerminals(layout)) {
		markers.push({
			id: nextObjectId,
			name: terminal.name,
			type: "terminal",
			x: terminal.x * tileSize,
			y: (terminal.y + 1) * tileSize,
			width: tileSize,
			height: tileSize,
			rotation: 0,
			visible: true,
			properties: [
				{ name: "terminalId", type: "string", value: terminal.terminalId },
				{ name: "title", type: "string", value: terminal.title },
				{ name: "roomId", type: "string", value: room.id },
			],
		});
		nextObjectId += 1;
	}

	for (const room of layout.rooms) {
		markers.push({
			id: nextObjectId,
			name: room.id,
			type: "room",
			x: room.x * tileSize,
			y: room.y * tileSize,
			width: room.width * tileSize,
			height: room.height * tileSize,
			rotation: 0,
			visible: true,
			properties: [{ name: "roomId", type: "string", value: room.id }],
		});
		nextObjectId += 1;
	}

	markers.push({
		id: nextObjectId,
		name: lockedDoor.doorId,
		type: "door",
		x: lockedDoor.x * tileSize,
		y: lockedDoor.y * tileSize,
		width: tileSize,
		height: tileSize,
		rotation: 0,
		visible: true,
		properties: [{ name: "doorId", type: "string", value: lockedDoor.doorId }],
	});
	nextObjectId += 1;

	// 5. 組成 Tiled JSON
	/** @type {(id: number, name: string, data: number[], visible: boolean, opacity: number) => TiledTileLayer} */
	const tileLayer = (id, name, data, visible, opacity) => ({
		id,
		name,
		type: "tilelayer",
		width,
		height,
		x: 0,
		y: 0,
		visible,
		opacity,
		data,
	});

	return {
		type: "map",
		version: "1.10",
		tiledversion: "1.10.2",
		orientation: "orthogonal",
		renderorder: "right-down",
		width,
		height,
		tilewidth: tileSize,
		tileheight: tileSize,
		infinite: false,
		nextlayerid: 6,
		nextobjectid: nextObjectId,
		tilesets: [{ ...TILESET }],
		layers: [
			tileLayer(1, "floor", floor, true, 1),
			tileLayer(2, "walls", walls, true, 1),
			tileLayer(3, "objects", objects, true, 1),
			tileLayer(4, "collision", collision, false, 0.5),
			{
				id: 5,
				name: "markers",
				type: "objectgroup",
				draworder: "topdown",
				x: 0,
				y: 0,
				visible: true,
				opacity: 1,
				objects: markers,
			},
		],
	};
};

// ---------------------------------------------------------------------------
// 連通性檢查
// ---------------------------------------------------------------------------

/**
 * 依名稱取 tile 圖層的 data，找不到就丟錯。
 * @type {(map: TiledMap, name: string) => number[]}
 */
const getLayerData = (map, name) => {
	const layer = map.layers.find((item) => item.name === name);
	if (layer === undefined || layer.type !== "tilelayer") {
		throw new Error(`地圖缺少 tile 圖層 ${name}`);
	}
	return layer.data;
};

/**
 * 從出生點做 BFS，只走 `floor` 有值且 `walls`、`objects`、`collision` 都是 0 的格子，
 * 回傳走不到的終端機名稱（互動區本身或上下左右相鄰格有一格走得到就算到達）。
 * @type {(map: TiledMap) => ConnectivityResult}
 */
export const checkConnectivity = (map) => {
	const { width, height, tilewidth, tileheight } = map;
	const floor = getLayerData(map, "floor");
	const walls = getLayerData(map, "walls");
	const objects = getLayerData(map, "objects");
	const collision = getLayerData(map, "collision");

	/** @type {(x: number, y: number) => boolean} */
	const isPassable = (x, y) => {
		if (x < 0 || y < 0 || x >= width || y >= height) return false;
		const index = toIndex(x, y, width);
		return floor[index] !== 0 && walls[index] === 0 && objects[index] === 0 && collision[index] === 0;
	};

	const markerLayer = map.layers.find((item) => item.name === "markers");
	if (markerLayer === undefined || markerLayer.type !== "objectgroup") {
		throw new Error("地圖缺少物件層 markers");
	}
	const spawn = markerLayer.objects.find((obj) => obj.type === "spawn");
	if (spawn === undefined) {
		throw new Error("物件層 markers 沒有出生點");
	}

	const startX = Math.floor(spawn.x / tilewidth);
	const startY = Math.floor(spawn.y / tileheight);
	/** @type {Uint8Array} */
	const visited = new Uint8Array(width * height);
	if (isPassable(startX, startY)) {
		/** @type {number[]} */
		const queue = [toIndex(startX, startY, width)];
		visited[queue[0]] = 1;
		let head = 0;
		while (head < queue.length) {
			const index = queue[head];
			head += 1;
			const x = index % width;
			const y = (index - x) / width;
			/** @type {[number, number][]} */
			const neighbours = [
				[x + 1, y],
				[x - 1, y],
				[x, y + 1],
				[x, y - 1],
			];
			for (const [nx, ny] of neighbours) {
				if (!isPassable(nx, ny)) continue;
				const nIndex = toIndex(nx, ny, width);
				if (visited[nIndex]) continue;
				visited[nIndex] = 1;
				queue.push(nIndex);
			}
		}
	}

	/** @type {(x: number, y: number) => boolean} */
	const isVisited = (x, y) => x >= 0 && y >= 0 && x < width && y < height && visited[toIndex(x, y, width)] === 1;

	/** @type {string[]} */
	const unreachable = [];
	for (const obj of markerLayer.objects) {
		if (obj.type !== "terminal") continue;
		const tx = Math.floor(obj.x / tilewidth);
		const ty = Math.floor(obj.y / tileheight);
		const reached =
			isVisited(tx, ty) ||
			isVisited(tx + 1, ty) ||
			isVisited(tx - 1, ty) ||
			isVisited(tx, ty + 1) ||
			isVisited(tx, ty - 1);
		if (!reached) unreachable.push(obj.name);
	}

	return { ok: unreachable.length === 0, unreachable };
};

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

/**
 * 把地圖轉成 JSON 字串：兩個空白縮排，tile 圖層的 data 每列一行，方便 diff。
 * @type {(map: TiledMap) => string}
 */
export const formatMapJson = (map) => {
	/** @type {Map<string, number[]>} */
	const placeholders = new Map();
	const replacer = /** @type {(this: unknown, key: string, value: unknown) => unknown} */ (
		function (key, value) {
			if (key === "data" && Array.isArray(value)) {
				const token = `__DATA_${placeholders.size}__`;
				placeholders.set(token, value);
				return token;
			}
			return value;
		}
	);
	let text = JSON.stringify(map, replacer, 2);
	for (const [token, data] of placeholders) {
		text = text.replace(new RegExp(`^(\\s*)"data": "${token}"`, "m"), (_match, indent) => {
			const rowIndent = `${indent}  `;
			/** @type {string[]} */
			const rows = [];
			for (let start = 0; start < data.length; start += map.width) {
				rows.push(rowIndent + data.slice(start, start + map.width).join(", "));
			}
			return `${indent}"data": [\n${rows.join(",\n")}\n${indent}]`;
		});
	}
	return `${text}\n`;
};

/** @type {() => Promise<void>} */
const main = async () => {
	const map = buildMap(DEFAULT_LAYOUT);
	const result = checkConnectivity(map);
	if (!result.ok) {
		console.error(`連通性檢查失敗，從出生點走不到：${result.unreachable.join(", ")}`);
		process.exit(1);
	}
	await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
	await fs.writeFile(OUT_PATH, formatMapJson(map));
	const markerLayer = map.layers.find((item) => item.name === "markers");
	const objectCount = markerLayer !== undefined && markerLayer.type === "objectgroup" ? markerLayer.objects.length : 0;
	console.log(
		`deck1: ${map.width}x${map.height} 格，${objectCount} 個標記物件，連通性通過 → ${path.relative(ROOT, OUT_PATH)}`,
	);
};

// 只有直接執行時才寫檔，被測試 import 時不動作
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
