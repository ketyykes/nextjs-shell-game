// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TerminalMarker } from "../scenes/mapObjects";
import { findNearestTerminal } from "./nearby";

function createTerminal(terminalId: string, x: number, y: number): TerminalMarker {
	return { terminalId, title: terminalId, roomId: "cryo", x, y, width: 32, height: 32 };
}

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
