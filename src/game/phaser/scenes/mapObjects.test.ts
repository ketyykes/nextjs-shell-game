// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	parseChapter,
	parseMapMarkers,
	readProperty,
	toCenter,
	type TiledObject,
} from "./mapObjects";

/** 手寫的 Tiled 物件層：一個 spawn、兩個 terminal、一個 room、一個 door、一個未知 type。 */
function createFixtureObjects(): TiledObject[] {
	return [
		{ id: 1, name: "spawn", type: "spawn", x: 160, y: 224, width: 0, height: 0 },
		{
			id: 2,
			name: "t1",
			type: "terminal",
			x: 96,
			y: 128,
			width: 32,
			height: 32,
			properties: [
				{ name: "terminalId", type: "string", value: "ch1-t1" },
				{ name: "title", type: "string", value: "冷凍艙控制台" },
				{ name: "roomId", type: "string", value: "cryo" },
			],
		},
		{
			id: 3,
			name: "t2",
			type: "terminal",
			x: 448,
			y: 576,
			width: 32,
			height: 32,
			properties: [
				{ name: "roomId", type: "string", value: "lifesupport" },
				{ name: "terminalId", type: "string", value: "ch1-t2" },
				{ name: "title", type: "string", value: "維生系統" },
			],
		},
		{
			id: 4,
			name: "cryo",
			type: "room",
			x: 64,
			y: 480,
			width: 320,
			height: 256,
			properties: [{ name: "roomId", type: "string", value: "cryo" }],
		},
		{
			id: 5,
			name: "airlock-door",
			type: "door",
			x: 1216,
			y: 288,
			width: 32,
			height: 64,
			properties: [{ name: "doorId", type: "string", value: "airlock" }],
		},
		{ id: 6, name: "note", type: "comment", x: 0, y: 0, width: 10, height: 10 },
	];
}

describe("readProperty", () => {
	it("從 properties 陣列依名稱取值", () => {
		const obj: TiledObject = {
			id: 9,
			properties: [
				{ name: "a", value: "x" },
				{ name: "b", value: 3 },
			],
		};
		expect(readProperty(obj, "b")).toBe(3);
	});

	it("缺 property 時丟出帶物件 id 與屬性名的 Error", () => {
		const obj: TiledObject = { id: 42, type: "terminal", properties: [] };
		expect(() => readProperty(obj, "terminalId")).toThrowError(/#42.*terminalId/);
	});

	it("沒有 properties 欄位也會丟錯", () => {
		const obj: TiledObject = { id: 7, type: "door" };
		expect(() => readProperty(obj, "doorId")).toThrowError(/doorId/);
	});
});

describe("toCenter", () => {
	it("左上角加半個寬高換成中心點", () => {
		expect(toCenter({ id: 1, x: 96, y: 128, width: 32, height: 32 })).toEqual({ x: 112, y: 144 });
	});

	it("點物件（寬高 0）的中心就是原座標", () => {
		expect(toCenter({ id: 1, x: 160, y: 224, width: 0, height: 0 })).toEqual({ x: 160, y: 224 });
	});
});

describe("parseMapMarkers", () => {
	it("解析出生點、終端機、艙區與門", () => {
		const markers = parseMapMarkers(createFixtureObjects());

		expect(markers.spawnPoint).toEqual({ x: 160, y: 224 });

		expect(markers.terminals).toEqual([
			{ terminalId: "ch1-t1", title: "冷凍艙控制台", roomId: "cryo", x: 112, y: 144, width: 32, height: 32 },
			{ terminalId: "ch1-t2", title: "維生系統", roomId: "lifesupport", x: 464, y: 592, width: 32, height: 32 },
		]);

		expect(markers.rooms).toEqual([{ roomId: "cryo", rect: { x: 64, y: 480, width: 320, height: 256 } }]);

		expect(markers.doors).toEqual([{ doorId: "airlock", x: 1232, y: 320, width: 32, height: 64 }]);
	});

	it("未知 type 的物件被忽略", () => {
		const unknownOnly = createFixtureObjects().filter((obj) => obj.type === "spawn" || obj.type === "comment");
		const markers = parseMapMarkers(unknownOnly);
		expect(markers.terminals).toEqual([]);
		expect(markers.rooms).toEqual([]);
		expect(markers.doors).toEqual([]);
	});

	it("終端機缺 property 時丟出明確的 Error", () => {
		const objects = createFixtureObjects();
		objects[1] = { ...objects[1], properties: [{ name: "terminalId", value: "ch1-t1" }] };
		expect(() => parseMapMarkers(objects)).toThrowError(/#2.*title/);
	});

	it("roomId 不是已知艙區時丟錯", () => {
		const objects = createFixtureObjects();
		objects[3] = { ...objects[3], properties: [{ name: "roomId", value: "kitchen" }] };
		expect(() => parseMapMarkers(objects)).toThrowError(/kitchen/);
	});

	it("property 型別不是字串時丟錯", () => {
		const objects = createFixtureObjects();
		objects[4] = { ...objects[4], properties: [{ name: "doorId", value: 5 }] };
		expect(() => parseMapMarkers(objects)).toThrowError(/doorId/);
	});

	it("沒有出生點時丟錯", () => {
		const objects = createFixtureObjects().filter((obj) => obj.type !== "spawn");
		expect(() => parseMapMarkers(objects)).toThrowError(/出生點/);
	});

	it("出生點超過一個時丟錯", () => {
		const objects = [...createFixtureObjects(), { id: 99, type: "spawn", x: 0, y: 0 }];
		expect(() => parseMapMarkers(objects)).toThrowError(/2 個出生點/);
	});
});

describe("parseChapter", () => {
	it("1 到 6 的整數原樣回傳", () => {
		for (const chapter of [1, 2, 3, 4, 5, 6]) {
			expect(parseChapter(chapter)).toBe(chapter);
		}
	});

	it("沒設、型別不對或超出範圍時當第 1 章", () => {
		expect(parseChapter(undefined)).toBe(1);
		expect(parseChapter("2")).toBe(1);
		expect(parseChapter(0)).toBe(1);
		expect(parseChapter(7)).toBe(1);
		expect(parseChapter(2.5)).toBe(1);
		expect(parseChapter(Number.NaN)).toBe(1);
	});
});
