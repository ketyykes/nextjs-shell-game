// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMap, checkConnectivity, DEFAULT_LAYOUT } from "../../../scripts/build-map.mjs";
import {
	MAP_HEIGHT_TILES,
	MAP_LAYERS,
	MAP_OBJECT_LAYER,
	MAP_OBJECT_TYPES,
	MAP_WIDTH_TILES,
	TILE_SIZE,
	TILESET_NAME,
} from "./constants";
import { ROOM_NAMES, type RoomId } from "./events";

type TiledMap = ReturnType<typeof buildMap>;
type TiledLayer = TiledMap["layers"][number];
type TileLayer = Extract<TiledLayer, { type: "tilelayer" }>;
type ObjectLayer = Extract<TiledLayer, { type: "objectgroup" }>;
type MarkerObject = ObjectLayer["objects"][number];

const MAP_PATH = path.resolve(process.cwd(), "public/maps/deck1.json");
const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8")) as TiledMap;

/** tileset 共 84 格，gid 上限是 firstgid + 83。 */
const MAX_GID = 84;

function getTileLayer(name: string): TileLayer {
	const layer = map.layers.find((item) => item.name === name);
	if (layer === undefined || layer.type !== "tilelayer") {
		throw new Error(`找不到 tile 圖層 ${name}`);
	}
	return layer;
}

function getMarkers(): MarkerObject[] {
	const layer = map.layers.find((item) => item.name === MAP_OBJECT_LAYER);
	if (layer === undefined || layer.type !== "objectgroup") {
		throw new Error(`找不到物件層 ${MAP_OBJECT_LAYER}`);
	}
	return layer.objects;
}

function readProperty(obj: MarkerObject, name: string): string | undefined {
	return obj.properties?.find((item) => item.name === name)?.value;
}

describe("第一章地圖 deck1.json", () => {
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
		expect(getTileLayer(MAP_LAYERS.collision).visible).toBe(false);
	});

	it("所有 gid 介於 0 到 84", () => {
		for (const name of Object.values(MAP_LAYERS)) {
			for (const gid of getTileLayer(name).data) {
				expect(Number.isInteger(gid)).toBe(true);
				expect(gid).toBeGreaterThanOrEqual(0);
				expect(gid).toBeLessThanOrEqual(MAX_GID);
			}
		}
	});

	it("markers 有 1 個出生點，而且是點物件", () => {
		const spawns = getMarkers().filter((obj) => obj.type === MAP_OBJECT_TYPES.spawn);
		expect(spawns).toHaveLength(1);
		expect(spawns[0].name).toBe("spawn");
		expect(spawns[0].point).toBe(true);
	});

	it("markers 有 6 台終端機，terminalId 是 ch1-t1 到 ch1-t6", () => {
		const terminals = getMarkers().filter((obj) => obj.type === MAP_OBJECT_TYPES.terminal);
		expect(terminals).toHaveLength(6);
		const ids = terminals.map((obj) => readProperty(obj, "terminalId")).sort();
		expect(ids).toEqual(["ch1-t1", "ch1-t2", "ch1-t3", "ch1-t4", "ch1-t5", "ch1-t6"]);
		for (const obj of terminals) {
			expect(obj.width).toBe(TILE_SIZE);
			expect(obj.height).toBe(TILE_SIZE);
			expect(readProperty(obj, "title")).toBeTruthy();
			expect(Object.keys(ROOM_NAMES)).toContain(readProperty(obj, "roomId"));
		}
	});

	it("markers 有 7 個艙區，roomId 涵蓋七種", () => {
		const rooms = getMarkers().filter((obj) => obj.type === MAP_OBJECT_TYPES.room);
		expect(rooms).toHaveLength(7);
		const roomIds = rooms.map((obj) => readProperty(obj, "roomId")).sort();
		const expected = (Object.keys(ROOM_NAMES) as RoomId[]).sort();
		expect(roomIds).toEqual(expected);
	});

	it("markers 有 1 扇門，doorId 是 airlock，而且該格在 collision 層有阻擋", () => {
		const doors = getMarkers().filter((obj) => obj.type === MAP_OBJECT_TYPES.door);
		expect(doors).toHaveLength(1);
		expect(readProperty(doors[0], "doorId")).toBe("airlock");
		const index = (doors[0].y / TILE_SIZE) * MAP_WIDTH_TILES + doors[0].x / TILE_SIZE;
		expect(getTileLayer(MAP_LAYERS.collision).data[index]).not.toBe(0);
		expect(getTileLayer(MAP_LAYERS.objects).data[index]).not.toBe(0);
	});

	it("每台終端機的互動區本身可走，正上方是控制台", () => {
		const floor = getTileLayer(MAP_LAYERS.floor).data;
		const walls = getTileLayer(MAP_LAYERS.walls).data;
		const objects = getTileLayer(MAP_LAYERS.objects).data;
		const collision = getTileLayer(MAP_LAYERS.collision).data;
		const terminals = getMarkers().filter((obj) => obj.type === MAP_OBJECT_TYPES.terminal);
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

	it("連通性檢查能抓出被擋住的終端機", () => {
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

	it("檔案內容與 buildMap(DEFAULT_LAYOUT) 一致，沒有手改後跟腳本脫節", () => {
		expect(map).toEqual(buildMap(DEFAULT_LAYOUT));
	});
});
