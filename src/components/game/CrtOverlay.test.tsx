import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CrtOverlay } from "./CrtOverlay";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("CrtOverlay", () => {
	it("三項效果都開啟時，三層都會渲染", () => {
		render(<CrtOverlay scanlines vignette flicker />);
		expect(screen.getByTestId("crt-scanlines")).toBeDefined();
		expect(screen.getByTestId("crt-vignette")).toBeDefined();
		expect(screen.getByTestId("crt-flicker")).toBeDefined();
	});

	it("關閉掃描線時，掃描線層不存在", () => {
		render(<CrtOverlay scanlines={false} vignette flicker />);
		expect(screen.queryByTestId("crt-scanlines")).toBeNull();
		expect(screen.getByTestId("crt-vignette")).toBeDefined();
		expect(screen.getByTestId("crt-flicker")).toBeDefined();
	});

	it("關閉暗角時，暗角層不存在", () => {
		render(<CrtOverlay scanlines vignette={false} flicker />);
		expect(screen.queryByTestId("crt-vignette")).toBeNull();
		expect(screen.getByTestId("crt-scanlines")).toBeDefined();
		expect(screen.getByTestId("crt-flicker")).toBeDefined();
	});

	it("關閉閃爍時，閃爍層不存在", () => {
		render(<CrtOverlay scanlines vignette flicker={false} />);
		expect(screen.queryByTestId("crt-flicker")).toBeNull();
		expect(screen.getByTestId("crt-scanlines")).toBeDefined();
		expect(screen.getByTestId("crt-vignette")).toBeDefined();
	});

	it("全部關閉時不渲染任何內容", () => {
		const { container } = render(
			<CrtOverlay scanlines={false} vignette={false} flicker={false} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("容器對輔助科技隱藏", () => {
		render(<CrtOverlay scanlines vignette flicker />);
		const overlay = screen.getByTestId("crt-overlay");
		expect(overlay.getAttribute("aria-hidden")).toBe("true");
	});

	it("z-index 預設為 50，可由 props 覆寫", () => {
		const { rerender } = render(<CrtOverlay scanlines vignette flicker />);
		expect(screen.getByTestId("crt-overlay").style.zIndex).toBe("50");

		rerender(<CrtOverlay scanlines vignette flicker zIndex={99} />);
		expect(screen.getByTestId("crt-overlay").style.zIndex).toBe("99");
	});
});
