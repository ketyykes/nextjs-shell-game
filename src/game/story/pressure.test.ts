// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	checkIdle,
	createPressureState,
	DEFAULT_NOVA_ERROR_LINES,
	LADDER_STEPS,
	novaErrorLine,
	recordExecution,
	resetPressure,
	STUCK_ERROR_STREAK,
	STUCK_IDLE_MS,
	stuckLines,
} from "./pressure";
import type { PressureReaction, PressureState } from "./pressure";

/** 連續錯 `count` 次，回傳最後的 state 與每一次的反應（index 0 是第 1 次）。 */
function recordErrors(
	initial: PressureState,
	count: number,
	now = 0,
): { state: PressureState; reactionsByAttempt: PressureReaction[][] } {
	let state = initial;
	const reactionsByAttempt: PressureReaction[][] = [];
	for (let attempt = 0; attempt < count; attempt += 1) {
		const result = recordExecution(state, true, now);
		state = result.state;
		reactionsByAttempt.push(result.reactions);
	}
	return { state, reactionsByAttempt };
}

/** 只留下階梯反應（flicker、door、nova），去掉 stuck。 */
function ladderOnly(reactions: PressureReaction[]): PressureReaction[] {
	return reactions.filter((reaction) => reaction.type !== "stuck");
}

describe("createPressureState", () => {
	it("帶入存檔的累積次數，連續次數與提示旗標從零開始", () => {
		expect(createPressureState(1000, 4)).toEqual({
			errorCount: 4,
			errorStreak: 0,
			lastProgressAt: 1000,
			stuckHintGiven: false,
		});
	});

	it("沒給累積次數就是 0，負數也當 0", () => {
		expect(createPressureState(0).errorCount).toBe(0);
		expect(createPressureState(0, -3).errorCount).toBe(0);
	});
});

describe("recordExecution：環境反應階梯", () => {
	it("連續錯 9 次只在第 3、6、9 次有階梯反應", () => {
		const { reactionsByAttempt } = recordErrors(createPressureState(0), 9);
		const ladder = reactionsByAttempt.map(ladderOnly);

		expect(ladder[LADDER_STEPS.flicker - 1]).toEqual([{ type: "flicker" }]);
		expect(ladder[LADDER_STEPS.door - 1]).toEqual([{ type: "door" }]);
		expect(ladder[LADDER_STEPS.nova - 1]).toEqual([{ type: "nova", lineIndex: 0 }]);

		const silentAttempts = [1, 2, 4, 5, 7, 8];
		for (const attempt of silentAttempts) {
			expect(ladder[attempt - 1], `第 ${attempt} 次`).toEqual([]);
		}
	});

	it("第 9 次之後整個階梯每 9 次循環：12 閃燈、15 門聲、18 換下一句 NOVA", () => {
		const { reactionsByAttempt } = recordErrors(createPressureState(0), 27);
		const ladder = reactionsByAttempt.map(ladderOnly);

		expect(ladder[11]).toEqual([{ type: "flicker" }]);
		expect(ladder[14]).toEqual([{ type: "door" }]);
		expect(ladder[17]).toEqual([{ type: "nova", lineIndex: 1 }]);
		expect(ladder[26]).toEqual([{ type: "nova", lineIndex: 2 }]);
		expect(ladder[9]).toEqual([]);
		expect(ladder[10]).toEqual([]);
	});

	it("從存檔的累積次數接著算", () => {
		const { reactionsByAttempt } = recordErrors(createPressureState(0, 2), 1);
		expect(reactionsByAttempt[0]).toEqual([{ type: "flicker" }]);
	});

	it("中間打對一次：連續次數歸零，累積次數不歸零", () => {
		let state = recordErrors(createPressureState(0), 2).state;
		state = recordExecution(state, false, 500).state;

		expect(state.errorStreak).toBe(0);
		expect(state.errorCount).toBe(2);
		expect(state.lastProgressAt).toBe(500);

		// 階梯看累積：再錯一次就是第 3 次，燈閃；卡關看連續：不會因此觸發 stuck
		const result = recordExecution(state, true, 600);
		expect(result.reactions).toEqual([{ type: "flicker" }]);
		expect(result.state.errorStreak).toBe(1);
	});

	it("打對不回傳反應，錯誤不更新 lastProgressAt", () => {
		const success = recordExecution(createPressureState(0), false, 100);
		expect(success.reactions).toEqual([]);

		const failure = recordExecution(success.state, true, 900);
		expect(failure.state.lastProgressAt).toBe(100);
	});

	it("不修改傳入的 state", () => {
		const state = createPressureState(0);
		const snapshot = { ...state };
		recordExecution(state, true, 10);
		recordExecution(state, false, 10);
		expect(state).toEqual(snapshot);
	});
});

describe("recordExecution：卡關偵測", () => {
	it("第 5 次連續錯誤回 stuck，第 10 次不再回", () => {
		const { state, reactionsByAttempt } = recordErrors(createPressureState(0), 10);
		const stuckAttempts = reactionsByAttempt
			.map((reactions, index) => ({ attempt: index + 1, reactions }))
			.filter(({ reactions }) => reactions.some((reaction) => reaction.type === "stuck"))
			.map(({ attempt }) => attempt);

		expect(stuckAttempts).toEqual([STUCK_ERROR_STREAK]);
		expect(state.stuckHintGiven).toBe(true);
	});

	it("中間打對會讓連續次數重來，第 5 次錯（不連續）不給提示", () => {
		let state = recordErrors(createPressureState(0), 4).state;
		state = recordExecution(state, false, 0).state;
		const result = recordExecution(state, true, 0);
		expect(result.reactions).toEqual([]);
	});

	it("階梯反應與 stuck 同時發生時，階梯在前", () => {
		// 累積 1 次，再連續錯 5 次：第 6 次累積（門聲）剛好也是第 5 次連續（卡關）
		let state = recordErrors(createPressureState(0), 1).state;
		state = recordExecution(state, false, 0).state;
		const { reactionsByAttempt } = recordErrors(state, 5);
		expect(reactionsByAttempt[4]).toEqual([{ type: "door" }, { type: "stuck" }]);
	});
});

describe("checkIdle", () => {
	it("未滿三分鐘不回反應", () => {
		const result = checkIdle(createPressureState(0), STUCK_IDLE_MS - 1);
		expect(result.reactions).toEqual([]);
		expect(result.state.stuckHintGiven).toBe(false);
	});

	it("滿三分鐘回 stuck 一次，之後不再回", () => {
		const first = checkIdle(createPressureState(0), STUCK_IDLE_MS);
		expect(first.reactions).toEqual([{ type: "stuck" }]);
		expect(first.state.stuckHintGiven).toBe(true);

		const second = checkIdle(first.state, STUCK_IDLE_MS * 2);
		expect(second.reactions).toEqual([]);
	});

	it("合法指令會把閒置計時往後推", () => {
		const state = recordExecution(createPressureState(0), false, 60_000).state;
		expect(checkIdle(state, STUCK_IDLE_MS).reactions).toEqual([]);
		expect(checkIdle(state, 60_000 + STUCK_IDLE_MS).reactions).toEqual([{ type: "stuck" }]);
	});

	it("閒置給過提示後，連續錯 5 次也不再給", () => {
		const idle = checkIdle(createPressureState(0), STUCK_IDLE_MS);
		const { reactionsByAttempt } = recordErrors(idle.state, STUCK_ERROR_STREAK, STUCK_IDLE_MS);
		const hasStuck = reactionsByAttempt.flat().some((reaction) => reaction.type === "stuck");
		expect(hasStuck).toBe(false);
	});

	it("不修改傳入的 state", () => {
		const state = createPressureState(0);
		checkIdle(state, STUCK_IDLE_MS);
		expect(state.stuckHintGiven).toBe(false);
	});
});

describe("resetPressure", () => {
	it("過關後全部歸零，卡關提示可以再給", () => {
		expect(resetPressure(5000)).toEqual({
			errorCount: 0,
			errorStreak: 0,
			lastProgressAt: 5000,
			stuckHintGiven: false,
		});
	});
});

describe("stuckLines", () => {
	it("有 onStuck 就用它（拷貝一份）", () => {
		const onStuck = ["技師，先看看周圍。"];
		const lines = stuckLines({ hints: ["第一段", "第二段"], nova: { onStuck } });
		expect(lines).toEqual(onStuck);
		expect(lines).not.toBe(onStuck);
	});

	it("沒有 onStuck 就用 NOVA 口吻接 hints[0]", () => {
		const lines = stuckLines({ hints: ["先搞清楚你在哪裡。", "第二段"] });
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/^技師，/);
		expect(lines[1]).toBe("先搞清楚你在哪裡。");
	});

	it("onStuck 是空陣列時也退回 hints[0]", () => {
		const lines = stuckLines({ hints: ["第一段"], nova: { onStuck: [] } });
		expect(lines).toContain("第一段");
	});
});

describe("novaErrorLine", () => {
	const chapterLines = ["一", "二", "三"];

	it("依 lineIndex 取章節台詞，超過長度取餘數", () => {
		expect(novaErrorLine(chapterLines, 0)).toBe("一");
		expect(novaErrorLine(chapterLines, 2)).toBe("三");
		expect(novaErrorLine(chapterLines, 3)).toBe("一");
		expect(novaErrorLine(chapterLines, 7)).toBe("二");
	});

	it("章節沒寫或是空陣列就用預設句", () => {
		expect(novaErrorLine(undefined, 0)).toBe(DEFAULT_NOVA_ERROR_LINES[0]);
		expect(novaErrorLine([], 1)).toBe(DEFAULT_NOVA_ERROR_LINES[1]);
		expect(novaErrorLine(undefined, DEFAULT_NOVA_ERROR_LINES.length)).toBe(DEFAULT_NOVA_ERROR_LINES[0]);
	});

	it("預設句有三到五句，第一句是「你確定你是技師？」，不指涉性別", () => {
		expect(DEFAULT_NOVA_ERROR_LINES.length).toBeGreaterThanOrEqual(3);
		expect(DEFAULT_NOVA_ERROR_LINES.length).toBeLessThanOrEqual(5);
		expect(DEFAULT_NOVA_ERROR_LINES[0]).toBe("你確定你是技師？");
		const gendered = DEFAULT_NOVA_ERROR_LINES.filter((line) => /[他她]|先生|小姐|女士|男性|女性/.test(line));
		expect(gendered).toEqual([]);
	});
});
