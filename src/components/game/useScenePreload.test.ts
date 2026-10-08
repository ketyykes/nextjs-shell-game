import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapterSceneImages } from "@/game/story/scenes";
import { preloadImages } from "@/lib/preload";
import { useScenePreload } from "./useScenePreload";

// 排程用真的 scheduleIdle，只把真的下載圖片換掉
vi.mock("@/lib/preload", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/preload")>()),
	preloadImages: vi.fn(),
}));

beforeEach(() => {
	vi.useFakeTimers();
	// 走 setTimeout 退路，假時鐘才推得動
	vi.stubGlobal("requestIdleCallback", undefined);
	vi.mocked(preloadImages).mockClear();
});

// vitest 未啟用 globals，需手動卸載並還原
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("useScenePreload", () => {
	it("進 /play 一掛載就在閒置時段排本章插圖，不等 scene:ready（第一間房的插圖卡跟它幾乎同時出現）", () => {
		renderHook(() => useScenePreload(2));
		expect(preloadImages).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(preloadImages).toHaveBeenCalledTimes(1);
		expect(preloadImages).toHaveBeenCalledWith(chapterSceneImages(2));
	});

	it("排到之前就卸載不預載", () => {
		const { unmount } = renderHook(() => useScenePreload(1));
		unmount();
		vi.runAllTimers();
		expect(preloadImages).not.toHaveBeenCalled();
	});
});
