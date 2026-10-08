import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import { onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventName } from "@/game/phaser/events";
import type { Shell } from "@/game/shell/shell";
import type { TerminalDefinition } from "@/game/story";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { resolveShell } from "./useTerminalSessions";
import { SOLVED_FLASH_MS, useSolveFlow } from "./useSolveFlow";
import type { UseTerminalPressureResult } from "./useTerminalPressure";

const CHAPTER_ONE = getChapter(1);
const CRYO = CHAPTER_ONE.terminals[0];

const events: { name: GameEventName; payload: unknown }[] = [];
const unsubscribers: (() => void)[] = [];

function createPressure() {
	return {
		recordExecution: vi.fn<UseTerminalPressureResult["recordExecution"]>(),
		reset: vi.fn<UseTerminalPressureResult["reset"]>(),
	};
}

function setup() {
	const pressure = createPressure();
	const onSolved = vi.fn<(definition: TerminalDefinition) => void>();
	const rendered = renderHook(() => useSolveFlow({ pressure, onSolved }));
	return { ...rendered, pressure, onSolved };
}

/** 在 shell 上執行一行，再交給 handleExecuted，模擬 TerminalModal 的流程。 */
function run(
	handleExecuted: ReturnType<typeof useSolveFlow>["handleExecuted"],
	definition: TerminalDefinition,
	shell: Shell,
	command: string,
): void {
	const execution = shell.execute(command);
	act(() => {
		handleExecuted(definition, shell, execution);
	});
}

function eventsNamed(name: GameEventName): unknown[] {
	return events.filter((event) => event.name === name).map((event) => event.payload);
}

beforeEach(() => {
	vi.useFakeTimers();
	useGameStore.setState(createInitialSaveData());
	events.length = 0;
	for (const name of ["sfx:play", "puzzle:solved"] as const) {
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

describe("useSolveFlow", () => {
	it("每道指令播一次按鍵聲，未過關的終端機記進卡關計數", () => {
		const { result, pressure } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "pwd");
		run(result.current.handleExecuted, CRYO, shell, "hint");

		expect(eventsNamed("sfx:play")).toEqual([{ sound: "key" }, { sound: "key" }]);
		expect(pressure.recordExecution.mock.calls).toEqual([
			[false, false],
			[false, true],
		]);
	});

	it("錯誤扣 1% 氧氣，不過關", () => {
		const { result, pressure, onSolved } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "nosuchcommand");

		expect(useGameStore.getState().progress.oxygen).toBe(99);
		expect(pressure.recordExecution).toHaveBeenCalledWith(true, false);
		expect(onSolved).not.toHaveBeenCalled();
	});

	it("達成目標：卡關歸零、記錄過關、回氧、學指令、存檔、發 puzzle:solved 與過關音效", () => {
		useGameStore.setState({ progress: { ...useGameStore.getState().progress, oxygen: 70 } });
		const { result, pressure, onSolved } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "cat wake_up.txt");

		const { progress } = useGameStore.getState();
		expect(pressure.reset).toHaveBeenCalledTimes(1);
		expect(progress.solvedTerminals).toEqual([CRYO.id]);
		expect(progress.oxygen).toBe(100);
		expect(progress.learnedCommands).toEqual(CRYO.teaches);
		expect(progress.savedAt).not.toBeNull();
		expect(shell.learnedCommands).toEqual(expect.arrayContaining(["pwd", "ls", "cat"]));
		expect(eventsNamed("puzzle:solved")).toEqual([{ terminalId: CRYO.id }]);
		expect(eventsNamed("sfx:play")).toEqual([{ sound: "key" }, { sound: "power" }]);
		expect(onSolved).toHaveBeenCalledExactlyOnceWith(CRYO);
	});

	it("過關後終端機先插「目標達成」，再接 NOVA 過關台詞", () => {
		const { result } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "cat wake_up.txt");

		const transcript = useGameStore.getState().terminals[CRYO.id]?.transcript ?? [];
		const tail = transcript.slice(-(1 + (CRYO.nova?.onSolved?.length ?? 0)));
		expect(tail[0]).toMatchObject({ kind: "system", tone: "success", id: `objective-done-${CRYO.id}` });
		expect(tail.slice(1).map((entry) => (entry.kind === "dialogue" ? entry.text : ""))).toEqual(CRYO.nova?.onSolved);
	});

	it("目標面板打勾 SOLVED_FLASH_MS 後回到 null", () => {
		const { result } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "cat wake_up.txt");
		expect(result.current.justSolvedId).toBe(CRYO.id);

		act(() => {
			vi.advanceTimersByTime(SOLVED_FLASH_MS);
		});
		expect(result.current.justSolvedId).toBeNull();
	});

	it("powerRestored 演出的終端機不在過關當下播 power（交給 Station 亮燈時播）", () => {
		const powerTerminal: TerminalDefinition = { ...CRYO, effect: { kind: "powerRestored" } };
		const { result } = setup();
		const shell = resolveShell(new Map(), powerTerminal);
		run(result.current.handleExecuted, powerTerminal, shell, "cat wake_up.txt");

		expect(eventsNamed("puzzle:solved")).toEqual([{ terminalId: CRYO.id }]);
		expect(eventsNamed("sfx:play")).toEqual([{ sound: "key" }]);
	});

	it("已過關的終端機：不計卡關、不重複過關，但打錯照樣扣氧", () => {
		useGameStore.getState().markTerminalSolved(CRYO.id);
		const { result, pressure, onSolved } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "cat wake_up.txt");
		run(result.current.handleExecuted, CRYO, shell, "nosuchcommand");

		expect(pressure.recordExecution).not.toHaveBeenCalled();
		expect(onSolved).not.toHaveBeenCalled();
		expect(eventsNamed("puzzle:solved")).toEqual([]);
		expect(useGameStore.getState().progress.oxygen).toBe(99);
	});

	it("handleExecuted 在重新 render 後維持同一個函式", () => {
		const { result, rerender } = setup();
		const first = result.current.handleExecuted;
		rerender();
		expect(result.current.handleExecuted).toBe(first);
	});

	it("錯誤與 hint 記進目前章節的遊玩統計，過關後打錯也算（M14-1）", () => {
		useGameStore.setState({ progress: { ...useGameStore.getState().progress, chapter: 1 } });
		const { result } = setup();
		const shell = resolveShell(new Map(), CRYO);
		run(result.current.handleExecuted, CRYO, shell, "notacommand");
		run(result.current.handleExecuted, CRYO, shell, "hint");
		run(result.current.handleExecuted, CRYO, shell, "cat wake_up.txt");
		run(result.current.handleExecuted, CRYO, shell, "notacommand");

		expect(useGameStore.getState().stats["1"]).toEqual({ playTimeMs: 0, errors: 2, hints: 1 });
	});
});
