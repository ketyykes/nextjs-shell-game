import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ObjectivePanel } from "./ObjectivePanel";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("ObjectivePanel", () => {
	it("顯示「目前目標」標籤、標題與未完成的 ☐", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" solved={false} />);
		expect(screen.getByText("目前目標")).toBeDefined();
		expect(screen.getByTestId("objective-title").textContent).toContain("找到 B3 斷路器");
		expect(screen.getByTestId("objective-checkbox").textContent).toBe("☐");
	});

	it("有 description 時顯示說明文字", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" description="試著用 ls 看看" solved={false} />);
		expect(screen.getByText("試著用 ls 看看")).toBeDefined();
	});

	it("過關時顯示 ☑ 並套用青綠色 class", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" solved />);
		expect(screen.getByTestId("objective-checkbox").textContent).toBe("☑");
		expect(screen.getByTestId("objective-title").className).toContain("text-game-success");
	});

	it("未過關時不套用青綠色 class", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" solved={false} />);
		expect(screen.getByTestId("objective-title").className).not.toContain("text-game-success");
	});

	it("title 為 null 時顯示「目前沒有目標」", () => {
		render(<ObjectivePanel title={null} solved={false} />);
		expect(screen.getByText("目前沒有目標")).toBeDefined();
		expect(screen.queryByTestId("objective-title")).toBeNull();
	});

	it("有 progress 時顯示 2/6", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" solved={false} progress={{ solved: 2, total: 6 }} />);
		expect(screen.getByTestId("objective-progress").textContent).toBe("2/6");
	});

	it("沒有 progress 時不顯示進度", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" solved={false} />);
		expect(screen.queryByTestId("objective-progress")).toBeNull();
	});

	it("面板帶有 role=status 與 aria-live=polite", () => {
		render(<ObjectivePanel title="找到 B3 斷路器" solved={false} />);
		const panel = screen.getByRole("status");
		expect(panel.getAttribute("aria-live")).toBe("polite");
	});
});
