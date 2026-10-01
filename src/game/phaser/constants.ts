/**
 * Phaser 端的共用常數：資源 key、檔案路徑、地圖圖層與物件的命名契約。
 *
 * `scripts/build-map.mjs` 產生的 `public/maps/deck1.json` 到 `deck6.json` 必須遵守這裡的命名，
 * Station 場景照這些名字讀圖層與物件。改名要兩邊一起改。
 * 這個檔案不可以 import Phaser，讓腳本與測試也能引用（腳本是 .mjs，用字面值對照即可）。
 */

import type { CharacterId } from "@/game/store/types";

export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 24;

/** 遊戲畫布尺寸，鏡頭放大兩倍後實際看到 15x9 格。 */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 576;
export const CAMERA_ZOOM = 2;

/** 角色 sprite 規格（設計文件 6.2）。 */
export const SPRITE_FRAME_WIDTH = 32;
export const SPRITE_FRAME_HEIGHT = 48;
export const SPRITE_FRAMES_PER_ROW = 4;
/** 列順序由上到下：下、左、右、上。 */
export const SPRITE_ROW_BY_DIRECTION = { down: 0, left: 1, right: 2, up: 3 } as const;
export type Direction = keyof typeof SPRITE_ROW_BY_DIRECTION;

export const PLAYER_SPEED = 120;

// ---------------------------------------------------------------------------
// 資源 key 與路徑（相對於 public/）
// ---------------------------------------------------------------------------

export const ASSET_KEYS = {
	tileset: "scifi-tiles",
	/** 地圖 key，六個甲板共用同一個 key，Preloader 依章節載入不同檔案。 */
	map: "deck",
	player: "technician",
} as const;

export const ASSET_PATHS = {
	tileset: "tiles/tileset-buch-scifi.png",
	/** 第 n 章的地圖，由 `scripts/build-map.mjs` 產生（`pnpm map:build` 一次產六張）。 */
	map: (chapter: number) => `maps/deck${chapter}.json`,
	/** 四個外觀共用同一個 key，依選角載入不同檔案。 */
	playerSprite: (character: CharacterId) => `sprites/technician-${character}.png`,
} as const;

// ---------------------------------------------------------------------------
// Tiled 地圖契約
// ---------------------------------------------------------------------------

/** Tiled JSON 裡 tileset 的 `name`，Station 用 `map.addTilesetImage(TILESET_NAME, ASSET_KEYS.tileset)`。 */
export const TILESET_NAME = "scifi";

/** tile 圖層名稱。 */
export const MAP_LAYERS = {
	/** 地板，不碰撞。 */
	floor: "floor",
	/** 牆與房間邊框，全部碰撞。 */
	walls: "walls",
	/** 控制台等裝飾，全部碰撞。 */
	objects: "objects",
	/** 額外的隱形阻擋格（例如鎖住的主艙門），全部碰撞，執行時設為不可見。 */
	collision: "collision",
} as const;

/** 物件圖層名稱與物件的 `type`。 */
export const MAP_OBJECT_LAYER = "markers";

export const MAP_OBJECT_TYPES = {
	/** 出生點，整張圖只有一個，name 固定 `spawn`。 */
	spawn: "spawn",
	/** 終端機互動區，32x32 矩形，properties 含 `terminalId`、`title`、`roomId`。 */
	terminal: "terminal",
	/** 艙區範圍矩形，properties 含 `roomId`，玩家進入時發 `room:enter`。 */
	room: "room",
	/** 鎖門的位置，properties 含 `doorId`；每個甲板的出口門 doorId 都是 `airlock`（`EXIT_DOOR_ID`）。 */
	door: "door",
} as const;

/** 終端機互動區的半徑（px），玩家中心進入這個距離就算「靠近」。 */
export const TERMINAL_INTERACT_RADIUS = 40;

/** 斷電時角色周圍的可見半徑（px），燈光遮罩用。 */
export const LIGHT_RADIUS = 96;
