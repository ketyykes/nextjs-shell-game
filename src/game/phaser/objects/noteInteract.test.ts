// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldOpenNote, type NoteInteractState } from "./noteInteract";

function keydown(repeat = false): { repeat: boolean } {
	return { repeat };
}

function state(overrides: Partial<NoteInteractState> = {}): NoteInteractState {
	return {
		nearbyNoteId: "ch2-entry-notice",
		interactEnabled: true,
		sceneActive: true,
		lastHandledEvent: undefined,
		...overrides,
	};
}

describe("shouldOpenNote", () => {
	it("靠近便條、能互動、場景在跑時，新的按下就打開", () => {
		expect(shouldOpenNote(state(), keydown())).toBe(true);
	});

	it("沒靠近便條、暫停選單開著、場景已暫停時不開", () => {
		expect(shouldOpenNote(state({ nearbyNoteId: null }), keydown())).toBe(false);
		expect(shouldOpenNote(state({ interactEnabled: false }), keydown())).toBe(false);
		expect(shouldOpenNote(state({ sceneActive: false }), keydown())).toBe(false);
	});

	it("按住不放的重複事件不開", () => {
		expect(shouldOpenNote(state(), keydown(true))).toBe(false);
	});

	it("Phaser 同一幀重跑鍵盤佇列、送回已經處理過的同一個事件時不開（剛關掉的便條不會又被打開）", () => {
		const first = keydown();
		expect(shouldOpenNote(state({ lastHandledEvent: first }), first)).toBe(false);
		expect(shouldOpenNote(state({ lastHandledEvent: first }), keydown())).toBe(true);
	});
});
