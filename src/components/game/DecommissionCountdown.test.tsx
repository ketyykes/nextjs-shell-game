import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import type { PlayStats, ProgressState } from "@/game/store/types";
import { DecommissionCountdown } from "./DecommissionCountdown";
import { usePlayTime } from "./usePlayTime";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState): void {
	act(() => {
		visibility = next;
		document.dispatchEvent(new Event("visibilitychange"));
	});
}

function advance(ms: number): void {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

function seed(progress: Partial<ProgressState> = {}, stats: PlayStats = {}, flags: string[] = []): void {
	const initial = createInitialSaveData();
	const storyFlags: Record<string, true> = {};
	for (const flag of flags) {
		storyFlags[flag] = true;
	}
	useGameStore.setState({
		...initial,
		progress: { ...initial.progress, character: "a", ...progress },
		stats,
		storyFlags,
	});
}

function label(): string {
	return screen.getByTestId("countdown-label").textContent ?? "";
}

function value(): string {
	return screen.getByTestId("countdown-value").textContent ?? "";
}

/** 跟 PlayScreen 一樣：同一個「遊戲時間在走」條件同時給計時 hook 與倒數。 */
function WithPlayTime({ chapter, running }: { chapter: number; running: boolean }) {
	usePlayTime(chapter, running);
	return <DecommissionCountdown chapter={chapter} running={running} />;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-15T08:00:00.000Z"));
	visibility = "visible";
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
	localStorage.clear();
	seed();
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("DecommissionCountdown", () => {
	it("第一章顯示中性的「站務排程」與從喚醒算起的完整倒數", () => {
		render(<DecommissionCountdown chapter={1} running />);
		expect(label()).toBe("站務排程");
		expect(value()).toBe("T-81d 20:25:00");
		expect(screen.getByTestId("hud-countdown").textContent).not.toContain("除役");
	});

	it("遊戲時間在走時每秒往下跳，停下來（暫停選單、這章全解）就不動", () => {
		const { rerender } = render(<DecommissionCountdown chapter={1} running />);
		advance(3000);
		expect(value()).toBe("T-81d 20:24:57");

		rerender(<DecommissionCountdown chapter={1} running={false} />);
		advance(10_000);
		expect(value()).toBe("T-81d 20:24:57");
	});

	it("扣掉存檔裡第一章到目前章節的遊玩時間，之後章節的不算", () => {
		seed({ chapter: 2 }, {
			"1": { playTimeMs: 60 * 60_000, errors: 0, hints: 0 },
			"2": { playTimeMs: 30 * 60_000, errors: 0, hints: 0 },
			"3": { playTimeMs: 60 * 60_000, errors: 0, hints: 0 },
		});
		render(<DecommissionCountdown chapter={2} running={false} />);
		expect(value()).toBe("T-81d 18:55:00");
	});

	it("分頁切到背景時停住，回到前景再接著數", () => {
		render(<DecommissionCountdown chapter={1} running />);
		advance(2000);
		expect(value()).toBe("T-81d 20:24:58");

		setVisibility("hidden");
		advance(60_000);
		expect(value()).toBe("T-81d 20:24:58");

		setVisibility("visible");
		advance(1000);
		expect(value()).toBe("T-81d 20:24:57");
	});

	it("跟 usePlayTime 一起掛：每 30 秒寫進存檔時倒數照秒連續往下，不重複扣也不倒退", () => {
		render(<WithPlayTime chapter={1} running />);
		for (let second = 1; second <= 75; second += 1) {
			advance(1000);
			const remaining = 20 * 3600 + 25 * 60 - second;
			const hours = Math.floor(remaining / 3600);
			const minutes = Math.floor((remaining % 3600) / 60);
			const seconds = remaining % 60;
			const expected = `T-81d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
			expect(value(), `第 ${second} 秒`).toBe(expected);
		}
		// 中間確實寫過存檔（30、60 秒各一次）
		expect(useGameStore.getState().stats["1"]?.playTimeMs).toBe(60_000);
	});

	it("跟 usePlayTime 一起掛：打開暫停選單（不計時）時停在當下的值，不會先倒退再跳回來", () => {
		const { rerender } = render(<WithPlayTime chapter={1} running />);
		advance(12_000);
		expect(value()).toBe("T-81d 20:24:48");

		rerender(<WithPlayTime chapter={1} running={false} />);
		expect(value()).toBe("T-81d 20:24:48");
		advance(30_000);
		expect(value()).toBe("T-81d 20:24:48");
		expect(useGameStore.getState().stats["1"]?.playTimeMs).toBe(12_000);

		rerender(<WithPlayTime chapter={1} running />);
		advance(1000);
		expect(value()).toBe("T-81d 20:24:47");
	});

	it("第五章 T1 過關前是站務排程，過關當下改成遠端除役（看過關紀錄，重新整理後一樣）", () => {
		seed({ chapter: 5 });
		render(<DecommissionCountdown chapter={5} running />);
		expect(label()).toBe("站務排程");

		act(() => {
			useGameStore.setState((state) => ({
				progress: { ...state.progress, solvedTerminals: ["ch5-t1"] },
			}));
		});
		expect(label()).toBe("遠端除役");
		expect(screen.getByTestId("countdown-label").className).toContain("text-game-amber");
	});

	it("第六章 T4 終止 NOVA 之後標籤多一句「目標無回應」，倒數照走", () => {
		seed({ chapter: 6, solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3", "ch6-t4"] });
		render(<DecommissionCountdown chapter={6} running />);
		expect(label()).toBe("遠端除役 · 目標無回應");
		expect(value()).toBe("T-81d 20:25:00");
		advance(1000);
		expect(value()).toBe("T-81d 20:24:59");
	});

	it("已逃離、停在片尾之後不顯示", () => {
		seed(
			{ chapter: 6, solvedTerminals: ["ch6-t4"], clearedAt: "2026-10-15T07:00:00.000Z" },
			{},
			["ch6.outroShown"],
		);
		render(<DecommissionCountdown chapter={6} running={false} />);
		expect(screen.queryByTestId("hud-countdown")).toBeNull();
	});

	it("用 timer 角色（預設不播報），螢幕閱讀器不會每秒唸一次", () => {
		render(<DecommissionCountdown chapter={1} running />);
		const timer = screen.getByRole("timer");
		expect(timer.getAttribute("aria-live")).toBeNull();
		expect(timer.textContent).toContain("T-81d 20:25:00");
	});
});
