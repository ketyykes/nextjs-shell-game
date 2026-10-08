import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TitleScreen, type TitleScreenProps } from "./TitleScreen";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

function renderTitle(overrides: Partial<TitleScreenProps> = {}) {
	const props = {
		hasSave: false,
		onContinue: vi.fn(),
		onNewGame: vi.fn(),
		onOpenSettings: vi.fn(),
		...overrides,
	};
	render(<TitleScreen {...props} />);
	return props;
}

describe("TitleScreen", () => {
	it("顯示 KEPLER-9 標題與鍵盤說明", () => {
		renderTitle();
		expect(screen.getByRole("heading", { name: "KEPLER-9" })).toBeDefined();
		expect(screen.getByText("鍵盤操作：↑↓ 選擇 · Enter 確認")).toBeDefined();
	});

	it("無存檔時沒有「繼續」", () => {
		renderTitle({ hasSave: false });
		expect(screen.queryByRole("button", { name: "繼續" })).toBeNull();
		expect(screen.getByRole("button", { name: "新遊戲" })).toBeDefined();
	});

	it("有存檔時有「繼續」，預設選取它，Enter 呼叫 onContinue", () => {
		const props = renderTitle({ hasSave: true });
		expect(screen.getByRole("button", { name: "繼續" })).toBeDefined();
		press("Enter");
		expect(props.onContinue).toHaveBeenCalledTimes(1);
	});

	it("有存檔時 ↓ Enter 選新遊戲會出現覆蓋確認，取消不呼叫 onNewGame", () => {
		const props = renderTitle({ hasSave: true });
		press("ArrowDown");
		press("Enter");
		expect(screen.getByText("已有存檔，開始新遊戲會覆蓋它。")).toBeDefined();
		expect(props.onNewGame).not.toHaveBeenCalled();

		// 確認面板預設選「取消」
		press("Enter");
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onNewGame).not.toHaveBeenCalled();
	});

	it("有存檔時在確認面板選「覆蓋」才呼叫 onNewGame", () => {
		const props = renderTitle({ hasSave: true });
		press("ArrowDown");
		press("Enter");
		press("ArrowLeft");
		press("Enter");
		expect(props.onNewGame).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
	});

	it("確認面板中按 Esc 等同取消，也可用滑鼠點「覆蓋」", () => {
		const props = renderTitle({ hasSave: true });
		fireEvent.click(screen.getByRole("button", { name: "新遊戲" }));
		press("Escape");
		expect(screen.queryByTestId("confirm-panel")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "新遊戲" }));
		fireEvent.click(screen.getByRole("button", { name: "覆蓋" }));
		expect(props.onNewGame).toHaveBeenCalledTimes(1);
	});

	it("無存檔時新遊戲直接呼叫 onNewGame", () => {
		const props = renderTitle({ hasSave: false });
		press("Enter");
		expect(props.onNewGame).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
	});

	it("「設定」呼叫 onOpenSettings（鍵盤與滑鼠）", () => {
		const props = renderTitle({ hasSave: true });
		press("ArrowUp");
		press("Enter");
		expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "設定" }));
		expect(props.onOpenSettings).toHaveBeenCalledTimes(2);
	});

	it("keyboardEnabled 為 false 時不處理鍵盤", () => {
		const props = renderTitle({ keyboardEnabled: false });
		press("Enter");
		expect(props.onNewGame).not.toHaveBeenCalled();
	});

	describe("選章", () => {
		const chapters = [
			{ number: 1, label: "第一章 冷凍艙與維生艙" },
			{ number: 2, label: "第二章 資料中心" },
			{ number: 3, label: "第三章 工程艙" },
		];

		it("只到過第一章時沒有「選章」", () => {
			renderTitle({ hasSave: true, chapters: chapters.slice(0, 1), onSelectChapter: vi.fn() });
			expect(screen.queryByRole("button", { name: "選章" })).toBeNull();
		});

		it("到過兩章以上時「選章」排在「繼續」後面，打開後列出到過的章節", () => {
			renderTitle({ hasSave: true, chapters, onSelectChapter: vi.fn() });
			const buttons = screen.getAllByRole("button");
			const expected = ["繼續", "選章", "新遊戲", "設定"];
			expect(buttons).toHaveLength(expected.length);
			expected.forEach((name, index) => {
				expect(buttons[index]).toBe(screen.getByRole("button", { name }));
			});

			press("ArrowDown");
			press("Enter");
			expect(screen.getByRole("button", { name: "第二章 資料中心" })).toBeDefined();
			expect(screen.getByRole("button", { name: "第三章 工程艙" })).toBeDefined();
			expect(screen.getByRole("button", { name: "返回" })).toBeDefined();
		});

		it("選了章節要先確認重玩，確認後才呼叫 onSelectChapter", () => {
			const onSelectChapter = vi.fn();
			renderTitle({ hasSave: true, chapters, onSelectChapter });
			fireEvent.click(screen.getByRole("button", { name: "選章" }));
			fireEvent.click(screen.getByRole("button", { name: "第二章 資料中心" }));

			expect(screen.getByText("從頭重玩第二章 資料中心？這一章的進度會清掉，其他章節保留。")).toBeDefined();
			expect(onSelectChapter).not.toHaveBeenCalled();

			fireEvent.click(screen.getByRole("button", { name: "重玩" }));
			expect(onSelectChapter).toHaveBeenCalledWith(2);
		});

		it("確認時取消會回到章節清單，清單按 Esc 回標題選單", () => {
			const onSelectChapter = vi.fn();
			renderTitle({ hasSave: true, chapters, onSelectChapter });
			fireEvent.click(screen.getByRole("button", { name: "選章" }));
			press("ArrowDown");
			press("Enter");
			// 確認面板預設選「取消」
			press("Enter");
			expect(screen.getByRole("button", { name: "第二章 資料中心" })).toBeDefined();

			press("Escape");
			expect(screen.getByRole("button", { name: "繼續" })).toBeDefined();
			expect(onSelectChapter).not.toHaveBeenCalled();
		});
	});

	describe("練習模式", () => {
		it("沒給 onPractice 時不顯示", () => {
			renderTitle({ hasSave: true });
			expect(screen.queryByRole("button", { name: "練習模式" })).toBeNull();
		});

		it("沒有存檔也有「練習模式」，排在最後；鍵盤選到後 Enter 呼叫 onPractice", () => {
			const onPractice = vi.fn();
			const props = renderTitle({ hasSave: false, onPractice });
			const names = screen.getAllByRole("button").map((button) => button.textContent?.trim());
			expect(names).toEqual(["新遊戲", "設定", "練習模式"].map((name) => expect.stringContaining(name)));

			press("ArrowUp");
			press("Enter");
			expect(onPractice).toHaveBeenCalledTimes(1);
			expect(props.onNewGame).not.toHaveBeenCalled();
		});

		it("有存檔時不必確認，也不影響「繼續」與新遊戲的覆蓋確認", () => {
			const onPractice = vi.fn();
			const props = renderTitle({ hasSave: true, onPractice });
			// 「繼續」仍是預設選取的第一項
			press("Enter");
			expect(props.onContinue).toHaveBeenCalledTimes(1);

			fireEvent.click(screen.getByRole("button", { name: "練習模式" }));
			expect(onPractice).toHaveBeenCalledTimes(1);
			expect(screen.queryByTestId("confirm-panel")).toBeNull();

			// 新遊戲仍要確認覆蓋
			fireEvent.click(screen.getByRole("button", { name: "新遊戲" }));
			expect(screen.getByText("已有存檔，開始新遊戲會覆蓋它。")).toBeDefined();
		});
	});

	describe("通關（M14-1）", () => {
		const CHAPTERS = [
			{ number: 1, label: "第一章 冷凍艙" },
			{ number: 2, label: "第二章 資料中心" },
		];
		const RECORD = {
			chapters: CHAPTERS,
			stats: { "1": { playTimeMs: 125_000, errors: 3, hints: 1 } },
		};

		it("停在片尾之後（finished）時沒有「繼續」，「通關紀錄」排第一個並預設選取", () => {
			renderTitle({ hasSave: true, finished: true, clearRecord: RECORD });
			expect(screen.queryByRole("button", { name: "繼續" })).toBeNull();
			const names = screen.getAllByRole("button").map((button) => button.textContent?.trim());
			expect(names[0]).toContain("通關紀錄");

			press("Enter");
			expect(screen.getByRole("region", { name: "通關紀錄" })).toBeDefined();
		});

		it("通關後選章重玩（沒 finished）時「繼續」回來，「通關紀錄」排在它後面", () => {
			const props = renderTitle({ hasSave: true, clearRecord: RECORD });
			const names = screen.getAllByRole("button").map((button) => button.textContent?.trim());
			expect(names.slice(0, 2)).toEqual([expect.stringContaining("繼續"), expect.stringContaining("通關紀錄")]);
			press("Enter");
			expect(props.onContinue).toHaveBeenCalledTimes(1);
		});

		it("沒通關（沒給 clearRecord）時沒有「通關紀錄」", () => {
			renderTitle({ hasSave: true });
			expect(screen.queryByRole("button", { name: "通關紀錄" })).toBeNull();
		});

		it("通關紀錄列出每章與總計，沒紀錄的章節顯示破折號；Esc 回標題選單", () => {
			renderTitle({ hasSave: true, finished: true, clearRecord: RECORD });
			fireEvent.click(screen.getByRole("button", { name: "通關紀錄" }));

			const panel = screen.getByRole("region", { name: "通關紀錄" });
			const rows = Array.from(panel.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
			expect(rows[0]).toContain("第一章 冷凍艙");
			expect(rows[0]).toContain("2 分 5 秒");
			expect(rows[0]).toContain("3");
			expect(rows[1]).toContain("第二章 資料中心");
			expect(rows[1]).toContain("—");
			expect(panel.querySelector("tfoot")?.textContent).toContain("總計");

			press("Escape");
			expect(screen.queryByRole("region", { name: "通關紀錄" })).toBeNull();
			expect(screen.getByRole("button", { name: "新遊戲" })).toBeDefined();
		});
	});

	describe("存檔管理（M14-2）", () => {
		it("有給 onManageSave 時「存檔管理」排在設定後面、練習模式前面，沒有存檔也有", () => {
			const onManageSave = vi.fn();
			renderTitle({ hasSave: false, onManageSave, onPractice: vi.fn() });
			const names = screen.getAllByRole("button").map((button) => button.textContent?.trim());
			expect(names).toEqual(["新遊戲", "設定", "存檔管理", "練習模式"].map((name) => expect.stringContaining(name)));

			fireEvent.click(screen.getByRole("button", { name: "存檔管理" }));
			expect(onManageSave).toHaveBeenCalledTimes(1);
		});
	});

	it("CRT 效果預設全開，可由 props 關閉", () => {
		renderTitle();
		expect(screen.getByTestId("crt-scanlines")).toBeDefined();
		cleanup();
		renderTitle({ crt: { scanlines: false, vignette: false, flicker: false } });
		expect(screen.queryByTestId("crt-overlay")).toBeNull();
	});
});
