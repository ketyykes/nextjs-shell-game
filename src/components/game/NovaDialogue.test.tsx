import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeHoldMs, type NovaMessage, NovaDialogue } from "./NovaDialogue";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const message: NovaMessage = { id: "intro-0", text: "你好嗎" };

// 切換訊息會用到 motion 的離場動畫，它由 rAF 驅動；
// 假計時器下動畫不會完成，且會把 motion 的影格迴圈卡住，所以這組用真實計時器，並放在假計時器測試之前
describe("NovaDialogue 切換訊息（真實計時器）", () => {
	it("父層移掉第一則後，會接著顯示下一則", async () => {
		const first: NovaMessage = { id: "a-0", text: "第一則" };
		const second: NovaMessage = { id: "a-1", text: "第二則" };
		const { rerender } = render(
			<NovaDialogue queue={[first, second]} textSpeed="instant" onShown={vi.fn()} />,
		);
		expect(screen.getByTestId("nova-text").textContent).toBe("第一則");

		rerender(<NovaDialogue queue={[second]} textSpeed="instant" onShown={vi.fn()} />);
		await waitFor(() => {
			expect(screen.getByTestId("nova-text").textContent).toBe("第二則");
		}, { timeout: 4000 });
	});
});

describe("computeHoldMs", () => {
	it("基礎停留加上每字 40ms", () => {
		expect(computeHoldMs("12345", 4000)).toBe(4200);
	});

	it("上限為 9000ms", () => {
		expect(computeHoldMs("字".repeat(500), 4000)).toBe(9000);
	});
});

describe("NovaDialogue", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it("佇列為空時沒有任何 DOM", () => {
		const { container } = render(
			<NovaDialogue queue={[]} textSpeed="instant" onShown={vi.fn()} />,
		);
		expect(container.innerHTML).toBe("");
	});

	it("顯示名字標籤與立繪 alt", () => {
		render(<NovaDialogue queue={[message]} textSpeed="instant" onShown={vi.fn()} />);
		expect(screen.getByText("NOVA")).toBeDefined();
		expect(screen.getByAltText(/NOVA/)).toBeDefined();
	});

	it("instant 速度時文字立刻全部出現，且沒有游標", () => {
		render(<NovaDialogue queue={[message]} textSpeed="instant" onShown={vi.fn()} />);
		expect(screen.getByTestId("nova-text").textContent).toBe("你好嗎");
		expect(screen.queryByTestId("nova-cursor")).toBeNull();
	});

	it("normal 速度時推進時間後逐字出現，打字中有游標", () => {
		render(<NovaDialogue queue={[message]} textSpeed="normal" onShown={vi.fn()} />);
		const readText = () => screen.getByTestId("nova-text").textContent;

		expect(readText()).toBe("▌");

		act(() => {
			vi.advanceTimersByTime(30);
		});
		expect(readText()).toBe("你▌");

		act(() => {
			vi.advanceTimersByTime(30);
		});
		expect(readText()).toBe("你好▌");

		act(() => {
			vi.advanceTimersByTime(30);
		});
		expect(readText()).toBe("你好嗎");
		expect(screen.queryByTestId("nova-cursor")).toBeNull();
	});

	it("螢幕閱讀器可讀到完整文字，且帶有 aria-live", () => {
		render(<NovaDialogue queue={[message]} textSpeed="normal" onShown={vi.fn()} />);
		const dialogue = screen.getByTestId("nova-dialogue");
		expect(dialogue.getAttribute("aria-live")).toBe("polite");
		expect(dialogue.querySelector(".sr-only")?.textContent).toBe("你好嗎");
	});

	it("打完字並經過停留時間與淡出後，只呼叫一次 onShown(id)", () => {
		const onShown = vi.fn();
		render(<NovaDialogue queue={[message]} textSpeed="instant" onShown={onShown} holdMs={1000} />);
		const hold = computeHoldMs(message.text, 1000);

		// 停留尚未結束，不應通知
		act(() => {
			vi.advanceTimersByTime(hold - 1);
		});
		expect(onShown).not.toHaveBeenCalled();

		// 停留結束後進入淡出（分開推進，讓淡出計時器在 effect 中先建立）
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(onShown).not.toHaveBeenCalled();

		// 淡出完成才通知
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(onShown).toHaveBeenCalledTimes(1);
		expect(onShown).toHaveBeenCalledWith("intro-0");

		// 之後不會重複通知
		act(() => {
			vi.advanceTimersByTime(20000);
		});
		expect(onShown).toHaveBeenCalledTimes(1);
	});

	it("打字還沒結束時不會開始計算停留時間", () => {
		const onShown = vi.fn();
		render(<NovaDialogue queue={[message]} textSpeed="slow" onShown={onShown} holdMs={1000} />);

		// slow 60ms * 3 字 = 180ms 才打完，這時還在打字
		act(() => {
			vi.advanceTimersByTime(120);
		});
		expect(onShown).not.toHaveBeenCalled();
		expect(screen.getByTestId("nova-cursor")).toBeDefined();
	});
});
