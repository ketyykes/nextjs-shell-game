import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImagePreloader, preloadOnce, scheduleIdle } from "./preload";

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

/** 假的 HTMLImageElement：記下設定，測試自己決定什麼時候載完。 */
interface FakeImage {
	src: string;
	fetchPriority: string;
	decoding: string;
	onload: (() => void) | null;
	onerror: (() => void) | null;
}

function createFakeImages() {
	const images: FakeImage[] = [];
	function createImage(): HTMLImageElement {
		const image: FakeImage = { src: "", fetchPriority: "auto", decoding: "auto", onload: null, onerror: null };
		images.push(image);
		return image as unknown as HTMLImageElement;
	}
	return { images, createImage };
}

describe("createImagePreloader", () => {
	it("依清單順序一次只下載一張，前一張載完或失敗才換下一張", () => {
		const { images, createImage } = createFakeImages();
		const preloader = createImagePreloader(createImage);

		preloader.preload(["/a.png", "/b.png", "/c.png"]);
		expect(images.map((image) => image.src)).toEqual(["/a.png"]);

		images[0].onload?.();
		expect(images.map((image) => image.src)).toEqual(["/a.png", "/b.png"]);

		// 失敗也要繼續載下一張，不能卡住佇列
		images[1].onerror?.();
		expect(images.map((image) => image.src)).toEqual(["/a.png", "/b.png", "/c.png"]);
	});

	it("同一張圖只載一次，排隊中的也不重複排", () => {
		const { images, createImage } = createFakeImages();
		const preloader = createImagePreloader(createImage);

		preloader.preload(["/a.png", "/b.png"]);
		preloader.preload(["/b.png", "/a.png", "/c.png"]);
		images[0].onload?.();
		images[1].onload?.();
		images[2].onload?.();
		preloader.preload(["/c.png"]);
		expect(images.map((image) => image.src)).toEqual(["/a.png", "/b.png", "/c.png"]);
	});

	it("設成低優先、非同步解碼，不跟主要資源搶頻寬", () => {
		const { images, createImage } = createFakeImages();
		createImagePreloader(createImage).preload(["/a.png"]);
		expect(images[0].fetchPriority).toBe("low");
		expect(images[0].decoding).toBe("async");
	});
});

