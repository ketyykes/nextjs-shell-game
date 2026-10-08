import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadPhaserGame } from "@/components/game/preloadPhaserGame";
import { PLAY_PREFETCH_DELAY_MS, usePlayPrefetch } from "./usePlayPrefetch";

const { prefetch } = vi.hoisted(() => ({ prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ prefetch, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/game/preloadPhaserGame", () => ({
	preloadPhaserGame: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
	vi.useFakeTimers();
	// 走 setTimeout 退路，假時鐘才推得動
	vi.stubGlobal("requestIdleCallback", undefined);
	prefetch.mockClear();
	vi.mocked(preloadPhaserGame).mockClear();
});

// vitest 未啟用 globals，需手動卸載並還原
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("usePlayPrefetch", () => {
	it("標題動畫跑完後才在閒置時段預取 /play 與 Phaser 引擎，各一次", () => {
		renderHook(() => usePlayPrefetch());
		vi.advanceTimersByTime(PLAY_PREFETCH_DELAY_MS - 1);
		expect(prefetch).not.toHaveBeenCalled();
		expect(preloadPhaserGame).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(prefetch).toHaveBeenCalledTimes(1);
		expect(prefetch).toHaveBeenCalledWith("/play");
		expect(preloadPhaserGame).toHaveBeenCalledTimes(1);
	});

	it("還沒排到就離開標題（例如馬上按繼續）不再預取", () => {
		const { unmount } = renderHook(() => usePlayPrefetch());
		unmount();
		vi.runAllTimers();
		expect(prefetch).not.toHaveBeenCalled();
		expect(preloadPhaserGame).not.toHaveBeenCalled();
	});
});
