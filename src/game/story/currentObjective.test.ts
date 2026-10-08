// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getChapter } from "@/game/chapters";
import { currentObjectiveTerminal } from "./currentObjective";

const terminals = getChapter(1).terminals;
const NO_FOCUS = { openTerminalId: null, nearbyTerminalId: null };

describe("currentObjectiveTerminal", () => {
	it("沒開終端機也不在任何終端機旁時，指向第一台未過關的", () => {
		expect(currentObjectiveTerminal(terminals, ["ch1-t1", "ch1-t2"], NO_FOCUS)?.id).toBe("ch1-t3");
	});

	it("開著一台未過關的終端機時，目標就是那一台，不管前面還有沒解的", () => {
		const focus = { openTerminalId: "ch1-t4", nearbyTerminalId: "ch1-t4" };
		expect(currentObjectiveTerminal(terminals, ["ch1-t1", "ch1-t2"], focus)?.id).toBe("ch1-t4");
	});

	it("走到一台未過關的終端機旁（還沒開）時，目標指向附近那台", () => {
		const focus = { openTerminalId: null, nearbyTerminalId: "ch1-t5" };
		expect(currentObjectiveTerminal(terminals, ["ch1-t1"], focus)?.id).toBe("ch1-t5");
	});

	it("開著的那台優先於附近的那台", () => {
		const focus = { openTerminalId: "ch1-t6", nearbyTerminalId: "ch1-t5" };
		expect(currentObjectiveTerminal(terminals, [], focus)?.id).toBe("ch1-t6");
	});

	it("開著的那台已過關就不搶目標，改看附近未過關的", () => {
		const focus = { openTerminalId: "ch1-t1", nearbyTerminalId: "ch1-t3" };
		expect(currentObjectiveTerminal(terminals, ["ch1-t1"], focus)?.id).toBe("ch1-t3");
	});

	it("開著與附近的都已過關時，回到第一台未過關的", () => {
		const focus = { openTerminalId: "ch1-t2", nearbyTerminalId: "ch1-t2" };
		expect(currentObjectiveTerminal(terminals, ["ch1-t1", "ch1-t2"], focus)?.id).toBe("ch1-t3");
	});

	it("全部過關時沒有目標", () => {
		const solved = terminals.map((terminal) => terminal.id);
		const focus = { openTerminalId: "ch1-t6", nearbyTerminalId: "ch1-t6" };
		expect(currentObjectiveTerminal(terminals, solved, focus)).toBeUndefined();
	});

	it("不是這一章的終端機 id 不會被當成目標", () => {
		const focus = { openTerminalId: "ch2-t3", nearbyTerminalId: "ch2-t4" };
		expect(currentObjectiveTerminal(terminals, [], focus)?.id).toBe("ch1-t1");
	});
});
