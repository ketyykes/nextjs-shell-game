// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findTerminal } from "@/game/chapters";
import type { TerminalDefinition } from "@/game/story";
import { createObjectiveDoneEntry, solvedSoundFor } from "./solvedFeedback";

function terminal(id: string): TerminalDefinition {
	const definition = findTerminal(id);
	if (definition === undefined) {
		throw new Error(`劇本裡沒有 ${id}`);
	}
	return definition;
}

describe("createObjectiveDoneEntry", () => {
	it("產生一筆青綠的系統行「☑ 目標達成：目標標題」", () => {
		expect(createObjectiveDoneEntry(terminal("ch1-t1"))).toEqual({
			kind: "system",
			id: "objective-done-ch1-t1",
			tone: "success",
			lines: ["☑ 目標達成：讀取冷凍艙的喚醒排程"],
		});
	});

	it("id 帶終端機 id，不同終端機不會撞", () => {
		expect(createObjectiveDoneEntry(terminal("ch2-t3")).id).toBe("objective-done-ch2-t3");
	});
});

describe("solvedSoundFor", () => {
	it("一般終端機過關當下播 power", () => {
		expect(solvedSoundFor(terminal("ch1-t1"))).toBe("power");
	});

	it("開門演出的終端機過關當下也播 power（開門聲是關掉終端機後才響的另一個音）", () => {
		expect(solvedSoundFor(terminal("ch1-t6"))).toBe("power");
	});

	it("powerRestored 的終端機不播，Station 亮燈時已經會播 power，避免同一次過關響兩次", () => {
		expect(solvedSoundFor(terminal("ch1-t4"))).toBeNull();
		expect(solvedSoundFor(terminal("ch3-t4"))).toBeNull();
	});

	it("blackout 的終端機（第六章 T4）不播，Station 讓地圖安靜地變黑", () => {
		expect(solvedSoundFor(terminal("ch6-t4"))).toBeNull();
	});

	it("閃燈與人影演出的終端機過關當下照常播 power（Station 對這兩種不發音效，不會重複）", () => {
		expect(solvedSoundFor(terminal("ch2-t3"))).toBe("power");
		expect(solvedSoundFor(terminal("ch2-t4"))).toBe("power");
	});
});
