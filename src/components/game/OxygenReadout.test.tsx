import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OXYGEN_LOSS_FLASH_MS, OxygenReadout } from "./OxygenReadout";

beforeEach(() => {
	vi.useFakeTimers();
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function readoutText(): HTMLElement {
	return screen.getByTestId("hud-oxygen-value");
}

function lossFloat(): HTMLElement | null {
	return screen.queryByTestId("hud-oxygen-loss");
}

describe("OxygenReadout", () => {
	it("顯示 O2 百分比，30 以上用青綠色", () => {
		render(<OxygenReadout oxygen={100} raised={false} />);
		expect(readoutText().textContent).toBe("O2 100%");
		expect(readoutText().className).toContain("text-game-success");
	});

	it("低於 30 用琥珀色", () => {
		render(<OxygenReadout oxygen={29} raised={false} />);
		expect(readoutText().className).toContain("text-game-amber");
	});

	it("掛載當下（讀存檔來的氧氣）不閃也不浮字", () => {
		render(<OxygenReadout oxygen={60} raised={false} />);
		expect(readoutText().className).not.toContain("text-game-amber");
		expect(lossFloat()).toBeNull();
	});

	it("扣氧當下數字變琥珀並浮出 -1", () => {
		const { rerender } = render(<OxygenReadout oxygen={100} raised={false} />);
		rerender(<OxygenReadout oxygen={99} raised={false} />);

		expect(readoutText().textContent).toBe("O2 99%");
		expect(readoutText().className).toContain("text-game-amber");
		expect(lossFloat()?.textContent).toBe("-1");
	});

	it("閃完就回到原本的顏色、浮字消失", () => {
		const { rerender } = render(<OxygenReadout oxygen={100} raised={false} />);
		rerender(<OxygenReadout oxygen={99} raised={false} />);

		act(() => {
			vi.advanceTimersByTime(OXYGEN_LOSS_FLASH_MS);
		});

		expect(readoutText().className).toContain("text-game-success");
		expect(readoutText().className).not.toContain("text-game-amber");
		expect(lossFloat()).toBeNull();
	});

	it("連續扣氧時重新計時，最後一次扣完才結束", () => {
		const { rerender } = render(<OxygenReadout oxygen={100} raised={false} />);
		rerender(<OxygenReadout oxygen={99} raised={false} />);
		act(() => {
			vi.advanceTimersByTime(OXYGEN_LOSS_FLASH_MS - 100);
		});
		rerender(<OxygenReadout oxygen={98} raised={false} />);
		act(() => {
			vi.advanceTimersByTime(200);
		});

		expect(lossFloat()?.textContent).toBe("-1");
		expect(readoutText().className).toContain("text-game-amber");

		act(() => {
			vi.advanceTimersByTime(OXYGEN_LOSS_FLASH_MS);
		});
		expect(lossFloat()).toBeNull();
	});

	it("過關回氧（數值變大）不閃", () => {
		const { rerender } = render(<OxygenReadout oxygen={97} raised={false} />);
		rerender(<OxygenReadout oxygen={100} raised={false} />);

		expect(readoutText().className).toContain("text-game-success");
		expect(lossFloat()).toBeNull();
	});

	it("終端機開著時疊到終端機黑幕上面，扣氧時才看得清楚", () => {
		const { rerender } = render(<OxygenReadout oxygen={100} raised={false} />);
		expect(screen.getByTestId("hud-oxygen").className).toContain("z-30");

		rerender(<OxygenReadout oxygen={100} raised />);
		expect(screen.getByTestId("hud-oxygen").className).toContain("z-[41]");
	});
});
