// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SolvedEffect } from "./events";
import {
	parseChapter,
	parseCharacter,
	parseSolvedTerminals,
	parseSpawnPoint,
	parseTerminalEffects,
	readRegistryValue,
	REGISTRY_KEYS,
	registryValuesFromOptions,
	writeRegistryValues,
	type RegistryStore,
	type RegistryValues,
} from "./registry";

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

describe("parseSpawnPoint", () => {
	it("x、y 都是有限數字才回傳位置（只留這兩個欄位）", () => {
		expect(parseSpawnPoint({ x: 640, y: 352, extra: 1 })).toEqual({ x: 640, y: 352 });
	});

	it("沒存或座標不是有限數字時回 null（用地圖出生點）", () => {
		expect(parseSpawnPoint(undefined)).toBeNull();
		expect(parseSpawnPoint(null)).toBeNull();
		expect(parseSpawnPoint({ x: Number.NaN, y: 10 })).toBeNull();
		expect(parseSpawnPoint({ x: "10", y: 10 })).toBeNull();
		expect(parseSpawnPoint([10, 10])).toBeNull();
	});
});

describe("parseSolvedTerminals", () => {
	it("不是陣列就當空陣列，非字串的項目丟掉", () => {
		expect(parseSolvedTerminals(undefined)).toEqual([]);
		expect(parseSolvedTerminals("ch1-t4")).toEqual([]);
		expect(parseSolvedTerminals(["ch1-t4", 3, null, "ch1-t6"])).toEqual(["ch1-t4", "ch1-t6"]);
	});
});

describe("parseCharacter", () => {
	it("合法的角色 id 原樣回傳", () => {
		for (const character of ["a", "c", "d", "e"] as const) {
			expect(parseCharacter(character)).toBe(character);
		}
	});

	it("沒設或不是角色 id 時丟錯，提醒要透過 startGame 啟動", () => {
		expect(() => parseCharacter(undefined)).toThrow("startGame");
		expect(() => parseCharacter("b")).toThrow("startGame");
		expect(() => parseCharacter("toString")).toThrow("startGame");
	});
});

/** 用 Map 模擬 Phaser 的 DataManager。 */
function createStore(entries: Record<string, unknown> = {}): RegistryStore & { map: Map<string, unknown> } {
	const map = new Map(Object.entries(entries));
	return {
		map,
		get: (key) => map.get(key),
		set: (key, value) => map.set(key, value),
	};
}

const FULL_VALUES: RegistryValues = {
	character: "d",
	chapter: 3,
	startDark: true,
	terminalEffects: { "ch3-t4": { kind: "powerRestored" } },
	solvedTerminals: ["ch3-t1"],
	volume: 0.4,
	muted: true,
	spawnPoint: { x: 100, y: 200 },
	flickerEnabled: false,
};

describe("REGISTRY_KEYS", () => {
	it("每個 key 字串就是屬性名", () => {
		for (const [name, key] of Object.entries(REGISTRY_KEYS)) {
			expect(key).toBe(name);
		}
	});
});

describe("registryValuesFromOptions", () => {
	it("選填欄位補預設值：全亮、沒有演出、沒過關、音量 1、不靜音、出生點、閃爍開", () => {
		expect(registryValuesFromOptions({ character: "a", chapter: 1 })).toEqual({
			character: "a",
			chapter: 1,
			startDark: false,
			terminalEffects: {},
			solvedTerminals: [],
			volume: 1,
			muted: false,
			spawnPoint: null,
			flickerEnabled: true,
		});
	});

	it("有給的值原樣帶過去", () => {
		expect(registryValuesFromOptions(FULL_VALUES)).toEqual(FULL_VALUES);
	});

	it("陣列、演出表與位置都拷貝一份，之後改動來源不影響", () => {
		const solvedTerminals = ["ch1-t4"];
		const terminalEffects: Record<string, SolvedEffect> = { "ch1-t6": { kind: "openDoor", doorId: "airlock" } };
		const spawnPoint = { x: 1, y: 2 };
		const values = registryValuesFromOptions({ character: "a", chapter: 1, solvedTerminals, terminalEffects, spawnPoint });

		solvedTerminals.push("ch1-t5");
		terminalEffects["ch1-t6"] = { kind: "flicker" };
		spawnPoint.x = 99;

		expect(values.solvedTerminals).toEqual(["ch1-t4"]);
		expect(values.terminalEffects).toEqual({ "ch1-t6": { kind: "openDoor", doorId: "airlock" } });
		expect(values.spawnPoint).toEqual({ x: 1, y: 2 });
	});
});

describe("writeRegistryValues 與 readRegistryValue", () => {
	it("寫進去的每個 key 讀回來都一樣", () => {
		const store = createStore();
		writeRegistryValues(store, FULL_VALUES);

		expect(store.map.size).toBe(Object.keys(REGISTRY_KEYS).length);
		for (const key of Object.values(REGISTRY_KEYS)) {
			expect(readRegistryValue(store, key)).toEqual(FULL_VALUES[key]);
		}
	});

	it("registry 是空的時候除了選角都退回預設值", () => {
		const store = createStore();

		expect(readRegistryValue(store, "chapter")).toBe(1);
		expect(readRegistryValue(store, "startDark")).toBe(false);
		expect(readRegistryValue(store, "terminalEffects")).toEqual({});
		expect(readRegistryValue(store, "solvedTerminals")).toEqual([]);
		expect(readRegistryValue(store, "volume")).toBe(1);
		expect(readRegistryValue(store, "muted")).toBe(false);
		expect(readRegistryValue(store, "spawnPoint")).toBeNull();
		expect(readRegistryValue(store, "flickerEnabled")).toBe(true);
		expect(() => readRegistryValue(store, "character")).toThrow("startGame");
	});

	it("型別不對的值退回預設：開關只認明確的布林值，音量要是有限數字", () => {
		const store = createStore({
			startDark: "yes",
			muted: 1,
			flickerEnabled: 0,
			volume: Number.NaN,
			chapter: "2",
			spawnPoint: { x: "10", y: 10 },
		});

		expect(readRegistryValue(store, "startDark")).toBe(false);
		expect(readRegistryValue(store, "muted")).toBe(false);
		expect(readRegistryValue(store, "flickerEnabled")).toBe(true);
		expect(readRegistryValue(store, "volume")).toBe(1);
		expect(readRegistryValue(store, "chapter")).toBe(1);
		expect(readRegistryValue(store, "spawnPoint")).toBeNull();
	});
});
