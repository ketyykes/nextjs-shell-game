import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ControlsHint, shouldShowControlsHint } from "./ControlsHint";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("shouldShowControlsHint", () => {
	it("第一章 T1 還沒過關、終端機沒開時顯示", () => {
		expect(shouldShowControlsHint({ chapter: 1, solvedTerminals: [], terminalOpen: false })).toBe(true);
	});

	it("T1 過關後就不再顯示", () => {
		expect(shouldShowControlsHint({ chapter: 1, solvedTerminals: ["ch1-t1"], terminalOpen: false })).toBe(false);
	});

	it("跳過 T1 先解別台時照樣顯示，直到 T1 過關", () => {
		expect(shouldShowControlsHint({ chapter: 1, solvedTerminals: ["ch1-t2"], terminalOpen: false })).toBe(true);
	});

	it("終端機開著時不顯示（方向鍵與 Esc 在終端機裡是別的意思）", () => {
		expect(shouldShowControlsHint({ chapter: 1, solvedTerminals: [], terminalOpen: true })).toBe(false);
	});

	it("第二章以後不顯示", () => {
		expect(shouldShowControlsHint({ chapter: 2, solvedTerminals: ["ch1-t1"], terminalOpen: false })).toBe(false);
		expect(shouldShowControlsHint({ chapter: 2, solvedTerminals: [], terminalOpen: false })).toBe(false);
	});
});

describe("ControlsHint", () => {
	it("顯示「方向鍵移動 · E 互動 · Esc 選單」", () => {
		render(<ControlsHint />);
		expect(screen.getByTestId("controls-hint").textContent).toBe("方向鍵移動 · E 互動 · Esc 選單");
	});
});
