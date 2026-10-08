import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getChapter } from "@/game/chapters";
import { Hud, type HudProps } from "./Hud";

const CRYO = getChapter(1).terminals[0];

function renderHud(props: Partial<HudProps> = {}) {
	return render(
		<Hud oxygen={100} room={null} nearbyTerminal={null} terminalOpen={false} showControlsHint={false} {...props} />,
	);
}

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("Hud", () => {
	it("顯示氧氣百分比", () => {
		renderHud({ oxygen: 87 });
		expect(screen.getByTestId("hud-oxygen-value").textContent).toBe("O2 87%");
	});

	it("有艙區時右上角顯示繁中名稱，沒有就不顯示", () => {
		renderHud({ room: "medbay" });
		expect(screen.getByTestId("hud-room").textContent).toBe("醫療艙");
		cleanup();

		renderHud();
		expect(screen.queryByTestId("hud-room")).toBeNull();
	});

	it("站在終端機旁顯示「按 E」提示，終端機開著時不顯示", () => {
		renderHud({ nearbyTerminal: CRYO });
		expect(screen.getByTestId("interact-hint").textContent).toBe(`按 E 開啟 ${CRYO.title}`);
		cleanup();

		renderHud({ nearbyTerminal: CRYO, terminalOpen: true });
		expect(screen.queryByTestId("interact-hint")).toBeNull();
	});

	it("操作提示照 showControlsHint 顯示", () => {
		renderHud({ showControlsHint: true });
		expect(screen.getByTestId("controls-hint")).toBeDefined();
		cleanup();

		renderHud();
		expect(screen.queryByTestId("controls-hint")).toBeNull();
	});
});
