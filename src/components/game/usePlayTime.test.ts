import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { MAX_PLAY_TIME_STEP_MS, PLAY_TIME_FLUSH_MS, usePlayTime } from "./usePlayTime";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState): void {
	visibility = next;
	document.dispatchEvent(new Event("visibilitychange"));
}

function playTimeOf(chapter: number): number {
	return useGameStore.getState().stats[String(chapter)]?.playTimeMs ?? 0;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2031-03-12T08:00:00.000Z"));
	visibility = "visible";
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
	useGameStore.setState(createInitialSaveData());
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("usePlayTime", () => {
	it("前景可見時累計，卸載時把剩下的時間寫進該章統計", () => {
		const { unmount } = renderHook(() => usePlayTime(2, true));

		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		unmount();

		expect(playTimeOf(2)).toBe(10_000);
	});

	it("每隔一段時間寫一次，不必等到卸載", () => {
		renderHook(() => usePlayTime(1, true));

		act(() => {
			vi.advanceTimersByTime(PLAY_TIME_FLUSH_MS);
		});

		expect(playTimeOf(1)).toBe(PLAY_TIME_FLUSH_MS);
	});

	it("分頁切到背景的時間不算", () => {
		const { unmount } = renderHook(() => usePlayTime(1, true));

		act(() => {
			vi.advanceTimersByTime(5_000);
			setVisibility("hidden");
			vi.advanceTimersByTime(60_000);
			setVisibility("visible");
			vi.advanceTimersByTime(5_000);
		});
		unmount();

		expect(playTimeOf(1)).toBe(10_000);
	});

	it("不在計時狀態（章節已全解、選單開著）就不算，從計時切到不計時會先把累計的寫進去", () => {
		const { rerender, unmount } = renderHook(({ active }) => usePlayTime(1, active), {
			initialProps: { active: true },
		});

		act(() => {
			vi.advanceTimersByTime(3_000);
		});
		rerender({ active: false });
		expect(playTimeOf(1)).toBe(3_000);

		act(() => {
			vi.advanceTimersByTime(60_000);
		});
		unmount();

		expect(playTimeOf(1)).toBe(3_000);
	});

	it("一開始就在背景（例如重新整理時分頁不在前景）不算", () => {
		visibility = "hidden";
		const { unmount } = renderHook(() => usePlayTime(1, true));

		act(() => {
			vi.advanceTimersByTime(20_000);
		});
		unmount();

		expect(playTimeOf(1)).toBe(0);
	});

	it("頁面卸載前（pagehide，例如換章整頁重載）把時間寫進去", () => {
		renderHook(() => usePlayTime(3, true));

		act(() => {
			vi.advanceTimersByTime(4_000);
			window.dispatchEvent(new Event("pagehide"));
		});

		expect(playTimeOf(3)).toBe(4_000);
	});

	it("兩次寫入之間時鐘跳太多（電腦睡眠）時只算上限", () => {
		const { unmount } = renderHook(() => usePlayTime(1, true));

		vi.setSystemTime(Date.now() + 3_600_000);
		unmount();

		expect(playTimeOf(1)).toBe(MAX_PLAY_TIME_STEP_MS);
	});
});
