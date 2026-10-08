import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUCK_IDLE_MS, STUCK_REPEAT_MS } from "@/game/story/pressure";
import type { PressureReaction } from "@/game/story/pressure";
import { useTerminalPressure } from "./useTerminalPressure";

interface HookProps {
	terminalId: string | null;
	initialErrorCount: number;
}

/** 建立 hook 與兩個 spy，props 可以用 rerender 換。 */
function setup(initialProps: HookProps) {
	const onReaction = vi.fn<(reaction: PressureReaction) => void>();
	const onErrorCountChange = vi.fn<(count: number) => void>();
	const rendered = renderHook(
		(props: HookProps) =>
			useTerminalPressure({
				terminalId: props.terminalId,
				initialErrorCount: props.initialErrorCount,
				onReaction,
				onErrorCountChange,
			}),
		{ initialProps },
	);
	return { ...rendered, onReaction, onErrorCountChange };
}

/** 收集 onReaction 收到的反應類型。 */
function reactionTypes(onReaction: ReturnType<typeof vi.fn<(reaction: PressureReaction) => void>>): string[] {
	return onReaction.mock.calls.map(([reaction]) => reaction.type);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("useTerminalPressure", () => {
	it("錯 3 次收到 flicker，並回報累積次數", () => {
		const { result, onReaction, onErrorCountChange } = setup({ terminalId: "ch1-t1", initialErrorCount: 0 });

		act(() => {
			result.current.recordExecution(true);
			result.current.recordExecution(true);
		});
		expect(onReaction).not.toHaveBeenCalled();

		act(() => {
			result.current.recordExecution(true);
		});
		expect(onReaction).toHaveBeenCalledExactlyOnceWith({ type: "flicker" });
		expect(onErrorCountChange).toHaveBeenLastCalledWith(3);
		expect(onErrorCountChange).toHaveBeenCalledTimes(3);
	});

	it("打對不回報累積次數", () => {
		const { result, onErrorCountChange } = setup({ terminalId: "ch1-t1", initialErrorCount: 2 });
		act(() => {
			result.current.recordExecution(false);
		});
		expect(onErrorCountChange).not.toHaveBeenCalled();
	});

	it("推進三分鐘收到 stuck 一次，之後沒打指令就不再收到", () => {
		const { onReaction } = setup({ terminalId: "ch1-t2", initialErrorCount: 0 });

		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS - 10_000);
		});
		expect(onReaction).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(reactionTypes(onReaction)).toEqual(["stuck"]);

		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS * 2);
		});
		expect(reactionTypes(onReaction)).toEqual(["stuck"]);
	});

	it("一直打合法但沒過關的指令，三分鐘時照樣收到第一次 stuck", () => {
		const { result, onReaction } = setup({ terminalId: "ch1-t2", initialErrorCount: 0 });

		for (let elapsed = 0; elapsed < STUCK_IDLE_MS; elapsed += 30_000) {
			act(() => {
				result.current.recordExecution(false);
				vi.advanceTimersByTime(30_000);
			});
		}

		expect(onReaction.mock.calls.map(([reaction]) => reaction)).toEqual([{ type: "stuck", repeat: false }]);
	});

	it("輸入 hint 會把閒置計時往後推", () => {
		const { result, onReaction } = setup({ terminalId: "ch1-t2", initialErrorCount: 0 });

		act(() => {
			vi.advanceTimersByTime(60_000);
			result.current.recordExecution(false, true);
			vi.advanceTimersByTime(STUCK_IDLE_MS - 20_000);
		});
		expect(onReaction).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(20_000);
		});
		expect(reactionTypes(onReaction)).toEqual(["stuck"]);
	});

	it("給過提示後還在打指令，隔 STUCK_REPEAT_MS 收到重複提醒", () => {
		const { result, onReaction } = setup({ terminalId: "ch1-t2", initialErrorCount: 0 });

		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS);
		});
		act(() => {
			result.current.recordExecution(false);
			vi.advanceTimersByTime(STUCK_REPEAT_MS);
		});

		expect(onReaction.mock.calls.map(([reaction]) => reaction)).toEqual([
			{ type: "stuck", repeat: false },
			{ type: "stuck", repeat: true },
		]);
	});

	it("terminalId 變成 null 後推進時間不再有反應，記錄執行也不做事", () => {
		const { result, rerender, onReaction, onErrorCountChange } = setup({
			terminalId: "ch1-t1",
			initialErrorCount: 0,
		});

		rerender({ terminalId: null, initialErrorCount: 0 });
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS * 2);
			result.current.recordExecution(true);
		});

		expect(onReaction).not.toHaveBeenCalled();
		expect(onErrorCountChange).not.toHaveBeenCalled();
	});

	it("換終端機時用新的 initialErrorCount 接著算", () => {
		const { result, rerender, onReaction, onErrorCountChange } = setup({
			terminalId: "ch1-t1",
			initialErrorCount: 0,
		});
		act(() => {
			result.current.recordExecution(true);
		});
		expect(onErrorCountChange).toHaveBeenLastCalledWith(1);

		rerender({ terminalId: "ch1-t2", initialErrorCount: 5 });
		act(() => {
			result.current.recordExecution(true);
		});

		expect(onErrorCountChange).toHaveBeenLastCalledWith(6);
		expect(reactionTypes(onReaction)).toEqual(["door"]);
	});

	it("同一台的 initialErrorCount 因存檔回寫而變動時不重建狀態", () => {
		const { result, rerender, onErrorCountChange } = setup({ terminalId: "ch1-t1", initialErrorCount: 0 });
		act(() => {
			result.current.recordExecution(true);
		});
		rerender({ terminalId: "ch1-t1", initialErrorCount: 1 });
		act(() => {
			result.current.recordExecution(true);
		});
		expect(onErrorCountChange).toHaveBeenLastCalledWith(2);
	});

	it("關掉再開同一台不重給第一次的卡關提示，reset 之後才會再給", () => {
		const { result, rerender, onReaction } = setup({ terminalId: "ch1-t3", initialErrorCount: 0 });
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS);
		});
		expect(reactionTypes(onReaction)).toEqual(["stuck"]);

		rerender({ terminalId: null, initialErrorCount: 0 });
		rerender({ terminalId: "ch1-t3", initialErrorCount: 0 });
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS);
		});
		expect(reactionTypes(onReaction)).toEqual(["stuck"]);

		act(() => {
			result.current.reset();
		});
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS);
		});
		expect(onReaction.mock.calls.map(([reaction]) => reaction)).toEqual([
			{ type: "stuck", repeat: false },
			{ type: "stuck", repeat: false },
		]);
	});

	it("關掉再開同一台後有打指令，隔 STUCK_REPEAT_MS 給的是重複提醒", () => {
		const { result, rerender, onReaction } = setup({ terminalId: "ch1-t3", initialErrorCount: 0 });
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS);
		});

		rerender({ terminalId: null, initialErrorCount: 0 });
		rerender({ terminalId: "ch1-t3", initialErrorCount: 0 });
		act(() => {
			result.current.recordExecution(false);
			vi.advanceTimersByTime(STUCK_REPEAT_MS);
		});

		expect(onReaction.mock.calls.map(([reaction]) => reaction)).toEqual([
			{ type: "stuck", repeat: false },
			{ type: "stuck", repeat: true },
		]);
	});

	it("reset 歸零並回報 0，之後重新從第 1 次算", () => {
		const { result, onReaction, onErrorCountChange } = setup({ terminalId: "ch1-t1", initialErrorCount: 2 });
		act(() => {
			result.current.reset();
		});
		expect(onErrorCountChange).toHaveBeenLastCalledWith(0);

		act(() => {
			result.current.recordExecution(true);
		});
		expect(onErrorCountChange).toHaveBeenLastCalledWith(1);
		expect(onReaction).not.toHaveBeenCalled();
	});

	it("callback 換新的之後，interval 呼叫的是新的", () => {
		const first = vi.fn<(reaction: PressureReaction) => void>();
		const second = vi.fn<(reaction: PressureReaction) => void>();
		const onErrorCountChange = vi.fn<(count: number) => void>();
		const { rerender } = renderHook(
			(props: { onReaction: (reaction: PressureReaction) => void }) =>
				useTerminalPressure({
					terminalId: "ch1-t1",
					initialErrorCount: 0,
					onReaction: props.onReaction,
					onErrorCountChange,
				}),
			{ initialProps: { onReaction: first } },
		);

		rerender({ onReaction: second });
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS);
		});
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledExactlyOnceWith({ type: "stuck", repeat: false });
	});

	it("卸載後清掉 interval", () => {
		const { unmount, onReaction } = setup({ terminalId: "ch1-t1", initialErrorCount: 0 });
		unmount();
		act(() => {
			vi.advanceTimersByTime(STUCK_IDLE_MS * 2);
		});
		expect(onReaction).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("重新 render（換初始次數或終端機）都回傳同一個物件（A19）", () => {
		const { result, rerender } = setup({ terminalId: "ch1-t1", initialErrorCount: 0 });
		const first = result.current;
		rerender({ terminalId: "ch1-t1", initialErrorCount: 2 });
		expect(result.current).toBe(first);
		rerender({ terminalId: null, initialErrorCount: 0 });
		expect(result.current).toBe(first);
	});
});
