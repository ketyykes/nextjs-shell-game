import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXT_SPEED_MS } from "@/game/store/types";
import { DialogueBlock } from "./DialogueBlock";

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
});
