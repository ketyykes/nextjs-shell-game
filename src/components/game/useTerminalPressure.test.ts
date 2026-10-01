import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUCK_IDLE_MS } from "@/game/story/pressure";
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

	it("推進三分鐘收到 stuck 一次，之後不再收到", () => {
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

	it("關掉再開同一台不重複給卡關提示，reset 之後才會再給", () => {
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
		expect(reactionTypes(onReaction)).toEqual(["stuck", "stuck"]);
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
		expect(second).toHaveBeenCalledExactlyOnceWith({ type: "stuck" });
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
});
