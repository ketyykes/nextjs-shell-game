// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus, onGameEvent } from "../EventBus";
import type { GameEventMap } from "../events";
import { PositionReporter, resolveSpawnPoint } from "./position";

describe("PositionReporter", () => {
	let stopped: GameEventMap["player:stopped"][];
	let unsubscribe: () => void;

	beforeEach(() => {
		stopped = [];
		unsubscribe = onGameEvent("player:stopped", (payload) => {
			stopped.push(payload);
		});
	});

	afterEach(() => {
		unsubscribe();
		EventBus.removeAllListeners();
	});

	it("站在出生點不動時不發事件", () => {
		const reporter = new PositionReporter();
		reporter.update(100, 200, "cryo");
		reporter.update(100, 200, "cryo");
		reporter.update(100, 200, "cryo");
		expect(stopped).toEqual([]);
	});

	it("走動後停下的那一幀發一次 player:stopped，帶整數座標與艙區", () => {
		const reporter = new PositionReporter();
		reporter.update(100, 200, "cryo");
		reporter.update(102.4, 200, "cryo");
		reporter.update(104.6, 200, "cryo");
		reporter.update(104.6, 200, "cryo");
		reporter.update(104.6, 200, "cryo");
		expect(stopped).toEqual([{ x: 105, y: 200, roomId: "cryo" }]);
	});

	it("每次停下都會發，但停在同一點不重複發", () => {
		const reporter = new PositionReporter();
		reporter.update(100, 200, "cryo");
		reporter.update(110, 200, "cryo");
		reporter.update(110, 200, "cryo");
		reporter.update(110, 220, "corridor");
		reporter.update(110, 220, "corridor");
		expect(stopped).toEqual([
			{ x: 110, y: 200, roomId: "cryo" },
			{ x: 110, y: 220, roomId: "corridor" },
		]);
	});

	it("停在任何艙區外（例如門框上）時不發，避免存到沒有艙區名的位置", () => {
		const reporter = new PositionReporter();
		reporter.update(100, 200, "cryo");
		reporter.update(110, 200, null);
		reporter.update(110, 200, null);
		expect(stopped).toEqual([]);
	});
});

describe("resolveSpawnPoint", () => {
	const fallback = { x: 96, y: 560 };
	const bounds = { width: 1280, height: 768 };

	it("沒有存位置時用地圖出生點", () => {
		expect(resolveSpawnPoint(undefined, fallback, bounds)).toEqual(fallback);
		expect(resolveSpawnPoint(null, fallback, bounds)).toEqual(fallback);
	});

	it("存的位置在地圖範圍內就從那裡出生", () => {
		expect(resolveSpawnPoint({ x: 640, y: 352 }, fallback, bounds)).toEqual({ x: 640, y: 352 });
	});

	it("座標不是有限數字或超出地圖就退回出生點", () => {
		expect(resolveSpawnPoint({ x: Number.NaN, y: 10 }, fallback, bounds)).toEqual(fallback);
		expect(resolveSpawnPoint({ x: "10", y: 10 }, fallback, bounds)).toEqual(fallback);
		expect(resolveSpawnPoint({ x: -1, y: 10 }, fallback, bounds)).toEqual(fallback);
		expect(resolveSpawnPoint({ x: 10, y: 768 }, fallback, bounds)).toEqual(fallback);
	});
});
