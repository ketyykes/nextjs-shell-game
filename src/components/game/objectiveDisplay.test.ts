// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getChapter } from "@/game/chapters";
import { objectiveDisplay, type ObjectiveDisplayInput } from "./objectiveDisplay";

const CHAPTER_ONE = getChapter(1);
const [T1, T2, T3] = CHAPTER_ONE.terminals;
const ALL = CHAPTER_ONE.terminals.map((terminal) => terminal.id);

function display(input: Partial<ObjectiveDisplayInput> = {}) {
	return objectiveDisplay({
		terminals: CHAPTER_ONE.terminals,
		solvedTerminals: [],
		openTerminalId: null,
		nearbyTerminalId: null,
		justSolvedId: null,
		...input,
	});
}

describe("objectiveDisplay", () => {
	it("沒有焦點時指向第一台未過關的", () => {
		expect(display()).toEqual({ title: T1.objective.title, description: T1.objective.description, solved: false });
		expect(display({ solvedTerminals: [T1.id] }).title).toBe(T2.objective.title);
	});

	it("開著的優先於附近的（M10-2）", () => {
		expect(display({ nearbyTerminalId: T3.id }).title).toBe(T3.objective.title);
		expect(display({ openTerminalId: T2.id, nearbyTerminalId: T3.id }).title).toBe(T2.objective.title);
	});

	it("剛過關的那台打勾，優先於其他目標", () => {
		const result = display({ solvedTerminals: [T1.id], openTerminalId: T1.id, justSolvedId: T1.id });
		expect(result).toEqual({ title: T1.objective.title, description: T1.objective.description, solved: true });
	});

	it("全部過關時沒有目標", () => {
		expect(display({ solvedTerminals: ALL })).toEqual({ title: null, description: undefined, solved: false });
	});
});
