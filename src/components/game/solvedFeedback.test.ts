// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findTerminal } from "@/game/chapters";
import type { TerminalDefinition } from "@/game/story";
import type { SolutionInsight } from "@/game/story/solutionInsight";
import { createInsightEntry, createObjectiveDoneEntry, solvedSoundFor } from "./solvedFeedback";

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

/** 測試用的認可項目：`chapter` 是 null 代表課表外。 */
function insight(concept: string, chapter: number | null, sameChapter = false): SolutionInsight {
	return { concept, chapter, sameChapter };
}

/** 只看認可行的文字。 */
function insightLines(insights: SolutionInsight[]): string[] | null {
	const entry = createInsightEntry(terminal("ch1-t1"), insights);
	if (entry === null || entry.kind !== "system") {
		return null;
	}
	return entry.lines;
}

describe("createInsightEntry", () => {
	it("沒有要認可的就回 null，不插行", () => {
		expect(createInsightEntry(terminal("ch1-t1"), [])).toBeNull();
	});

	it("產生一筆青綠的系統行，id 帶終端機 id", () => {
		expect(createInsightEntry(terminal("ch2-t1"), [insight("|", 4)])).toEqual({
			kind: "system",
			id: "insight-ch2-t1",
			tone: "success",
			lines: ["☆ 你用了還沒教的 `|`，第 4 章才會正式介紹。"],
		});
	});

	it("同一章稍後才教的說「這一章就會教到」", () => {
		expect(insightLines([insight("ls -a", 1, true)])).toEqual(["☆ 你用了還沒教的 `ls -a`，這一章就會教到。"]);
	});

	it("好幾個都在同一章教時合成一句", () => {
		expect(insightLines([insight("|", 4), insight(">", 4)])).toEqual(["☆ 你用了還沒教的 `|`、`>`，第 4 章才會正式介紹。"]);
	});

	it("在不同章教時每個後面標章節", () => {
		expect(insightLines([insight("ls -a", 1, true), insight("grep", 2), insight("|", 4)])).toEqual([
			"☆ 你用了還沒教的 `ls -a`（這一章）、`grep`（第 2 章）、`|`（第 4 章），之後才會正式介紹。",
		]);
	});

	it("課表外的另起一行", () => {
		expect(insightLines([insight("tree", null)])).toEqual(["☆ `tree` 不在課表上，你自己找到的。"]);
		expect(insightLines([insight("grep", 2), insight("tree", null), insight(";", null)])).toEqual([
			"☆ 你用了還沒教的 `grep`，第 2 章才會正式介紹。",
			"☆ `tree`、`;` 不在課表上，你自己找到的。",
		]);
	});

	it("超過三個只列前三個，其餘用「等 N 項」帶過", () => {
		const taught = [insight("ls -l", 1, true), insight("ls -a", 1, true), insight("~", 1, true), insight("grep", 2)];
		const offCurriculum = ["tree", "cut", "diff", ";"].map((concept) => insight(concept, null));
		expect(insightLines([...taught, ...offCurriculum])).toEqual([
			"☆ 你用了還沒教的 `ls -l`（這一章）、`ls -a`（這一章）、`~`（這一章）等 4 項，之後才會正式介紹。",
			"☆ `tree`、`cut`、`diff` 等 4 項不在課表上，你自己找到的。",
		]);
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
