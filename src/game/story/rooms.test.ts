// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTER_COUNT, DECK_ROOMS, ROOM_NAMES } from "@/game/phaser/events";
import { isRoomId, ROOM_IDS } from "./rooms";

describe("ROOM_IDS", () => {
	it("涵蓋 ROOM_NAMES 的全部 42 個艙區，沒有重複", () => {
		expect(ROOM_IDS).toHaveLength(42);
		expect(new Set(ROOM_IDS).size).toBe(ROOM_IDS.length);
		expect([...ROOM_IDS].sort()).toEqual(Object.keys(ROOM_NAMES).sort());
	});

	it("六個甲板 DECK_ROOMS 的每個艙區都在清單裡", () => {
		for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter += 1) {
			for (const roomId of Object.values(DECK_ROOMS[chapter])) {
				expect(ROOM_IDS).toContain(roomId);
			}
		}
	});
});

describe("isRoomId", () => {
	it("第一章與後面章節的艙區都認得", () => {
		expect(isRoomId("cryo")).toBe(true);
		expect(isRoomId("dc_logs")).toBe(true);
		expect(isRoomId("nv_core")).toBe(true);
	});

	it("不認得未知字串與 Object 原型上的屬性", () => {
		expect(isRoomId("bridge")).toBe(false);
		expect(isRoomId("toString")).toBe(false);
		expect(isRoomId("")).toBe(false);
	});
});
