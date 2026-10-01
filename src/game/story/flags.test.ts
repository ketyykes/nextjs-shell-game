// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chapterFlagPrefix, introShownFlag, isStoryFlag, outroShownFlag, roomEnteredFlag } from "./flags";
import { ROOM_IDS } from "./rooms";

describe("劇情旗標", () => {
	it("三種旗標都帶章節前綴", () => {
		expect(introShownFlag(1)).toBe("ch1.introShown");
		expect(outroShownFlag(3)).toBe("ch3.outroShown");
		expect(roomEnteredFlag(2, "dc_logs")).toBe("ch2.room.dc_logs.entered");
		expect(chapterFlagPrefix(6)).toBe("ch6.");
	});

	it("六章的固定旗標與所有艙區旗標都通過守衛", () => {
		for (let chapter = 1; chapter <= 6; chapter += 1) {
			expect(isStoryFlag(introShownFlag(chapter))).toBe(true);
			expect(isStoryFlag(outroShownFlag(chapter))).toBe(true);
		}
		for (const roomId of ROOM_IDS) {
			expect(isStoryFlag(roomEnteredFlag(1, roomId))).toBe(true);
		}
	});

	it("不認得的字串不通過", () => {
		expect(isStoryFlag("ch1.unknown")).toBe(false);
		expect(isStoryFlag("ch1.room.bridge.entered")).toBe(false);
		expect(isStoryFlag("chx.introShown")).toBe(false);
		expect(isStoryFlag("")).toBe(false);
	});
});
