// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus, onGameEvent } from "../EventBus";
import type { RoomId } from "../events";
import { RoomTracker, type TrackedRoom } from "./RoomTracker";

/** 兩間相鄰的艙區加一間不相連的，座標模擬 deck1 的配置。 */
const ROOMS: TrackedRoom[] = [
	{ roomId: "corridor", rect: { x: 64, y: 320, width: 1056, height: 96 } },
	{ roomId: "airlock", rect: { x: 1120, y: 288, width: 128, height: 160 } },
	{ roomId: "cryo", rect: { x: 64, y: 480, width: 320, height: 224 } },
];

describe("RoomTracker", () => {
	let entered: RoomId[];
	let unsubscribe: () => void;

	beforeEach(() => {
		entered = [];
		unsubscribe = onGameEvent("room:enter", ({ roomId }) => {
			entered.push(roomId);
		});
	});

	afterEach(() => {
		unsubscribe();
		EventBus.removeAllListeners();
	});

	it("進入艙區時發一次 room:enter 並回傳艙區 id", () => {
		const tracker = new RoomTracker(ROOMS);

		expect(tracker.update(100, 350)).toBe("corridor");
		expect(entered).toEqual(["corridor"]);
	});

	it("留在同一艙區不會重複發事件", () => {
		const tracker = new RoomTracker(ROOMS);

		tracker.update(100, 350);
		tracker.update(200, 360);
		tracker.update(500, 400);

		expect(entered).toEqual(["corridor"]);
	});

	it("離開到沒有艙區的地方回傳 null，且不發事件", () => {
		const tracker = new RoomTracker(ROOMS);
		tracker.update(100, 350);

		expect(tracker.update(10, 10)).toBeNull();
		expect(tracker.roomId).toBeNull();
		expect(entered).toEqual(["corridor"]);
	});

	it("從 A 直接到 B 會發 B 的 room:enter", () => {
		const tracker = new RoomTracker(ROOMS);
		tracker.update(100, 350);

		expect(tracker.update(1130, 350)).toBe("airlock");
		expect(entered).toEqual(["corridor", "airlock"]);
	});

	it("離開後走回原艙區會再發一次事件", () => {
		const tracker = new RoomTracker(ROOMS);
		tracker.update(100, 350);
		tracker.update(10, 10);
		tracker.update(100, 350);

		expect(entered).toEqual(["corridor", "corridor"]);
	});

	it("一開始就不在任何艙區時回傳 null 且不發事件", () => {
		const tracker = new RoomTracker(ROOMS);

		expect(tracker.update(0, 0)).toBeNull();
		expect(entered).toEqual([]);
	});

	it("相鄰艙區共用邊界時，邊界座標屬於右側（半開區間）", () => {
		const tracker = new RoomTracker(ROOMS);

		expect(tracker.update(1119, 350)).toBe("corridor");
		expect(tracker.update(1120, 350)).toBe("airlock");
	});
});
