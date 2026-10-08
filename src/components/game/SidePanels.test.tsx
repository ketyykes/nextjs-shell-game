import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanels, type SidePanelsProps } from "./SidePanels";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

function renderPanels(overrides: Partial<SidePanelsProps> = {}) {
	const props: SidePanelsProps = {
		active: null,
		onActiveChange: () => {},
		learnedCommands: ["pwd"],
		novaLog: [{ id: "intro-1-0", text: "你醒了。", status: "shown" }],
		...overrides,
	};
	return render(<SidePanels {...props} />);
}

function tab(name: RegExp): HTMLElement {
	return screen.getByRole("button", { name });
}

describe("SidePanels", () => {
	it("收起時兩個標籤都在，沒有面板", () => {
		renderPanels();
		expect(tab(/已學指令/).getAttribute("aria-expanded")).toBe("false");
		expect(tab(/對話紀錄/).getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByTestId("side-panel")).toBeNull();
	});

	it("點標籤打開對應的面板", () => {
		const onActiveChange = vi.fn();
		renderPanels({ onActiveChange });
		fireEvent.click(tab(/對話紀錄/));
		expect(onActiveChange).toHaveBeenLastCalledWith("log");
		fireEvent.click(tab(/已學指令/));
		expect(onActiveChange).toHaveBeenLastCalledWith("commands");
	});

	it("點開著的那個標籤會收起，點另一個標籤直接切換", () => {
		const onActiveChange = vi.fn();
		renderPanels({ active: "log", onActiveChange });
		expect(tab(/對話紀錄/).getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(tab(/對話紀錄/));
		expect(onActiveChange).toHaveBeenLastCalledWith(null);
		fireEvent.click(tab(/已學指令/));
		expect(onActiveChange).toHaveBeenLastCalledWith("commands");
	});

	it("同時只顯示一個面板：開對話紀錄時看不到已學指令", () => {
		renderPanels({ active: "log" });
		expect(screen.getByTestId("nova-log-panel")).toBeDefined();
		expect(screen.getByText("你醒了。")).toBeDefined();
		expect(screen.queryByTestId("command-cheat-sheet-panel")).toBeNull();
		expect(screen.getByRole("heading", { name: "對話紀錄" })).toBeDefined();
	});

	it("開已學指令時列出指令", () => {
		renderPanels({ active: "commands" });
		expect(screen.getByTestId("command-cheat-sheet-panel")).toBeDefined();
		expect(screen.getByText("pwd")).toBeDefined();
		expect(screen.queryByTestId("nova-log-panel")).toBeNull();
		expect(screen.getByRole("heading", { name: "已學指令" })).toBeDefined();
	});

	it("對話紀錄的標籤與面板標題列顯示快捷鍵", () => {
		renderPanels({ active: "log" });
		const logTab = tab(/對話紀錄/);
		expect(logTab.textContent).toContain("Alt+L");
		expect(logTab.getAttribute("aria-keyshortcuts")).toBe("Alt+L");
		expect(screen.getByText("Alt+L 收起")).toBeDefined();
	});

	it("已學指令的標籤與面板標題列顯示快捷鍵", () => {
		renderPanels({ active: "commands" });
		const commandsTab = tab(/已學指令/);
		expect(commandsTab.textContent).toContain("Alt+C");
		expect(commandsTab.getAttribute("aria-keyshortcuts")).toBe("Alt+C");
		expect(screen.getByText("Alt+C 收起")).toBeDefined();
	});

	it("在標籤與面板上按滑鼠不會搶走焦點（終端機開著時打字不中斷）", () => {
		renderPanels({ active: "commands" });
		// fireEvent 回傳 false 代表預設行為被擋掉，瀏覽器就不會把焦點移到按鈕上
		expect(fireEvent.mouseDown(tab(/已學指令/))).toBe(false);
		expect(fireEvent.mouseDown(tab(/對話紀錄/))).toBe(false);
		expect(fireEvent.mouseDown(screen.getByRole("button", { name: /pwd/ }))).toBe(false);
		expect(fireEvent.mouseDown(screen.getByText("終端機內輸入 man <指令> 也看得到"))).toBe(false);
	});

	it("Apple 鍵盤改顯示 ⌥", () => {
		renderPanels({ active: "log", appleKeyboard: true });
		expect(tab(/對話紀錄/).textContent).toContain("⌥L");
		expect(tab(/對話紀錄/).getAttribute("aria-keyshortcuts")).toBe("Alt+L");
		expect(screen.getByText("⌥L 收起")).toBeDefined();
	});

	it("標籤不進 Tab 順序（鍵盤留給遊戲與終端機）", () => {
		renderPanels();
		for (const button of screen.getAllByRole("button")) {
			expect(button.getAttribute("tabindex")).toBe("-1");
		}
	});
});
