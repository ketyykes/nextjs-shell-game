import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import { onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventName } from "@/game/phaser/events";
import type { TerminalDefinition } from "@/game/story";
import { novaErrorLine, STUCK_REMINDER_LINES, STUCK_REPEAT_MS, stuckLines } from "@/game/story/pressure";
import { createInitialSaveData, useGameStore } from "@/game/store";
import type { OutputEntry } from "@/game/store/types";
import { resolveShell } from "./useTerminalSessions";
import { usePressureReactions } from "./usePressureReactions";

const CHAPTER_ONE = getChapter(1);
const CRYO = CHAPTER_ONE.terminals[0];

interface HookProps {
	openTerminal: TerminalDefinition | null;
	solvedTerminals: string[];
}

const events: { name: GameEventName; payload: unknown }[] = [];
const unsubscribers: (() => void)[] = [];

function setup(initialProps: HookProps = { openTerminal: CRYO, solvedTerminals: [] }) {
	return renderHook((props: HookProps) => usePressureReactions({ chapter: CHAPTER_ONE, ...props }), { initialProps });
}

function transcript(): OutputEntry[] {
	return useGameStore.getState().terminals[CRYO.id]?.transcript ?? [];
}

function dialogueTexts(): string[] {
	return transcript().flatMap((entry) => (entry.kind === "dialogue" ? [entry.text] : []));
}

function recordErrors(record: (isError: boolean) => void, count: number): void {
	act(() => {
		for (let index = 0; index < count; index += 1) {
			record(true);
		}
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	useGameStore.setState(createInitialSaveData());
	// 開終端機時一定先有 session，計數與台詞才有地方掛
	resolveShell(new Map(), CRYO);
	events.length = 0;
	for (const name of ["ambient:flicker", "sfx:play"] as const) {
		unsubscribers.push(onGameEvent(name, (payload) => events.push({ name, payload })));
	}
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	for (const unsubscribe of unsubscribers.splice(0)) {
		unsubscribe();
	}
	vi.useRealTimers();
	localStorage.clear();
});

describe("usePressureReactions", () => {
	it("錯 3 次燈閃，累積次數存進 store", () => {
		const { result } = setup();
		recordErrors(result.current.recordExecution, 3);

		expect(events).toEqual([{ name: "ambient:flicker", payload: { durationMs: expect.any(Number) } }]);
		expect(useGameStore.getState().terminals[CRYO.id]?.errorCount).toBe(3);
	});

	it("設定關閉閃爍時不發燈閃", () => {
		useGameStore.getState().updateSettings({ flickerEnabled: false });
		const { result } = setup();
		recordErrors(result.current.recordExecution, 3);
		expect(events).toEqual([]);
	});

	it("錯 6 次播門聲", () => {
		const { result } = setup();
		recordErrors(result.current.recordExecution, 6);
		expect(events).toContainEqual({ name: "sfx:play", payload: { sound: "door" } });
	});

	it("連錯 5 次 NOVA 在終端機內嵌第一次的卡關台詞", () => {
		const { result } = setup();
		recordErrors(result.current.recordExecution, 5);
		expect(dialogueTexts()).toEqual(stuckLines(CRYO));
	});

	it("錯 9 次 NOVA 在終端機內嵌錯誤台詞", () => {
		const { result } = setup();
		// 第 5 次的卡關台詞之後，再錯到第 9 次
		recordErrors(result.current.recordExecution, 9);
		expect(dialogueTexts()).toContain(novaErrorLine(CHAPTER_ONE.novaErrorLines, 0));
	});

	it("錯 9 次 NOVA 說話那一刻播一次低語（4.25），3 次、6 次不播", () => {
		const { result } = setup();
		const whispers = () => events.filter((event) => event.name === "sfx:play" && (event.payload as { sound: string }).sound === "whisper");
		recordErrors(result.current.recordExecution, 8);
		expect(whispers()).toEqual([]);
		recordErrors(result.current.recordExecution, 1);
		expect(whispers()).toHaveLength(1);
	});

	it("卡關提示給過之後，隔了重複提醒間隔再卡住改插系統行提示 hint", () => {
		const { result } = setup();
		recordErrors(result.current.recordExecution, 5);
		act(() => {
			vi.advanceTimersByTime(STUCK_REPEAT_MS);
		});
		recordErrors(result.current.recordExecution, 5);

		const reminders = transcript().filter((entry) => entry.kind === "system" && entry.id.startsWith("stuck-reminder-"));
		expect(reminders).toHaveLength(1);
		expect(reminders[0]).toMatchObject({ lines: STUCK_REMINDER_LINES });
	});

	it("已過關的終端機不計數", () => {
		const { result } = setup({ openTerminal: CRYO, solvedTerminals: [CRYO.id] });
		recordErrors(result.current.recordExecution, 5);
		expect(events).toEqual([]);
		expect(dialogueTexts()).toEqual([]);
	});

	it("終端機關著不計數", () => {
		const { result } = setup({ openTerminal: null, solvedTerminals: [] });
		recordErrors(result.current.recordExecution, 3);
		expect(events).toEqual([]);
	});

	it("重新開啟時接續存檔裡的累積次數", () => {
		useGameStore.getState().setTerminalErrorCount(CRYO.id, 2);
		const { result } = setup();
		recordErrors(result.current.recordExecution, 1);
		expect(events).toEqual([{ name: "ambient:flicker", payload: { durationMs: expect.any(Number) } }]);
	});

	it("過關 reset 把存檔的累積次數歸零", () => {
		const { result } = setup();
		recordErrors(result.current.recordExecution, 2);
		act(() => {
			result.current.reset();
		});
		expect(useGameStore.getState().terminals[CRYO.id]?.errorCount).toBe(0);
	});
});

describe("usePressureReactions：第六章 NOVA 被終止之後（4.14）", () => {
	const CHAPTER_SIX = getChapter(6);
	const SCHEDULER = CHAPTER_SIX.terminals[4];
	const CORE = CHAPTER_SIX.terminals[3];

	function sixDialogues(terminalId: string): string[] {
		const entries = useGameStore.getState().terminals[terminalId]?.transcript ?? [];
		return entries.flatMap((entry) => (entry.kind === "dialogue" ? [entry.text] : []));
	}

	it("T4 過關後的終端機錯 9 次：不說 NOVA 的錯誤台詞，燈閃與門聲照舊", () => {
		resolveShell(new Map(), SCHEDULER);
		const { result } = renderHook(() =>
			usePressureReactions({
				chapter: CHAPTER_SIX,
				openTerminal: SCHEDULER,
				solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3", "ch6-t4"],
			}),
		);

		recordErrors(result.current.recordExecution, 9);

		expect(sixDialogues(SCHEDULER.id)).not.toContain(novaErrorLine(CHAPTER_SIX.novaErrorLines, 0));
		// 第一次卡關是這台劇本寫好的系統自動回覆，照舊
		expect(sixDialogues(SCHEDULER.id)).toEqual(stuckLines(SCHEDULER));
		expect(events.map((event) => event.name)).toEqual(["ambient:flicker", "sfx:play"]);
	});

	it("T4 過關前，核心控制台錯 9 次照樣說", () => {
		resolveShell(new Map(), CORE);
		const { result } = renderHook(() =>
			usePressureReactions({
				chapter: CHAPTER_SIX,
				openTerminal: CORE,
				solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3"],
			}),
		);

		recordErrors(result.current.recordExecution, 9);

		expect(sixDialogues(CORE.id)).toContain(novaErrorLine(CHAPTER_SIX.novaErrorLines, 0));
	});
});
