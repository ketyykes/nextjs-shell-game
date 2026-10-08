import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadOnce, scheduleIdle } from "./preload";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("scheduleIdle", () => {
	it("有 requestIdleCallback 時等主執行緒閒下來才跑，並帶最長等待時間", () => {
		const callbacks: Array<() => void> = [];
		const requestIdleCallback = vi.fn((callback: () => void) => {
			callbacks.push(callback);
			return callbacks.length;
		});
		vi.stubGlobal("requestIdleCallback", requestIdleCallback);
		vi.stubGlobal("cancelIdleCallback", vi.fn());
		const task = vi.fn();

		scheduleIdle(task, { timeoutMs: 2000 });
		expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
		expect(task).not.toHaveBeenCalled();

		callbacks[0]();
		expect(task).toHaveBeenCalledTimes(1);
	});

	it("有 delayMs 時先等這段時間再排進閒置時段", () => {
		const callbacks: Array<() => void> = [];
		vi.stubGlobal(
			"requestIdleCallback",
			vi.fn((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}),
		);
		vi.stubGlobal("cancelIdleCallback", vi.fn());
		const task = vi.fn();

		scheduleIdle(task, { delayMs: 1000 });
		vi.advanceTimersByTime(999);
		expect(callbacks).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(callbacks).toHaveLength(1);
		callbacks[0]();
		expect(task).toHaveBeenCalledTimes(1);
	});

	it("沒有 requestIdleCallback（Safari）時退回 setTimeout", () => {
		vi.stubGlobal("requestIdleCallback", undefined);
		const task = vi.fn();

		scheduleIdle(task);
		expect(task).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(task).toHaveBeenCalledTimes(1);
	});

	it("取消後不會執行，不論卡在延遲還是閒置排程", () => {
		const callbacks: Array<() => void> = [];
		const cancelIdleCallback = vi.fn();
		vi.stubGlobal(
			"requestIdleCallback",
			vi.fn((callback: () => void) => {
				callbacks.push(callback);
				return 7;
			}),
		);
		vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);
		const delayedTask = vi.fn();
		const idleTask = vi.fn();

		const cancelDelayed = scheduleIdle(delayedTask, { delayMs: 500 });
		cancelDelayed();
		vi.runAllTimers();
		expect(callbacks).toHaveLength(0);

		const cancelIdle = scheduleIdle(idleTask);
		cancelIdle();
		expect(cancelIdleCallback).toHaveBeenCalledWith(7);
		expect(idleTask).not.toHaveBeenCalled();
	});
});

describe("preloadOnce", () => {
	it("重複呼叫只載入一次，回傳同一個 Promise", async () => {
		const load = vi.fn(() => Promise.resolve({}));
		const preload = preloadOnce(load);

		const first = preload();
		const second = preload();
		expect(second).toBe(first);
		await first;
		preload();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("載入失敗不丟出例外，下次呼叫會重試", async () => {
		const load = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error("ChunkLoadError")).mockResolvedValue({});
		const preload = preloadOnce(load);

		await expect(preload()).resolves.toBeUndefined();
		await expect(preload()).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledTimes(2);
	});
});
