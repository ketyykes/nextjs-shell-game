import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOT_LINES, BootLog } from "./BootLog";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const NOVA_LINE = "……連線建立。站務系統 NOVA，低功率模式。";

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

describe("BOOT_LINES", () => {
	it("相鄰兩行文字不相同（打字動畫靠原文變化重置）", () => {
		for (let index = 1; index < BOOT_LINES.length; index += 1) {
			expect(BOOT_LINES[index]?.text).not.toBe(BOOT_LINES[index - 1]?.text);
		}
	});
});

describe("BootLog（instant）", () => {
	it("立即顯示全部內容：查無此人、NOVA 第一句與繼續提示", () => {
		render(<BootLog textSpeed="instant" novaFirstLine={NOVA_LINE} onDone={vi.fn()} lineGapMs={0} />);
		expect(screen.getByText("查無此人")).toBeDefined();
		expect(screen.getByTestId("dialogue-text").textContent).toBe(NOVA_LINE);
		expect(screen.getByTestId("boot-continue").textContent).toBe("按 Enter 繼續");
		expect(screen.getAllByTestId("boot-line")).toHaveLength(BOOT_LINES.length);
	});

	it("查無此人的行用琥珀色", () => {
		render(<BootLog textSpeed="instant" novaFirstLine={NOVA_LINE} onDone={vi.fn()} lineGapMs={0} />);
		expect(screen.getByText("查無此人").className).toContain("text-game-amber");
	});

	it("instant 時第一次 Enter 就呼叫 onDone，之後不重複呼叫", () => {
		const onDone = vi.fn();
		render(<BootLog textSpeed="instant" novaFirstLine={NOVA_LINE} onDone={onDone} lineGapMs={0} />);
		press("Enter");
		expect(onDone).toHaveBeenCalledTimes(1);
		press("Enter");
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it("點擊畫面也會呼叫 onDone", () => {
		const onDone = vi.fn();
		render(<BootLog textSpeed="instant" novaFirstLine={NOVA_LINE} onDone={onDone} lineGapMs={0} />);
		fireEvent.click(screen.getByTestId("boot-log"));
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});

describe("BootLog（打字動畫）", () => {
	it("逐行出現，跑完後才顯示繼續提示", () => {
		vi.useFakeTimers();
		render(<BootLog textSpeed="fast" novaFirstLine={NOVA_LINE} onDone={vi.fn()} lineGapMs={10} />);
		expect(screen.queryByText("查無此人")).toBeNull();
		expect(screen.queryByTestId("boot-continue")).toBeNull();

		// 一次推進一小段，讓每行打完後的停頓計時器有機會在下一次 render 後掛上
		for (let step = 0; step < 400; step += 1) {
			act(() => {
				vi.advanceTimersByTime(50);
			});
		}
		expect(screen.getByText("查無此人")).toBeDefined();
		expect(screen.getByTestId("dialogue-text").textContent).toBe(NOVA_LINE);
		expect(screen.getByTestId("boot-continue")).toBeDefined();
	});

	it("動畫中第一次 Enter 跳過並顯示全部，第二次 Enter 才呼叫 onDone", () => {
		vi.useFakeTimers();
		const onDone = vi.fn();
		render(<BootLog textSpeed="slow" novaFirstLine={NOVA_LINE} onDone={onDone} lineGapMs={350} />);
		press("Enter");
		expect(onDone).not.toHaveBeenCalled();
		expect(screen.getByText("查無此人")).toBeDefined();
		expect(screen.getByTestId("dialogue-text").textContent).toBe(NOVA_LINE);
		expect(screen.getByTestId("boot-continue")).toBeDefined();

		press("Enter");
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});

describe("BootLog 的外框不誤導", () => {
	it("沒有關閉按鈕也沒有「提示：輸入 hint」頁尾（boot log 不能互動也不能打字）", () => {
		render(<BootLog textSpeed="instant" novaFirstLine={NOVA_LINE} onDone={vi.fn()} lineGapMs={0} />);
		expect(screen.queryByLabelText("關閉終端機")).toBeNull();
		expect(screen.queryByText(/提示：輸入 hint/)).toBeNull();
	});

	it("動畫播放中顯示「Enter 跳過」，跳過後換成「按 Enter 繼續」", () => {
		render(<BootLog textSpeed="normal" novaFirstLine={NOVA_LINE} onDone={vi.fn()} lineGapMs={0} />);
		expect(screen.getByTestId("boot-skip").textContent).toBe("Enter 跳過");

		// 第一次 Enter 跳過動畫直接顯示全部
		act(() => {
			press("Enter");
		});
		expect(screen.queryByTestId("boot-skip")).toBeNull();
		expect(screen.getByTestId("boot-continue")).toBeDefined();
	});
});
