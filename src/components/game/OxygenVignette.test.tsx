import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OxygenVignette } from "./OxygenVignette";

/** 渲染後取出暗角層目前的 opacity 數值 */
function renderAndGetOpacity(oxygen: number): number {
	render(<OxygenVignette oxygen={oxygen} />);
	return Number(screen.getByTestId("oxygen-vignette").style.opacity);
}

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("OxygenVignette", () => {
	it("氧氣 100 時不渲染", () => {
		const { container } = render(<OxygenVignette oxygen={100} />);
		expect(container.firstChild).toBeNull();
	});

	it("氧氣剛好 30 時不渲染", () => {
		const { container } = render(<OxygenVignette oxygen={30} />);
		expect(container.firstChild).toBeNull();
	});

	it("氧氣 29 時渲染暗角", () => {
		render(<OxygenVignette oxygen={29} />);
		expect(screen.getByTestId("oxygen-vignette")).toBeDefined();
	});

	it("氧氣 5 時渲染暗角，且強度大於氧氣 29", () => {
		const lowOpacity = renderAndGetOpacity(29);
		cleanup();
		const highOpacity = renderAndGetOpacity(5);
		expect(highOpacity).toBeGreaterThan(lowOpacity);
	});

	it("氧氣低於 0 時強度上限為 1", () => {
		expect(renderAndGetOpacity(-10)).toBe(1);
	});

	it("暗角對輔助科技隱藏", () => {
		render(<OxygenVignette oxygen={10} />);
		expect(
			screen.getByTestId("oxygen-vignette").getAttribute("aria-hidden"),
		).toBe("true");
	});
});
