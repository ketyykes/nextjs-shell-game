// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RoomId, SolvedEffect } from "../events";
import {
	airlockTilePosition,
	effectSafety,
	findCorridorRoomId,
	FLICKER_PULSES,
	flickerLegDuration,
	flickerMode,
	parseTerminalEffects,
	POWER_ON_ORDER,
	powerOnOrder,
	resolveSolvedState,
	SHADOW_INSET,
	shadowFlashPosition,
} from "./effects";

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

	it("其他甲板依同一張平面圖的位置排序（第二章從冷卻機房出發）", () => {
		const deck2: RoomId[] = ["dc_entry", "dc_exit", "dc_racks", "dc_corridor", "dc_cooling", "dc_logs", "dc_backup"];
		expect(powerOnOrder(deck2, "dc_cooling")).toEqual([
			"dc_cooling",
			"dc_corridor",
			"dc_backup",
			"dc_racks",
			"dc_exit",
			"dc_logs",
			"dc_entry",
		]);
	});

	it("起點是其他位置時排第一個，其餘照位置順序（第六章從監控室出發）", () => {
		const deck6: RoomId[] = ["nv_entry", "nv_monitor", "nv_corridor", "nv_core"];
		expect(powerOnOrder(deck6, "nv_monitor")).toEqual(["nv_monitor", "nv_core", "nv_corridor", "nv_entry"]);
	});
});

describe("findCorridorRoomId", () => {
	it("第一章的走廊 id 就叫 corridor", () => {
		expect(findCorridorRoomId(ALL_ROOMS)).toBe("corridor");
	});

	it("其他甲板找 _corridor 結尾的艙區", () => {
		expect(findCorridorRoomId(["dc_entry", "dc_corridor", "dc_exit"])).toBe("dc_corridor");
		expect(findCorridorRoomId(["nv_core", "nv_corridor"])).toBe("nv_corridor");
	});

	it("沒有走廊時回傳 undefined", () => {
		expect(findCorridorRoomId(["cryo", "power"])).toBeUndefined();
	});
});

describe("parseTerminalEffects", () => {
	it("合法的對照表原樣（拷貝）回傳", () => {
		const input = {
			"ch1-t4": { kind: "powerRestored" },
			"ch1-t6": { kind: "openDoor", doorId: "airlock" },
			"ch2-t3": { kind: "shadowFlash" },
			"ch2-t5": { kind: "flicker" },
			"ch6-t4": { kind: "blackout" },
		};
		const result = parseTerminalEffects(input);
		expect(result).toEqual(input);
		expect(result).not.toBe(input);
	});

	it("不是物件（undefined、null、陣列、字串）時回傳空物件", () => {
		expect(parseTerminalEffects(undefined)).toEqual({});
		expect(parseTerminalEffects(null)).toEqual({});
		expect(parseTerminalEffects([{ kind: "flicker" }])).toEqual({});
		expect(parseTerminalEffects("powerRestored")).toEqual({});
	});

	it("丟掉格式不對的項目：未知 kind、openDoor 缺 doorId、值不是物件", () => {
		const result = parseTerminalEffects({
			"ch1-t1": { kind: "explode" },
			"ch1-t2": { kind: "openDoor" },
			"ch1-t3": { kind: "openDoor", doorId: "" },
			"ch1-t4": "powerRestored",
			"ch1-t5": null,
			"ch1-t6": { kind: "openDoor", doorId: "airlock" },
		});
		expect(result).toEqual({ "ch1-t6": { kind: "openDoor", doorId: "airlock" } });
	});

	it("只保留需要的欄位", () => {
		expect(parseTerminalEffects({ a: { kind: "flicker", extra: 1 } })).toEqual({ a: { kind: "flicker" } });
	});
});

describe("resolveSolvedState", () => {
	const effects: Record<string, SolvedEffect> = {
		"ch1-t4": { kind: "powerRestored" },
		"ch1-t6": { kind: "openDoor", doorId: "airlock" },
		"ch1-t3": { kind: "shadowFlash" },
		"ch1-t5": { kind: "flicker" },
		"ch6-t4": { kind: "blackout" },
	};

	it("沒有任何燈光相關的過關時燈光不變", () => {
		expect(resolveSolvedState(["ch1-t1", "ch1-t3", "ch1-t5"], effects)).toEqual({
			power: "unchanged",
			openDoorIds: [],
		});
	});

	it("powerRestored 過關後全亮", () => {
		expect(resolveSolvedState(["ch1-t1", "ch1-t4"], effects)).toEqual({ power: "on", openDoorIds: [] });
	});

	it("openDoor 過關後開門並全亮", () => {
		expect(resolveSolvedState(["ch1-t6"], effects)).toEqual({ power: "on", openDoorIds: ["airlock"] });
	});

	it("blackout 在清單後面時最後是黑的", () => {
		expect(resolveSolvedState(["ch1-t4", "ch6-t4"], effects)).toEqual({ power: "off", openDoorIds: [] });
	});

	it("blackout 之後又 powerRestored 時最後是亮的", () => {
		expect(resolveSolvedState(["ch6-t4", "ch1-t4"], effects)).toEqual({ power: "on", openDoorIds: [] });
	});

	it("同一扇門只列一次", () => {
		const twoDoors: Record<string, SolvedEffect> = {
			a: { kind: "openDoor", doorId: "airlock" },
			b: { kind: "openDoor", doorId: "airlock" },
		};
		expect(resolveSolvedState(["a", "b"], twoDoors).openDoorIds).toEqual(["airlock"]);
	});

	it("沒宣告演出的終端機不影響結果", () => {
		expect(resolveSolvedState(["unknown"], effects)).toEqual({ power: "unchanged", openDoorIds: [] });
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

describe("flickerMode", () => {
	const idle = { sequenceRunning: false, isPowered: false, isFullyLit: false, isFlickering: false };

	it("斷電中用遮罩閃", () => {
		expect(flickerMode(idle)).toBe("mask");
	});

	it("已通電且遮罩隱藏時改用鏡頭 flash", () => {
		expect(flickerMode({ ...idle, isPowered: true, isFullyLit: true })).toBe("camera");
	});

	it("亮燈序列進行中、通電淡出中、正在閃時都略過", () => {
		expect(flickerMode({ ...idle, sequenceRunning: true })).toBe("skip");
		expect(flickerMode({ ...idle, isPowered: true })).toBe("skip");
		expect(flickerMode({ ...idle, isFlickering: true })).toBe("skip");
		expect(flickerMode({ ...idle, isPowered: true, isFullyLit: true, isFlickering: true })).toBe("skip");
	});
});

describe("flickerLegDuration", () => {
	it("總長平均分給每次暗下去再亮回來", () => {
		expect(flickerLegDuration(600)).toBe(600 / (FLICKER_PULSES * 2));
		expect(flickerLegDuration(400, 2)).toBe(100);
	});

	it("太短時有下限，pulses 不合法時當 1", () => {
		expect(flickerLegDuration(0)).toBeGreaterThan(0);
		expect(flickerLegDuration(200, 0)).toBe(100);
	});
});

describe("effectSafety（光敏安全：設定的「關閉閃爍」）", () => {
	it("閃爍開著時照原樣演出：人影閃一幀、鏡頭震動、開門閃光、燈閃都播", () => {
		expect(effectSafety(true)).toEqual({ shadowStyle: "flash", cameraShake: true, cameraFlash: true, lightFlicker: true });
	});

	it("關閉閃爍時人影改成慢慢浮現再淡出，鏡頭不震、不閃光、燈不閃", () => {
		expect(effectSafety(false)).toEqual({ shadowStyle: "fade", cameraShake: false, cameraFlash: false, lightFlicker: false });
	});
});
