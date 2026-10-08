import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getChapter } from "@/game/chapters";
import { onGameEvent } from "@/game/phaser/EventBus";
import { introShownFlag, roomEnteredFlag, type ChapterDefinition, type TerminalDefinition } from "@/game/story";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { useNovaTriggers } from "./useNovaTriggers";

const CHAPTER_ONE = getChapter(1);
const CHAPTER_TWO = getChapter(2);
const CRYO = CHAPTER_ONE.terminals[0];
const LIFESUPPORT = CHAPTER_ONE.terminals[1];
const INTRO_ON_MAP = (CHAPTER_ONE.intro ?? []).slice(1);

const sounds: string[] = [];
let unsubscribe: () => void = () => {};

/** 預設已說過開場，避免 intro 混進佇列；要測開場的測試自己清旗標。 */
function seedFlags(flags: Record<string, true>): void {
	useGameStore.setState({ ...createInitialSaveData(), storyFlags: flags });
}

function renderTriggers(chapter: ChapterDefinition = CHAPTER_ONE) {
	return renderHook(() => useNovaTriggers(chapter));
}

function texts(queue: { text: string }[]): string[] {
	return queue.map((message) => message.text);
}

beforeEach(() => {
	seedFlags({ [introShownFlag(1)]: true, [introShownFlag(2)]: true });
	sounds.length = 0;
	unsubscribe = onGameEvent("sfx:play", ({ sound }) => {
		sounds.push(sound);
	});
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	unsubscribe();
	localStorage.clear();
});

describe("useNovaTriggers 開場", () => {
	it("第一章從 intro 第二句開始，並立 introShown 旗標", () => {
		seedFlags({});
		const { result } = renderTriggers();

		expect(texts(result.current.queue)).toEqual(INTRO_ON_MAP);
		expect(useGameStore.getState().storyFlags[introShownFlag(1)]).toBe(true);
	});

	it("其他章節整段 intro 都說", () => {
		seedFlags({});
		const { result } = renderTriggers(CHAPTER_TWO);
		expect(texts(result.current.queue)).toEqual(CHAPTER_TWO.intro);
	});

	it("旗標已立就不說，重新 render 也不會補說", () => {
		const { result, rerender } = renderTriggers();
		rerender();
		expect(result.current.queue).toEqual([]);
	});
});

describe("useNovaTriggers 進艙區", () => {
	it("第一次進房：回傳 true、立旗標、排進房台詞、播 nova-blip", () => {
		const { result } = renderTriggers();
		let firstVisit = false;
		act(() => {
			firstVisit = result.current.enterRoom("cryo");
		});

		expect(firstVisit).toBe(true);
		expect(useGameStore.getState().storyFlags[roomEnteredFlag(1, "cryo")]).toBe(true);
		expect(texts(result.current.queue)).toEqual(CRYO.nova?.onEnterRoom);
		expect(sounds).toEqual(["nova-blip"]);
	});

	it("再進同一間：回傳 false，不說話也不播音效", () => {
		const { result } = renderTriggers();
		act(() => {
			result.current.enterRoom("cryo");
		});
		act(() => {
			result.current.dismiss(result.current.queue[0].id);
		});
		let firstVisit = true;
		act(() => {
			firstVisit = result.current.enterRoom("cryo");
		});

		expect(firstVisit).toBe(false);
		expect(sounds).toEqual(["nova-blip"]);
		expect(result.current.queue).toHaveLength((CRYO.nova?.onEnterRoom?.length ?? 0) - 1);
	});

	it("旗標跨重整：存檔裡進過的艙區不再說", () => {
		seedFlags({ [introShownFlag(1)]: true, [roomEnteredFlag(1, "cryo")]: true });
		const { result } = renderTriggers();
		act(() => {
			result.current.enterRoom("cryo");
		});
		expect(result.current.queue).toEqual([]);
	});

	it("第一次進沒有終端機的艙區：回傳 true（可秀插圖卡）但不說話、不播音效", () => {
		const { result } = renderTriggers();
		let firstVisit = false;
		act(() => {
			firstVisit = result.current.enterRoom("corridor");
		});
		expect(firstVisit).toBe(true);
		expect(result.current.queue).toEqual([]);
		expect(sounds).toEqual([]);
	});

	it("換艙區丟掉舊房還沒播的進房台詞，正在顯示的那則與 intro 保留（#61）", () => {
		seedFlags({});
		const { result } = renderTriggers();
		act(() => {
			result.current.enterRoom("cryo");
		});
		act(() => {
			result.current.enterRoom("lifesupport");
		});

		expect(texts(result.current.queue)).toEqual([...INTRO_ON_MAP, ...(LIFESUPPORT.nova?.onEnterRoom ?? [])]);
		const missed = result.current.history.filter((entry) => entry.status === "missed");
		expect(texts(missed)).toEqual(CRYO.nova?.onEnterRoom);
	});

	it("再進已進過的艙區也會丟掉別間的舊台詞", () => {
		seedFlags({ [introShownFlag(1)]: true, [roomEnteredFlag(1, "lifesupport")]: true });
		const { result } = renderTriggers();
		act(() => {
			result.current.enterRoom("cryo");
		});
		act(() => {
			result.current.enterRoom("lifesupport");
		});
		// 冷凍艙第一句正在顯示所以留著，其餘丟掉
		expect(texts(result.current.queue)).toEqual([CRYO.nova?.onEnterRoom?.[0]]);
	});
});

describe("useNovaTriggers 過關台詞", () => {
	it("終端機關掉後只重說過關台詞的最後一句（#5）", () => {
		const { result } = renderTriggers();
		act(() => {
			result.current.deferSolvedLine(CRYO);
		});
		// 還沒關終端機，地圖上不說
		expect(result.current.queue).toEqual([]);

		act(() => {
			result.current.flushSolvedLine();
		});
		expect(result.current.queue).toEqual([{ id: "solved-ch1-t1-0", text: CRYO.nova?.onSolved?.at(-1) }]);
	});

	it("說過一次就清掉，再關一次不會重說", () => {
		const { result } = renderTriggers();
		act(() => {
			result.current.deferSolvedLine(CRYO);
		});
		act(() => {
			result.current.flushSolvedLine();
		});
		act(() => {
			result.current.dismiss("solved-ch1-t1-0");
		});
		act(() => {
			result.current.flushSolvedLine();
		});
		expect(result.current.queue).toEqual([]);
	});

	it("沒有過關台詞的終端機不記", () => {
		const silent: TerminalDefinition = { ...CRYO, nova: undefined };
		const { result } = renderTriggers();
		act(() => {
			result.current.deferSolvedLine(silent);
			result.current.flushSolvedLine();
		});
		expect(result.current.queue).toEqual([]);
	});

	it("沒過關就關終端機不說話", () => {
		const { result } = renderTriggers();
		act(() => {
			result.current.flushSolvedLine();
		});
		expect(result.current.queue).toEqual([]);
	});
});

describe("useNovaTriggers 穩定性", () => {
	it("佇列沒變時重新 render 回傳同一個物件", () => {
		const { result, rerender } = renderTriggers();
		const first = result.current;
		rerender();
		expect(result.current).toBe(first);
	});
});
