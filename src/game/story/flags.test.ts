// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isStoryFlag, roomEnteredFlag, STORY_FLAGS } from "./flags";
import { ROOM_IDS } from "./rooms";

describe("劇情旗標", () => {
	it("roomEnteredFlag 產生 ch1.room.<roomId>.entered", () => {
		expect(roomEnteredFlag("medbay")).toBe("ch1.room.medbay.entered");
	});

	it("固定旗標與七個艙區旗標都通過守衛", () => {
		for (const flag of Object.values(STORY_FLAGS)) {
			expect(isStoryFlag(flag)).toBe(true);
		}
		for (const roomId of ROOM_IDS) {
			expect(isStoryFlag(roomEnteredFlag(roomId))).toBe(true);
		}
	});

	it("不認得的字串不通過", () => {
		expect(isStoryFlag("ch1.unknown")).toBe(false);
		expect(isStoryFlag("ch1.room.bridge.entered")).toBe(false);
		expect(isStoryFlag("ch2.introShown")).toBe(false);
		expect(isStoryFlag("")).toBe(false);
	});
});
