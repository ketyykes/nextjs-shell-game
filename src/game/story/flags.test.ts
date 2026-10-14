// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	chapterFlagPrefix,
	introShownFlag,
	isStoryFlag,
	NOVA_REACTION_KINDS,
	novaPortraitFor,
	novaReactionFlag,
	outroShownFlag,
	roomEnteredFlag,
	terminalOpenedFlag,
} from "./flags";
import { ROOM_IDS } from "./rooms";

describe("劇情旗標", () => {
	it("四種旗標都帶章節前綴", () => {
		expect(introShownFlag(1)).toBe("ch1.introShown");
		expect(terminalOpenedFlag("ch2-t3")).toBe("ch2.terminal.ch2-t3.opened");
		expect(terminalOpenedFlag("ch10-t1").startsWith(chapterFlagPrefix(10))).toBe(true);
		expect(outroShownFlag(3)).toBe("ch3.outroShown");
		expect(roomEnteredFlag(2, "dc_logs")).toBe("ch2.room.dc_logs.entered");
		expect(chapterFlagPrefix(6)).toBe("ch6.");
	});

	it("六章的固定旗標與所有艙區旗標都通過守衛", () => {
		for (let chapter = 1; chapter <= 6; chapter += 1) {
			expect(isStoryFlag(introShownFlag(chapter))).toBe(true);
			expect(isStoryFlag(outroShownFlag(chapter))).toBe(true);
			expect(isStoryFlag(terminalOpenedFlag(`ch${chapter}-t6`))).toBe(true);
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
		// 終端機旗標的章節前綴必須跟終端機 id 一致
		expect(isStoryFlag("ch1.terminal.ch2-t1.opened")).toBe(false);
		expect(isStoryFlag("ch1.terminal.t1.opened")).toBe(false);
	});
});

describe("NOVA 看狀態的反應旗標", () => {
	it("每種反應一個旗標，帶章節前綴，重玩本章會跟著清掉", () => {
		expect(novaReactionFlag(5, "unsetNovaDir")).toBe("ch5.nova.unsetNovaDir");
		expect(novaReactionFlag(1, "abinHome")).toBe("ch1.nova.abinHome");
		expect(novaReactionFlag(10, "hintHeavy").startsWith(chapterFlagPrefix(10))).toBe(true);
	});

	it("六章的每種反應旗標都通過守衛", () => {
		expect(NOVA_REACTION_KINDS).toEqual(["abinNote", "abinReply", "abinHome", "hintHeavy", "unsetNovaDir", "identity"]);
		for (let chapter = 1; chapter <= 6; chapter += 1) {
			for (const kind of NOVA_REACTION_KINDS) {
				expect(isStoryFlag(novaReactionFlag(chapter, kind)), `${chapter} ${kind}`).toBe(true);
			}
		}
	});

	it("不認得的反應名稱不通過", () => {
		expect(isStoryFlag("ch1.nova.unknown")).toBe(false);
		expect(isStoryFlag("ch1.nova.")).toBe(false);
		expect(isStoryFlag("nova.abinNote")).toBe(false);
		// 認可旗標刻意不帶章節前綴，也不是劇情旗標的格式
		expect(isStoryFlag("insight.grep")).toBe(false);
	});
});

describe("NOVA 立繪", () => {
	it("第一到五章一律用 nova-eye", () => {
		for (let chapter = 1; chapter <= 5; chapter += 1) {
			expect(novaPortraitFor(chapter, { [roomEnteredFlag(6, "nv_core")]: true })).toBe("eye");
		}
	});

	it("第六章走進 NOVA 核心艙之前用 nova-eye，之後改用 nova-core", () => {
		expect(novaPortraitFor(6, {})).toBe("eye");
		expect(novaPortraitFor(6, { [roomEnteredFlag(6, "nv_memory")]: true })).toBe("eye");
		expect(novaPortraitFor(6, { [roomEnteredFlag(6, "nv_core")]: true })).toBe("core");
	});
});
