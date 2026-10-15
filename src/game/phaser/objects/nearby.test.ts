// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NoteMarker, TerminalMarker } from "../scenes/mapObjects";
import { findNearestNote, findNearestTerminal } from "./nearby";

function createTerminal(terminalId: string, x: number, y: number): TerminalMarker {
	return { terminalId, title: terminalId, roomId: "cryo", x, y, width: 32, height: 32 };
}

function createNote(noteId: string, x: number, y: number): NoteMarker {
	return { noteId, x, y, width: 32, height: 32 };
}

describe("findNearestNote", () => {
	const radius = 40;

	it("範圍內有多張時取最近的一張，範圍外回傳 null", () => {
		const far = createNote("far", 130, 100);
		const near = createNote("near", 110, 100);
		expect(findNearestNote(100, 100, [far, near], radius, false)).toBe(near);
		expect(findNearestNote(300, 300, [far, near], radius, false)).toBeNull();
	});

	it("同時靠近終端機時終端機優先，不算靠近便條", () => {
		const note = createNote("note", 110, 100);
		expect(findNearestNote(100, 100, [note], radius, true)).toBeNull();
	});
});

describe("findNearestTerminal", () => {
	const radius = 40;

	it("範圍內有多台時取最近的一台", () => {
		const far = createTerminal("far", 130, 100);
		const near = createTerminal("near", 110, 100);

		expect(findNearestTerminal(100, 100, [far, near], radius)).toBe(near);
	});

	it("範圍外回傳 null", () => {
		const terminal = createTerminal("t1", 200, 200);

		expect(findNearestTerminal(100, 100, [terminal], radius)).toBeNull();
	});

	it("剛好在邊界上算在內", () => {
		const terminal = createTerminal("t1", 140, 100);

		expect(findNearestTerminal(100, 100, [terminal], radius)).toBe(terminal);
	});

	it("比邊界遠一點點就不算", () => {
		const terminal = createTerminal("t1", 140.01, 100);

		expect(findNearestTerminal(100, 100, [terminal], radius)).toBeNull();
	});

	it("空陣列回傳 null", () => {
		expect(findNearestTerminal(100, 100, [], radius)).toBeNull();
	});

	it("距離相同時取陣列中較前面的", () => {
		const first = createTerminal("first", 120, 100);
		const second = createTerminal("second", 80, 100);

		expect(findNearestTerminal(100, 100, [first, second], radius)).toBe(first);
	});
});
