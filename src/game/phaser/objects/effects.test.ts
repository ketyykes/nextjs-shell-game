// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RoomId } from "../events";
import { airlockTilePosition, POWER_ON_ORDER, powerOnOrder, SHADOW_INSET, shadowFlashPosition } from "./effects";

/** deck1 的主走廊矩形（`public/maps/deck1.json` 的 room corridor）。 */
const CORRIDOR = { x: 64, y: 320, width: 1056, height: 96 };

/** deck1 全部七間艙區，刻意打亂順序。 */
const ALL_ROOMS: RoomId[] = ["cryo", "airlock", "quarters", "corridor", "power", "lifesupport", "medbay"];

describe("powerOnOrder", () => {
	it("從配電室出發，依離配電室的距離排出七間艙區", () => {
		expect(powerOnOrder(ALL_ROOMS, "power")).toEqual([
			"power",
			"corridor",
			"medbay",
			"quarters",
			"airlock",
			"lifesupport",
			"cryo",
		]);
	});

	it("與常數表 POWER_ON_ORDER 一致", () => {
		expect(powerOnOrder(ALL_ROOMS, "power")).toEqual([...POWER_ON_ORDER]);
	});

	it("地圖上不存在的艙區會被過濾掉", () => {
		expect(powerOnOrder(["cryo", "corridor", "power"], "power")).toEqual(["power", "corridor", "cryo"]);
	});

	it("起點不在地圖上時不會憑空加進去", () => {
		expect(powerOnOrder(["medbay", "corridor"], "power")).toEqual(["corridor", "medbay"]);
	});

	it("起點不是配電室時仍排第一個，其餘照順序表", () => {
		expect(powerOnOrder(["power", "corridor", "cryo"], "cryo")).toEqual(["cryo", "power", "corridor"]);
	});

	it("重複的 id 只保留一次", () => {
		expect(powerOnOrder(["power", "corridor", "corridor", "power"], "power")).toEqual(["power", "corridor"]);
	});

	it("空陣列回傳空陣列", () => {
		expect(powerOnOrder([], "power")).toEqual([]);
	});
});

describe("shadowFlashPosition", () => {
	it("玩家在走廊左半時取右端並往內縮", () => {
		expect(shadowFlashPosition(CORRIDOR, 200)).toEqual({ x: 64 + 1056 - SHADOW_INSET, y: 368 });
	});

	it("玩家在走廊右半時取左端並往內縮", () => {
		expect(shadowFlashPosition(CORRIDOR, 1040)).toEqual({ x: 64 + SHADOW_INSET, y: 368 });
	});

	it("玩家剛好在中線時取右端", () => {
		expect(shadowFlashPosition(CORRIDOR, 592).x).toBe(1072);
	});

	it("玩家在走廊範圍外（例如配電室在右上）也能判斷左右", () => {
		expect(shadowFlashPosition(CORRIDOR, 2000).x).toBe(112);
		expect(shadowFlashPosition(CORRIDOR, -50).x).toBe(1072);
	});

	it("y 取走廊垂直中心", () => {
		expect(shadowFlashPosition({ x: 0, y: 100, width: 400, height: 60 }, 0).y).toBe(130);
	});

	it("給 maxDistance 時人影夾在玩家視野邊緣，而不是走廊真正的盡頭", () => {
		// 玩家在左半，遠端是右端 1072，但只能離玩家 192px
		expect(shadowFlashPosition(CORRIDOR, 400, 192).x).toBe(592);
		// 玩家在右半，遠端是左端 112，夾到 1000 - 192
		expect(shadowFlashPosition(CORRIDOR, 1000, 192).x).toBe(808);
	});

	it("maxDistance 夾完仍不會超出走廊內縮範圍", () => {
		// 玩家在 1100，遠端是左端 112，夾到 1100 - 192 = 908，仍在內縮範圍內
		expect(shadowFlashPosition(CORRIDOR, 1100, 192).x).toBe(908);
		// 玩家在 80，遠端是右端 1072，夾到 80 + 192 = 272
		expect(shadowFlashPosition(CORRIDOR, 80, 192).x).toBe(272);
	});
});

describe("airlockTilePosition", () => {
	it("deck1 主艙門中心 (1264, 368) 換算為格子 (39, 11)", () => {
		expect(airlockTilePosition({ x: 1264, y: 368 })).toEqual({ tileX: 39, tileY: 11 });
	});

	it("格子左上角像素也落在同一格", () => {
		expect(airlockTilePosition({ x: 1248, y: 352 })).toEqual({ tileX: 39, tileY: 11 });
	});

	it("格子邊界往下取整", () => {
		expect(airlockTilePosition({ x: 31.9, y: 32 })).toEqual({ tileX: 0, tileY: 1 });
	});
});
