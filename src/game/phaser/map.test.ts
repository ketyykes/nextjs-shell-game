// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deckTerminal, type TerminalIndex } from "@/game/story/decks";
import { buildDeckLayout, buildMap, checkConnectivity, DEFAULT_LAYOUT } from "../../../scripts/build-map.mjs";
import {
	MAP_HEIGHT_TILES,
	MAP_LAYERS,
	MAP_OBJECT_LAYER,
	MAP_OBJECT_TYPES,
	MAP_WIDTH_TILES,
	TILE_SIZE,
	TILESET_NAME,
} from "./constants";
import { CHAPTER_COUNT, DECK_ROOMS, EXIT_DOOR_ID, ROOM_NAMES, type RoomSlot } from "./events";

type TiledMap = ReturnType<typeof buildMap>;
type TiledLayer = TiledMap["layers"][number];
type TileLayer = Extract<TiledLayer, { type: "tilelayer" }>;
type ObjectLayer = Extract<TiledLayer, { type: "objectgroup" }>;
type MarkerObject = ObjectLayer["objects"][number];

/** tileset 共 84 格，gid 上限是 firstgid + 83。 */
const MAX_GID = 84;

const CHAPTERS = Array.from({ length: CHAPTER_COUNT }, (_, index) => index + 1);
const TERMINAL_INDEXES: TerminalIndex[] = [1, 2, 3, 4, 5, 6];

function loadMap(chapter: number): TiledMap {
	const mapPath = path.resolve(process.cwd(), `public/maps/deck${chapter}.json`);
	return JSON.parse(fs.readFileSync(mapPath, "utf8")) as TiledMap;
}

function getTileLayer(map: TiledMap, name: string): TileLayer {
	const layer = map.layers.find((item) => item.name === name);
	if (layer === undefined || layer.type !== "tilelayer") {
		throw new Error(`找不到 tile 圖層 ${name}`);
	}
	return layer;
}

function getMarkers(map: TiledMap): MarkerObject[] {
	const layer = map.layers.find((item) => item.name === MAP_OBJECT_LAYER);
	if (layer === undefined || layer.type !== "objectgroup") {
		throw new Error(`找不到物件層 ${MAP_OBJECT_LAYER}`);
	}
	return layer.objects;
}

function readProperty(obj: MarkerObject, name: string): string | undefined {
	return obj.properties?.find((item) => item.name === name)?.value;
}

/** 非零格的位置遮罩，比較幾何時用（不在乎填的是哪一格 tile）。 */
function occupancy(data: readonly number[]): boolean[] {
	return data.map((gid) => gid !== 0);
}

describe.each(CHAPTERS)("第 %i 章地圖 deck%i.json", (chapter) => {
	const map = loadMap(chapter);
	const deckRooms = DECK_ROOMS[chapter];

	it("尺寸與格子大小符合常數", () => {
		expect(map.width).toBe(MAP_WIDTH_TILES);
		expect(map.height).toBe(MAP_HEIGHT_TILES);
		expect(map.tilewidth).toBe(TILE_SIZE);
		expect(map.tileheight).toBe(TILE_SIZE);
		expect(map.infinite).toBe(false);
	});

	it("tileset 名稱與 firstgid 正確", () => {
		expect(map.tilesets).toHaveLength(1);
		expect(map.tilesets[0].name).toBe(TILESET_NAME);
		expect(map.tilesets[0].firstgid).toBe(1);
	});

	it("四個 tile 圖層依序為 floor、walls、objects、collision，data 長度都是 960", () => {
		const tileLayers = map.layers.filter((layer): layer is TileLayer => layer.type === "tilelayer");
		expect(tileLayers.map((layer) => layer.name)).toEqual([
			MAP_LAYERS.floor,
			MAP_LAYERS.walls,
			MAP_LAYERS.objects,
			MAP_LAYERS.collision,
		]);
		for (const layer of tileLayers) {
			expect(layer.data).toHaveLength(MAP_WIDTH_TILES * MAP_HEIGHT_TILES);
		}
		expect(getTileLayer(map, MAP_LAYERS.collision).visible).toBe(false);
	});

	it("所有 gid 介於 0 到 84", () => {
		for (const name of Object.values(MAP_LAYERS)) {
			for (const gid of getTileLayer(map, name).data) {
				expect(Number.isInteger(gid)).toBe(true);
				expect(gid).toBeGreaterThanOrEqual(0);
				expect(gid).toBeLessThanOrEqual(MAX_GID);
			}
		}
	});

	it("markers 有 1 個出生點，而且是點物件，落在 start 艙區內", () => {
		const spawns = getMarkers(map).filter((obj) => obj.type === MAP_OBJECT_TYPES.spawn);
		expect(spawns).toHaveLength(1);
		expect(spawns[0].name).toBe("spawn");
		expect(spawns[0].point).toBe(true);

		const startRoom = getMarkers(map).find(
			(obj) => obj.type === MAP_OBJECT_TYPES.room && readProperty(obj, "roomId") === deckRooms.start,
		);
		expect(startRoom).toBeDefined();
		if (startRoom === undefined) return;
		expect(spawns[0].x).toBeGreaterThan(startRoom.x);
		expect(spawns[0].x).toBeLessThan(startRoom.x + startRoom.width);
		expect(spawns[0].y).toBeGreaterThan(startRoom.y);
		expect(spawns[0].y).toBeLessThan(startRoom.y + startRoom.height);
	});

	it(`markers 有 6 台終端機，terminalId 是 ch${chapter}-t1 到 ch${chapter}-t6`, () => {
		const terminals = getMarkers(map).filter((obj) => obj.type === MAP_OBJECT_TYPES.terminal);
		expect(terminals).toHaveLength(6);
		const ids = terminals.map((obj) => readProperty(obj, "terminalId")).sort();
		expect(ids).toEqual(TERMINAL_INDEXES.map((index) => `ch${chapter}-t${index}`));
		for (const obj of terminals) {
			expect(obj.width).toBe(TILE_SIZE);
			expect(obj.height).toBe(TILE_SIZE);
		}
	});

	it("每台終端機的 title 與 roomId 等於 decks.ts 的 deckTerminal", () => {
		const terminals = getMarkers(map).filter((obj) => obj.type === MAP_OBJECT_TYPES.terminal);
		for (const index of TERMINAL_INDEXES) {
			const expected = deckTerminal(chapter, index);
			const marker = terminals.find((obj) => readProperty(obj, "terminalId") === expected.id);
			expect(marker, expected.id).toBeDefined();
			if (marker === undefined) continue;
			expect(marker.name).toBe(`T${index}`);
			expect(readProperty(marker, "title")).toBe(expected.title);
			expect(readProperty(marker, "roomId")).toBe(expected.roomId);
		}
	});

	it("markers 有 7 個艙區，roomId 剛好是 DECK_ROOMS 這一章的七個值", () => {
		const rooms = getMarkers(map).filter((obj) => obj.type === MAP_OBJECT_TYPES.room);
		expect(rooms).toHaveLength(7);
		const roomIds = rooms.map((obj) => readProperty(obj, "roomId")).sort();
		expect(roomIds).toEqual(Object.values(deckRooms).sort());
	});

	it(`markers 有 1 扇門，doorId 是 ${EXIT_DOOR_ID}，而且該格在 collision 層有阻擋`, () => {
		const doors = getMarkers(map).filter((obj) => obj.type === MAP_OBJECT_TYPES.door);
		expect(doors).toHaveLength(1);
		expect(readProperty(doors[0], "doorId")).toBe(EXIT_DOOR_ID);
		const index = (doors[0].y / TILE_SIZE) * MAP_WIDTH_TILES + doors[0].x / TILE_SIZE;
		expect(getTileLayer(map, MAP_LAYERS.collision).data[index]).not.toBe(0);
		expect(getTileLayer(map, MAP_LAYERS.objects).data[index]).not.toBe(0);
	});

	it("每台終端機的互動區本身可走，正上方是控制台", () => {
		const floor = getTileLayer(map, MAP_LAYERS.floor).data;
		const walls = getTileLayer(map, MAP_LAYERS.walls).data;
		const objects = getTileLayer(map, MAP_LAYERS.objects).data;
		const collision = getTileLayer(map, MAP_LAYERS.collision).data;
		const terminals = getMarkers(map).filter((obj) => obj.type === MAP_OBJECT_TYPES.terminal);
		for (const obj of terminals) {
			const tx = obj.x / TILE_SIZE;
			const ty = obj.y / TILE_SIZE;
			expect(Number.isInteger(tx)).toBe(true);
			expect(Number.isInteger(ty)).toBe(true);
			const index = ty * MAP_WIDTH_TILES + tx;
			expect(floor[index]).not.toBe(0);
			expect(walls[index]).toBe(0);
			expect(objects[index]).toBe(0);
			expect(collision[index]).toBe(0);
			expect(objects[index - MAP_WIDTH_TILES]).not.toBe(0);
		}
	});

	it("從出生點走得到六台終端機", () => {
		expect(checkConnectivity(map)).toEqual({ ok: true, unreachable: [] });
	});

	it(`檔案內容與 buildMap(buildDeckLayout(${chapter})) 一致，沒有手改後跟腳本脫節`, () => {
		expect(map).toEqual(buildMap(buildDeckLayout(chapter)));
	});

	it("腳本複製的艙區 id 與名稱跟 events.ts 的 DECK_ROOMS、ROOM_NAMES 一致", () => {
		const layout = buildDeckLayout(chapter);
		expect(layout.rooms).toHaveLength(7);
		for (const room of layout.rooms) {
			expect(room.id).toBe(deckRooms[room.slot as RoomSlot]);
			expect(room.name).toBe(ROOM_NAMES[deckRooms[room.slot as RoomSlot]]);
		}
		expect(layout.spawnRoomId).toBe(deckRooms.start);
		expect(layout.lockedDoor.doorId).toBe(EXIT_DOOR_ID);
		expect(layout.lockedDoor.roomId).toBe(deckRooms.exit);
	});
});

describe("六個甲板共用同一張平面圖", () => {
	const deck1 = loadMap(1);

	it("第 1 章的 buildDeckLayout 就是 DEFAULT_LAYOUT", () => {
		expect(buildDeckLayout(1)).toEqual(DEFAULT_LAYOUT);
	});

	it.each(CHAPTERS.slice(1))("第 %i 章的 walls、collision 與 deck1 完全相同，floor、objects 的非零位置相同", (chapter) => {
		const map = loadMap(chapter);
		expect(getTileLayer(map, MAP_LAYERS.walls).data).toEqual(getTileLayer(deck1, MAP_LAYERS.walls).data);
		expect(getTileLayer(map, MAP_LAYERS.collision).data).toEqual(getTileLayer(deck1, MAP_LAYERS.collision).data);
		// floor 依配色與通風格位置會換 tile，objects 的控制台會在 43、44 之間交替，只比位置
		expect(occupancy(getTileLayer(map, MAP_LAYERS.floor).data)).toEqual(
			occupancy(getTileLayer(deck1, MAP_LAYERS.floor).data),
		);
		expect(occupancy(getTileLayer(map, MAP_LAYERS.objects).data)).toEqual(
			occupancy(getTileLayer(deck1, MAP_LAYERS.objects).data),
		);
	});

	it.each(CHAPTERS.slice(1))("第 %i 章的標記物件位置與 deck1 相同（只有 id、標題、艙區不同）", (chapter) => {
		const toGeometry = (obj: MarkerObject) => ({
			id: obj.id,
			name: obj.name,
			type: obj.type,
			x: obj.x,
			y: obj.y,
			width: obj.width,
			height: obj.height,
		});
		const markers = getMarkers(loadMap(chapter)).filter((obj) => obj.type !== MAP_OBJECT_TYPES.room);
		const deck1Markers = getMarkers(deck1).filter((obj) => obj.type !== MAP_OBJECT_TYPES.room);
		expect(markers.map(toGeometry)).toEqual(deck1Markers.map(toGeometry));
	});

	it("buildDeckLayout 不接受 1 到 6 以外的章節", () => {
		expect(() => buildDeckLayout(0)).toThrow();
		expect(() => buildDeckLayout(CHAPTER_COUNT + 1)).toThrow();
	});
});

describe("連通性檢查", () => {
	it("能抓出被擋住的終端機", () => {
		const blocked = buildMap(DEFAULT_LAYOUT);
		const collision = blocked.layers.find((layer) => layer.name === MAP_LAYERS.collision);
		if (collision === undefined || collision.type !== "tilelayer") {
			throw new Error("找不到 collision 層");
		}
		// 把冷凍艙的門擋起來，出生點就出不去
		const cryo = DEFAULT_LAYOUT.rooms.find((room) => room.id === "cryo");
		if (cryo === undefined || cryo.door === null) {
			throw new Error("冷凍艙沒有門");
		}
		collision.data[cryo.door.y * MAP_WIDTH_TILES + cryo.door.x] = MAX_GID;
		const result = checkConnectivity(blocked);
		expect(result.ok).toBe(false);
		expect(result.unreachable).toEqual(["T2", "T3", "T4", "T5", "T6"]);
	});
});
