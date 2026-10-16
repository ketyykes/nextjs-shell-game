import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXT_SPEED_MS } from "@/game/store/types";
import { DialogueBlock } from "./DialogueBlock";
import { DisplayInstabilityContext } from "./DisplayInstabilityContext";
import { applyStutter, STUTTER_MARK, STUTTER_PAUSE_MS, stutterPoints } from "./novaStutter";

const TEXT = "喚醒程序啟動";

describe("DialogueBlock", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	function getTyped(): string {
		return screen.getByTestId("dialogue-text").textContent ?? "";
	}

	it("顯示 NOVA 名字標籤", () => {
		render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={0} />);
		expect(screen.getByText("NOVA")).toBeDefined();
	});

	it("msPerChar 為 30 時逐字出現", () => {
		render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={30} />);
		expect(getTyped()).toBe("");

		act(() => {
			vi.advanceTimersByTime(30);
		});
		expect(getTyped()).toBe("喚");

		act(() => {
			vi.advanceTimersByTime(60);
		});
		expect(getTyped()).toBe("喚醒程");

		act(() => {
			vi.advanceTimersByTime(30 * 10);
		});
		expect(getTyped()).toBe(TEXT);
	});

	it("instant 速度時立刻全部顯示", () => {
		render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={TEXT_SPEED_MS.instant} />);
		expect(getTyped()).toBe(TEXT);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("打完之後清掉計時器", () => {
		render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={30} />);
		act(() => {
			vi.advanceTimersByTime(30 * 10);
		});
		expect(getTyped()).toBe(TEXT);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("卸載時清掉計時器", () => {
		const { unmount } = render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={30} />);
		expect(vi.getTimerCount()).toBe(1);
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("文字換掉時從頭開始打", () => {
		const { rerender } = render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={30} />);
		act(() => {
			vi.advanceTimersByTime(90);
		});
		expect(getTyped()).toBe("喚醒程");

		rerender(<DialogueBlock speaker="NOVA" text="不要相信" msPerChar={30} />);
		expect(getTyped()).toBe("");
		act(() => {
			vi.advanceTimersByTime(30);
		});
		expect(getTyped()).toBe("不");
	});

	it("螢幕閱讀器一開始就能讀到全文", () => {
		render(<DialogueBlock speaker="NOVA" text={TEXT} msPerChar={30} />);
		expect(screen.getByText(TEXT, { selector: ".sr-only" })).toBeDefined();
	});

	describe("低氧斷句（4.25）", () => {
		const LONG = "你確定你是技師嗎我查不到你的名字這不太對應該有名字的";
		const UNSTABLE = { stutter: true };
		const STABLE = { stutter: false };

		function renderWith(value: typeof UNSTABLE, msPerChar: number) {
			return render(
				<DisplayInstabilityContext value={value}>
					<DialogueBlock speaker="NOVA" text={LONG} msPerChar={msPerChar} />
				</DisplayInstabilityContext>,
			);
		}

		it("每隔幾個字插入……，不亂碼；螢幕閱讀器與原文不受影響", () => {
			renderWith(UNSTABLE, 0);
			expect(getTyped()).toBe(applyStutter(LONG, stutterPoints(LONG)));
			expect(getTyped()).toContain(STUTTER_MARK);
			expect(getTyped().split(STUTTER_MARK).join("")).toBe(LONG);
			expect(screen.getByText(LONG, { selector: ".sr-only" })).toBeDefined();
		});

		it("打到斷點時……馬上出現，停一下才接著打", () => {
			renderWith(UNSTABLE, 30);
			const chars = Array.from(LONG);
			const first = stutterPoints(LONG)[0];
			const pauseTicks = Math.ceil(STUTTER_PAUSE_MS / 30);

			act(() => {
				vi.advanceTimersByTime(30 * first);
			});
			const atPoint = `${chars.slice(0, first).join("")}${STUTTER_MARK}`;
			expect(getTyped()).toBe(atPoint);

			act(() => {
				vi.advanceTimersByTime(30 * pauseTicks);
			});
			expect(getTyped()).toBe(atPoint);

			act(() => {
				vi.advanceTimersByTime(30);
			});
			expect(getTyped()).toBe(`${atPoint}${chars[first]}`);
		});

		it("氧氣回到 20% 以上時……立刻消失，打字不從頭來", () => {
			const { rerender } = renderWith(UNSTABLE, 30);
			const first = stutterPoints(LONG)[0];
			act(() => {
				vi.advanceTimersByTime(30 * first);
			});
			expect(getTyped()).toContain(STUTTER_MARK);

			rerender(
				<DisplayInstabilityContext value={STABLE}>
					<DialogueBlock speaker="NOVA" text={LONG} msPerChar={30} />
				</DisplayInstabilityContext>,
			);
			expect(getTyped()).toBe(Array.from(LONG).slice(0, first).join(""));
		});

		it("沒有提供不穩狀態（沙盒）時不斷句", () => {
			render(<DialogueBlock speaker="NOVA" text={LONG} msPerChar={0} />);
			expect(getTyped()).toBe(LONG);
		});
	});
});
