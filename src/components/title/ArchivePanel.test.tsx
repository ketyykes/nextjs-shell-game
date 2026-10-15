import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { ArchivePanel } from "./ArchivePanel";

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	localStorage.clear();
});

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

function renderPanel() {
	const onClose = vi.fn();
	render(<ArchivePanel onClose={onClose} />);
	return { onClose, dialog: screen.getByRole("dialog", { name: "檔案櫃" }) };
}

/** 目前選取（前面有 ▸）的那一列按鈕。 */
function selectedButton(): HTMLElement {
	const selected = screen.getAllByRole("button").filter((button) => button.getAttribute("aria-current") === "true");
	expect(selected).toHaveLength(1);
	return selected[0];
}

describe("ArchivePanel", () => {
	it("列出六章、時間軸與返回；Esc 回標題選單", () => {
		const { onClose, dialog } = renderPanel();
		const names = within(dialog)
			.getAllByRole("button")
			.map((button) => button.textContent ?? "");
		expect(names).toEqual(
			[
				"第一章 冷凍艙",
				"第二章 資料中心",
				"第三章 工程艙",
				"第四章 通訊艙",
				"第五章 艦橋",
				"第六章 NOVA 核心",
				"時間軸",
				"返回",
			].map((name) => expect.stringContaining(name)),
		);
		expect(selectedButton().textContent).toContain("第一章 冷凍艙");

		press("Escape");
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Enter 打開一章，列出關鍵檔案；選中的檔案按 Enter 展開全文，再按一次收起", () => {
		renderPanel();
		press("Enter");

		const wakeUp = screen.getByRole("button", { name: /\/home\/tech\/wake_up\.txt/ });
		expect(wakeUp.getAttribute("aria-expanded")).toBe("false");
		expect(wakeUp.textContent).toContain("冷凍艙控制台");
		expect(screen.queryByText(/原始設定：永不/)).toBeNull();

		press("Enter");
		expect(wakeUp.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText(/原始設定：永不/)).toBeDefined();

		press("Enter");
		expect(screen.queryByText(/原始設定：永不/)).toBeNull();
	});

	it("↑↓ 換檔案，展開的是選中的那一份，一次只展開一份", () => {
		renderPanel();
		press("Enter");
		press("Enter");
		expect(screen.getByText(/原始設定：永不/)).toBeDefined();

		press("ArrowDown");
		expect(selectedButton().textContent).toContain("/home/tech/crew_manifest.txt");
		press("Enter");
		expect(screen.getByText(/5\. 阿彬/)).toBeDefined();
		expect(screen.queryByText(/原始設定：永不/)).toBeNull();
	});

	it("Esc 從一章回到章節清單，選取停在剛才那一章；再按 Esc 才回標題選單", () => {
		const { onClose } = renderPanel();
		press("ArrowDown");
		press("Enter");
		expect(screen.getByRole("button", { name: /\/deck2\/logs\/door_events\.log/ })).toBeDefined();

		press("Escape");
		expect(onClose).not.toHaveBeenCalled();
		expect(selectedButton().textContent).toContain("第二章 資料中心");

		press("Escape");
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("已找到的阿彬留言列在對應章節，可以展開；沒找到的不列也不提示", () => {
		useGameStore.setState({ abinNotes: { found: ["ch1-jokes"], reply: null } });
		renderPanel();
		press("Enter");

		const note = screen.getByRole("button", { name: /\/deck1\/medbay\/\.abin_jokes\.txt/ });
		expect(note.textContent).toContain("阿彬的留言");
		fireEvent.click(note);
		expect(screen.getByText(/冷凍入艙評估，講了四個笑話/)).toBeDefined();

		press("Escape");
		press("ArrowDown");
		press("Enter");
		expect(screen.getByRole("button", { name: /door_events\.log/ })).toBeDefined();
		expect(screen.queryByText(/阿彬的留言/)).toBeNull();
	});

	it("時間軸依時間列出事件與來源，Enter 展開來源檔案的全文", () => {
		renderPanel();
		fireEvent.click(screen.getByRole("button", { name: /時間軸/ }));

		const first = selectedButton();
		expect(first.textContent).toContain("2027-07-26 21:40");
		expect(first.textContent).toContain("宿舍終端機");
		expect(first.textContent).toContain("/home/abin/day_001.txt");

		press("Enter");
		expect(screen.getByText(/今日目標：找到誰把泡麵藏在通風管。/)).toBeDefined();

		const buttons = screen.getAllByRole("button");
		expect(buttons.at(-2)?.textContent).toContain("2031-03-12 08:15");
	});

	it("滑鼠：點「返回」回上一層，章節清單的「返回」回標題選單", () => {
		const { onClose } = renderPanel();
		fireEvent.click(screen.getByRole("button", { name: /第三章 工程艙/ }));
		expect(screen.getByRole("button", { name: /\.bash_history/ })).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "返回" }));
		expect(screen.getByRole("button", { name: /第三章 工程艙/ })).toBeDefined();
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "返回" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
