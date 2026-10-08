import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadPhaserGame } from "@/components/game/preloadPhaserGame";
import { openingSceneImages } from "@/game/story/scenes";
import { preloadImages } from "@/lib/preload";
import { PLAY_PREFETCH_DELAY_MS, usePlayPrefetch } from "./usePlayPrefetch";

const { prefetch } = vi.hoisted(() => ({ prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ prefetch, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/game/preloadPhaserGame", () => ({
	preloadPhaserGame: vi.fn(() => Promise.resolve()),
}));

// 排程用真的 scheduleIdle，只把真的下載圖片換掉
vi.mock("@/lib/preload", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/preload")>()),
	preloadImages: vi.fn(),
}));

beforeEach(() => {
	vi.useFakeTimers();
	// 走 setTimeout 退路，假時鐘才推得動
	vi.stubGlobal("requestIdleCallback", undefined);
	prefetch.mockClear();
	vi.mocked(preloadPhaserGame).mockClear();
	vi.mocked(preloadImages).mockClear();
});

// vitest 未啟用 globals，需手動卸載並還原
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("usePlayPrefetch", () => {
	it("標題動畫跑完後才在閒置時段預取 /play 與 Phaser 引擎，各一次", () => {
		renderHook(() => usePlayPrefetch(1));
		vi.advanceTimersByTime(PLAY_PREFETCH_DELAY_MS - 1);
		expect(prefetch).not.toHaveBeenCalled();
		expect(preloadPhaserGame).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(prefetch).toHaveBeenCalledTimes(1);
		expect(prefetch).toHaveBeenCalledWith("/play");
		expect(preloadPhaserGame).toHaveBeenCalledTimes(1);
	});

	it("Phaser 引擎排完後接著預載要進的那一章的插圖，第一章含開場插圖", async () => {
		renderHook(() => usePlayPrefetch(1));
		await vi.runAllTimersAsync();
		expect(preloadImages).toHaveBeenCalledTimes(1);
		expect(preloadImages).toHaveBeenCalledWith(openingSceneImages(1));
	});

	it("章節變了（新遊戲清回第一章、選章）就改載新章節的插圖", async () => {
		const { rerender } = renderHook(({ chapter }) => usePlayPrefetch(chapter), { initialProps: { chapter: 3 } });
		await vi.runAllTimersAsync();
		expect(preloadImages).toHaveBeenLastCalledWith(openingSceneImages(3));

		rerender({ chapter: 1 });
		await vi.runAllTimersAsync();
		expect(preloadImages).toHaveBeenLastCalledWith(openingSceneImages(1));
	});

	it("還沒排到就離開標題（例如馬上按繼續）不再預取", async () => {
		const { unmount } = renderHook(() => usePlayPrefetch(1));
		unmount();
		await vi.runAllTimersAsync();
		expect(prefetch).not.toHaveBeenCalled();
		expect(preloadPhaserGame).not.toHaveBeenCalled();
		expect(preloadImages).not.toHaveBeenCalled();
	});
});
