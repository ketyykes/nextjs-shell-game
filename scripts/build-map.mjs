#!/usr/bin/env node
/**
 * 產生六個甲板的 Tiled 地圖 `public/maps/deck1.json` 到 `deck6.json`（Tiled 1.10 相容），給 Phaser 的 Station 場景讀。
 *
 * Kepler-9 是六個標準艙段串成的環，每段配置一樣，所以六章共用同一張平面圖（設計文件第 9 節）：
 * 上排左（third，T3）、上排中（fifth，T5）、上排右（fourth，T4），
 * 中間橫向走廊（corridor），右端是出口區（exit，T6），下排左（start，T1，起點）與下排中（second，T2）。
 * 每章不同的只有艙區 id／名稱、終端機 id／標題、地板配色、通風格位置與控制台 tile，見 `buildDeckLayout`。
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
 *   pnpm map:build    # 一次產六張，每張都跑連通性檢查
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {string} RoomId
 *   艙區 id，對照 `src/game/phaser/events.ts` 的 `RoomId`（六個甲板共 42 個）。
 * @typedef {"start" | "second" | "third" | "fourth" | "fifth" | "exit" | "corridor"} RoomSlot
 *   平面圖上的七個位置，對照 `events.ts` 的 `RoomSlot`。
 * @typedef {"blue" | "red"} FramePalette
 * @typedef {{ x: number, y: number }} TilePoint
 * @typedef {{ x: number, y: number, width: number, height: number }} TileRect
 * @typedef {{ name: string, terminalId: string, title: string, x: number, y: number, consoleTile: number }} TerminalSpec
 *   x、y 是控制台本體的格座標（房間上緣牆面那一列），互動區是 (x, y + 1)。
 * @typedef {{ x: number, y: number, passage: TileRect }} DoorSpec
 *   x、y 是門片（tile 2）的格座標，passage 是門所在通道要挖開的可走範圍。
 * @typedef {TileRect & { id: RoomId, slot: RoomSlot, name: string, palette: FramePalette, door: DoorSpec | null, terminal: TerminalSpec | null }} RoomSpec
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
const OUT_DIR = path.join(ROOT, "public", "maps");
/** 章節數，要跟 events.ts 的 CHAPTER_COUNT 一致 @type {number} */
const CHAPTER_COUNT = 6;

/** @type {(chapter: number) => string} */
const outPathFor = (chapter) => path.join(OUT_DIR, `deck${chapter}.json`);

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
// 六個甲板的共用平面圖（設計文件第 9 節）。所有座標都是格座標，房間範圍是內部可走區。
// ---------------------------------------------------------------------------

/**
 * @typedef {TileRect & { slot: RoomSlot, door: DoorSpec | null, terminal: { index: number, x: number, y: number } | null }} SlotGeometry
 *   一個位置的幾何，六章共用。terminal.index 是 T 幾（1 到 6），x、y 同 `TerminalSpec`。
 */

/**
 * 七個位置的幾何，陣列順序就是 `markers` 層艙區物件的輸出順序，不要調換（會改到物件 id）。
 * @type {SlotGeometry[]}
 */
const SLOT_GEOMETRY = [
	{
		slot: "third",
		x: 2,
		y: 2,
		width: 9,
		height: 6,
		door: { x: 6, y: 8, passage: { x: 6, y: 8, width: 1, height: 2 } },
		terminal: { index: 3, x: 4, y: 1 },
	},
	{
		slot: "fifth",
		x: 14,
		y: 2,
		width: 9,
		height: 6,
		door: { x: 18, y: 8, passage: { x: 18, y: 8, width: 1, height: 2 } },
		terminal: { index: 5, x: 20, y: 1 },
	},
	{
		slot: "fourth",
		x: 26,
		y: 2,
		width: 9,
		height: 6,
		door: { x: 30, y: 8, passage: { x: 30, y: 8, width: 1, height: 2 } },
		terminal: { index: 4, x: 32, y: 1 },
	},
	{
		slot: "corridor",
		x: 2,
		y: 10,
		width: 33,
		height: 3,
		door: null,
		terminal: null,
	},
	{
		slot: "exit",
		x: 35,
		y: 9,
		width: 4,
		height: 5,
		door: null,
		terminal: { index: 6, x: 37, y: 8 },
	},
	{
		slot: "start",
		x: 2,
		y: 15,
		width: 10,
		height: 7,
		door: { x: 6, y: 14, passage: { x: 6, y: 13, width: 1, height: 2 } },
		terminal: { index: 1, x: 4, y: 14 },
	},
	{
		slot: "second",
		x: 14,
		y: 15,
		width: 10,
		height: 7,
		door: { x: 18, y: 14, passage: { x: 18, y: 13, width: 1, height: 2 } },
		terminal: { index: 2, x: 21, y: 14 },
	},
];

/** 出口鎖門在出口區右牆，通往下一個甲板，該章 T6 過關前鎖住。doorId 要跟 events.ts 的 EXIT_DOOR_ID 一致。 */
const EXIT_DOOR = { doorId: "airlock", x: 39, y: 11 };

/**
 * 每個甲板七個位置對應的艙區 id。
 * 要跟 `src/game/phaser/events.ts` 的 `DECK_ROOMS` 一致，map.test.ts 會檢查（mjs 不能 import TS，只好複製）。
 * @type {Record<number, Record<RoomSlot, RoomId>>}
 */
const DECK_ROOMS = {
	1: { start: "cryo", second: "lifesupport", third: "quarters", fourth: "power", fifth: "medbay", exit: "airlock", corridor: "corridor" },
	2: { start: "dc_entry", second: "dc_logs", third: "dc_racks", fourth: "dc_cooling", fifth: "dc_backup", exit: "dc_exit", corridor: "dc_corridor" },
	3: { start: "eng_entry", second: "eng_workshop", third: "eng_storage", fourth: "eng_reactor", fifth: "eng_config", exit: "eng_exit", corridor: "eng_corridor" },
	4: { start: "com_entry", second: "com_relay", third: "com_antenna", fourth: "com_signal", fifth: "com_archive", exit: "com_exit", corridor: "com_corridor" },
	5: { start: "br_entry", second: "br_nav", third: "br_captain", fourth: "br_security", fifth: "br_escape", exit: "br_exit", corridor: "br_corridor" },
	6: { start: "nv_entry", second: "nv_monitor", third: "nv_memory", fourth: "nv_core", fifth: "nv_scheduler", exit: "nv_escape", corridor: "nv_corridor" },
};

/**
 * 艙區 id 對應的繁中名稱。
 * 要跟 `src/game/phaser/events.ts` 的 `ROOM_NAMES` 一致，map.test.ts 會檢查。
 * @type {Record<RoomId, string>}
 */
const ROOM_NAMES = {
	cryo: "冷凍艙",
	lifesupport: "維生艙",
	quarters: "宿舍",
	medbay: "醫療艙",
	power: "配電室",
	corridor: "主走廊",
	airlock: "主艙門",

	dc_entry: "資料中心入口",
	dc_logs: "日誌封存庫",
	dc_racks: "機櫃區",
	dc_cooling: "冷卻機房",
	dc_backup: "備援機房",
	dc_exit: "資料中心艙門",
	dc_corridor: "資料中心走廊",

	eng_entry: "工程艙入口",
	eng_workshop: "工作間",
	eng_storage: "零件倉",
	eng_reactor: "反應爐控制室",
	eng_config: "設定機房",
	eng_exit: "工程艙艙門",
	eng_corridor: "工程艙走廊",

	com_entry: "通訊艙入口",
	com_relay: "中繼機房",
	com_antenna: "天線控制室",
	com_signal: "訊號處理室",
	com_archive: "通訊紀錄室",
	com_exit: "通訊艙艙門",
	com_corridor: "通訊艙走廊",

	br_entry: "艦橋入口",
	br_nav: "導航站",
	br_captain: "艦長室",
	br_security: "安全管制室",
	br_escape: "逃生艙紀錄室",
	br_exit: "艦橋艙門",
	br_corridor: "艦橋走廊",

	nv_entry: "核心艙入口",
	nv_monitor: "監控室",
	nv_memory: "記憶庫",
	nv_core: "NOVA 核心",
	nv_scheduler: "排程機房",
	nv_escape: "逃生艙",
	nv_corridor: "核心艙走廊",
};

/**
 * 每章六台終端機的標題，陣列第 0 個是 T1。
 * 要跟 `src/game/story/decks.ts` 的 `DECK_TERMINAL_TITLES` 一致，map.test.ts 會拿 `deckTerminal` 比對。
 * @type {Record<number, string[]>}
 */
const DECK_TERMINAL_TITLES = {
	1: ["冷凍艙控制台", "維生系統監控台", "宿舍終端機", "配電箱", "醫療艙終端機", "艙門控制台"],
	2: ["入口登錄台", "日誌封存終端機", "機櫃管理台", "冷卻監控台", "備援主控台", "資料中心艙門控制台"],
	3: ["工程艙登錄台", "工作間終端機", "零件倉管理台", "反應爐控制台", "設定機房終端機", "工程艙艙門控制台"],
	4: ["通訊艙登錄台", "中繼機房終端機", "天線控制台", "訊號處理台", "通訊紀錄終端機", "通訊艙艙門控制台"],
	5: ["艦橋登錄台", "導航站終端機", "艦長室終端機", "安全管制台", "逃生艙紀錄台", "艦橋艙門控制台"],
	6: ["核心艙登錄台", "監控室終端機", "記憶庫終端機", "NOVA 核心控制台", "排程機房終端機", "逃生艙控制台"],
};

/**
 * 每章地板邊框配色，沒列到的位置是藍色。紅色警示條越多越有危險感：
 * 第 1 章配電室與主艙門、第 2 章只有冷卻機房、第 3 章入口與反應爐、第 4 章全藍（通訊艙是少數還正常的地方）、
 * 第 5 章艦長室與安全管制室、第 6 章 NOVA 核心、逃生艙與整條走廊。
 * @type {Record<number, Partial<Record<RoomSlot, FramePalette>>>}
 */
const DECK_PALETTES = {
	1: { fourth: "red", exit: "red" },
	2: { fourth: "red" },
	3: { start: "red", fourth: "red" },
	4: {},
	5: { third: "red", fourth: "red" },
	6: { fourth: "red", exit: "red", corridor: "red" },
};

/**
 * 第 1 章各台終端機的控制台 tile（43、44 兩種外觀）；偶數章整組對調，讓相鄰甲板看起來不完全一樣。
 * key 是 T 幾。
 * @type {Record<number, number>}
 */
const BASE_CONSOLE_TILES = { 1: 44, 2: 43, 3: 43, 4: 43, 5: 44, 6: 44 };

/**
 * 每章走廊中線（y = 11）的通風格 x 座標，只點綴用，位置每章微調。
 * @type {Record<number, number[]>}
 */
const DECK_VENT_COLUMNS = {
	1: [10, 14, 24, 33],
	2: [8, 16, 22, 30],
	3: [5, 12, 20, 28, 33],
	4: [10, 18, 26],
	5: [4, 14, 24, 32],
	6: [9, 15, 21, 27, 33],
};

/** 通風格所在的列：走廊三列的中間那列。 @type {number} */
const VENT_ROW = 11;

/** @type {(chapter: number, index: number) => number} */
const consoleTileFor = (chapter, index) => {
	const base = BASE_CONSOLE_TILES[index];
	if (chapter % 2 === 0) {
		return base === 43 ? 44 : 43;
	}
	return base;
};

/**
 * 第 `chapter` 章（1 到 6）的配置。幾何六章完全一樣，只換艙區、終端機、配色、通風格與控制台 tile。
 * @type {(chapter: number) => MapLayout}
 */
export const buildDeckLayout = (chapter) => {
	if (!Number.isInteger(chapter) || chapter < 1 || chapter > CHAPTER_COUNT) {
		throw new Error(`章節必須是 1 到 ${CHAPTER_COUNT} 的整數，收到 ${chapter}`);
	}
	const roomIds = DECK_ROOMS[chapter];
	const titles = DECK_TERMINAL_TITLES[chapter];
	const palettes = DECK_PALETTES[chapter];

	/** @type {RoomSpec[]} */
	const rooms = SLOT_GEOMETRY.map((geometry) => {
		const id = roomIds[geometry.slot];
		/** @type {TerminalSpec | null} */
		let terminal = null;
		if (geometry.terminal !== null) {
			const { index, x, y } = geometry.terminal;
			terminal = {
				name: `T${index}`,
				terminalId: `ch${chapter}-t${index}`,
				title: titles[index - 1],
				x,
				y,
				consoleTile: consoleTileFor(chapter, index),
			};
		}
		/** @type {DoorSpec | null} */
		let door = null;
		if (geometry.door !== null) {
			door = { x: geometry.door.x, y: geometry.door.y, passage: { ...geometry.door.passage } };
		}
		return {
			id,
			slot: geometry.slot,
			name: ROOM_NAMES[id],
			x: geometry.x,
			y: geometry.y,
			width: geometry.width,
			height: geometry.height,
			palette: palettes[geometry.slot] ?? "blue",
			door,
			terminal,
		};
	});

	return {
		width: 40,
		height: 24,
		tileSize: 32,
		spawnRoomId: roomIds.start,
		rooms,
		lockedDoor: { doorId: EXIT_DOOR.doorId, roomId: roomIds.exit, x: EXIT_DOOR.x, y: EXIT_DOOR.y },
		vents: DECK_VENT_COLUMNS[chapter].map((x) => ({ x, y: VENT_ROW })),
	};
};

/**
 * 第一章配置，等同 `buildDeckLayout(1)`。
 * 冷凍艙為起點；主艙門在主艙門區右牆，通往 deck2，T6 過關前鎖住。
 * @type {MapLayout}
 */
export const DEFAULT_LAYOUT = buildDeckLayout(1);

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
	// 先六張全部產好並檢查，全數通過才寫檔，避免只更新一半
	/** @type {{ chapter: number, map: TiledMap }[]} */
	const decks = [];
	/** @type {string[]} */
	const failures = [];
	for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter += 1) {
		const map = buildMap(buildDeckLayout(chapter));
		const result = checkConnectivity(map);
		if (!result.ok) {
			failures.push(`deck${chapter}（${result.unreachable.join(", ")}）`);
		}
		decks.push({ chapter, map });
	}
	if (failures.length > 0) {
		console.error(`連通性檢查失敗，從出生點走不到：${failures.join("；")}`);
		process.exit(1);
	}

	await fs.mkdir(OUT_DIR, { recursive: true });
	for (const { chapter, map } of decks) {
		await fs.writeFile(outPathFor(chapter), formatMapJson(map));
	}

	const first = decks[0].map;
	const markerLayer = first.layers.find((item) => item.name === "markers");
	let objectCount = 0;
	if (markerLayer !== undefined && markerLayer.type === "objectgroup") {
		objectCount = markerLayer.objects.length;
	}
	console.log(
		`deck1 到 deck${CHAPTER_COUNT}：${first.width}x${first.height} 格，每張 ${objectCount} 個標記物件，連通性全部通過 → ${path.relative(ROOT, OUT_DIR)}/deck{1..${CHAPTER_COUNT}}.json`,
	);
};

// 只有直接執行時才寫檔，被測試 import 時不動作
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
