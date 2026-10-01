import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChapterEndScreen, type ChapterEndScreenProps } from "./ChapterEndScreen";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面。
// 這組測試一律用真實計時器：假計時器會讓 motion 的動畫卡住。
afterEach(() => {
	cleanup();
});

const OUTRO_LINES = ["資料中心在那邊。", "答案應該在那裡。", "但那裡的日誌……有幾千份。"];

function createProps(overrides: Partial<ChapterEndScreenProps> = {}): ChapterEndScreenProps {
	return {
		chapterNumber: 1,
		chapterTitle: "冷凍艙與維生艙",
		outroLines: OUTRO_LINES,
		learnedCommands: ["pwd", "ls -a", "cat"],
		textSpeed: "instant",
		onReturnToTitle: vi.fn(),
		...overrides,
	};
}

function pressEnter() {
	fireEvent.keyDown(window, { key: "Enter" });
}

/** 從 outro 連按 Enter 走完全部台詞，進到 recap。 */
function goToRecap() {
	for (let index = 0; index < OUTRO_LINES.length; index += 1) {
		pressEnter();
	}
}

describe("ChapterEndScreen", () => {
	it("onMounted 只呼叫一次（含 StrictMode）", () => {
		const onMounted = vi.fn();
		render(
			<StrictMode>
				<ChapterEndScreen {...createProps({ onMounted })} />
			</StrictMode>,
		);
		expect(onMounted).toHaveBeenCalledTimes(1);
	});

	it("重新 render 不會再呼叫 onMounted", () => {
		const onMounted = vi.fn();
		const props = createProps({ onMounted });
		const { rerender } = render(<ChapterEndScreen {...props} />);
		rerender(<ChapterEndScreen {...props} onMounted={onMounted} chapterTitle="別的標題" />);
		expect(onMounted).toHaveBeenCalledTimes(1);
	});

	it("outro 階段顯示對話框語意與第一句台詞", () => {
		render(<ChapterEndScreen {...createProps()} />);
		const dialog = screen.getByRole("dialog", { name: "章節結束" });
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe(OUTRO_LINES[0]);
		expect(screen.getByText("NOVA")).toBeTruthy();
	});

	it("沒有插圖時顯示世界觀內的佔位文字，有插圖時顯示 img", () => {
		// 佔位文字不可以把「M6 產圖」這種開發內部字樣露給玩家
		const { unmount } = render(<ChapterEndScreen {...createProps()} />);
		expect(screen.getByText("影像訊號遺失")).toBeTruthy();
		unmount();

		render(<ChapterEndScreen {...createProps({ illustrationSrc: "/scenes/ch1-end.png" })} />);
		expect(screen.queryByText("影像訊號遺失")).toBeNull();
		const image = screen.getByTestId("chapter-end-illustration");
		expect(image.getAttribute("src")).toBe("/scenes/ch1-end.png");
	});

	it("最後一句打完才顯示「按 Enter 繼續」", () => {
		render(<ChapterEndScreen {...createProps()} />);
		expect(screen.queryByTestId("chapter-end-continue-hint")).toBeNull();
		pressEnter();
		pressEnter();
		expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe(OUTRO_LINES[2]);
		expect(screen.getByTestId("chapter-end-continue-hint").textContent).toBe("按 Enter 繼續");
	});

	it("打字中按 Enter 會先顯示整句，再按才前進", async () => {
		// slow 速度（60ms 一個字）下，剛掛載時還沒打完
		render(<ChapterEndScreen {...createProps({ textSpeed: "slow" })} />);
		expect(screen.getByTestId("chapter-end-outro-text").textContent).not.toContain(OUTRO_LINES[0]);

		pressEnter();
		expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe(OUTRO_LINES[0]);

		pressEnter();
		await waitFor(() => {
			expect(screen.getByTestId("chapter-end-outro-text").textContent).not.toBe(OUTRO_LINES[0]);
		});
	});

	it("每句停留 lineHoldMs 後自動接下一句", async () => {
		render(<ChapterEndScreen {...createProps({ lineHoldMs: 0 })} />);
		await waitFor(() => {
			expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe(OUTRO_LINES[2]);
		});
		// 最後一句不會自動進回顧卡
		expect(screen.getByTestId("chapter-end-outro")).toBeTruthy();
	});

	it("outro 階段點畫面任何地方等同按 Enter", () => {
		render(<ChapterEndScreen {...createProps()} />);
		fireEvent.click(screen.getByRole("dialog"));
		expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe(OUTRO_LINES[1]);
	});

	it("按 Enter 走完台詞後進 recap，顯示章節標題與每個指令及說明", () => {
		render(<ChapterEndScreen {...createProps()} />);
		goToRecap();

		expect(screen.getByText("第 1 章 冷凍艙與維生艙 完成")).toBeTruthy();
		expect(screen.getByText("pwd")).toBeTruthy();
		expect(screen.getByText("顯示你現在所在的目錄")).toBeTruthy();
		// "ls -a" 要拿 ls 的說明
		expect(screen.getByText("ls -a")).toBeTruthy();
		expect(screen.getByText("列出目錄裡有什麼")).toBeTruthy();
		expect(screen.getByText("cat")).toBeTruthy();
	});

	it("查不到說明的指令只顯示名稱，不會壞掉", () => {
		render(<ChapterEndScreen {...createProps({ learnedCommands: ["not-a-command"] })} />);
		goToRecap();
		expect(screen.getByText("not-a-command")).toBeTruthy();
	});

	it("outro 已播過（skipOutro）時直接從回顧卡開始，不再播台詞", () => {
		render(<ChapterEndScreen {...createProps({ skipOutro: true })} />);
		expect(screen.getByTestId("chapter-end-recap")).toBeTruthy();
		expect(screen.queryByTestId("chapter-end-outro")).toBeNull();
	});

	it("回顧卡上管線、重導向與變數展開也有說明，不是空白", () => {
		render(<ChapterEndScreen {...createProps({ learnedCommands: [">", "|", ">>", "$變數"] })} />);
		goToRecap();
		expect(screen.getByText("把指令的輸出寫進檔案，覆蓋原本的內容")).toBeTruthy();
		expect(screen.getByText("把左邊指令的輸出交給右邊的指令處理")).toBeTruthy();
		expect(screen.getByText("把指令的輸出接在檔案的結尾")).toBeTruthy();
		expect(screen.getByText("讀出環境變數存的值")).toBeTruthy();
	});

	it("recap 按「繼續」進 done，顯示「下一章開發中」", () => {
		render(<ChapterEndScreen {...createProps()} />);
		goToRecap();
		fireEvent.click(screen.getByRole("button", { name: "繼續" }));
		expect(screen.getByText("下一章開發中")).toBeTruthy();
		expect(screen.queryByText("指令回顧")).toBeNull();
	});

	it("recap 階段按 Enter 等同按「繼續」", () => {
		render(<ChapterEndScreen {...createProps()} />);
		goToRecap();
		pressEnter();
		expect(screen.getByText("下一章開發中")).toBeTruthy();
	});

	it("done 階段按「回標題」呼叫 onReturnToTitle", () => {
		const onReturnToTitle = vi.fn();
		render(<ChapterEndScreen {...createProps({ onReturnToTitle })} />);
		goToRecap();
		pressEnter();
		expect(onReturnToTitle).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "回標題" }));
		expect(onReturnToTitle).toHaveBeenCalledTimes(1);
	});

	it("done 階段按 Enter 也會回標題", () => {
		const onReturnToTitle = vi.fn();
		render(<ChapterEndScreen {...createProps({ onReturnToTitle })} />);
		goToRecap();
		pressEnter();
		pressEnter();
		expect(onReturnToTitle).toHaveBeenCalledTimes(1);
	});

	it("有下一章時 done 顯示「進入第 N 章」，Enter 與按鈕都呼叫 onNextChapter，回標題另有按鈕", () => {
		const onNextChapter = vi.fn();
		const onReturnToTitle = vi.fn();
		render(
			<ChapterEndScreen
				{...createProps({ onNextChapter, onReturnToTitle })}
				nextChapter={{ number: 2, title: "資料中心", deckName: "資料中心" }}
			/>,
		);
		goToRecap();
		pressEnter();
		expect(screen.getByText("第 2 章 資料中心")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "進入第 2 章" }));
		expect(onNextChapter).toHaveBeenCalledTimes(1);
		pressEnter();
		expect(onNextChapter).toHaveBeenCalledTimes(2);
		expect(onReturnToTitle).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "回標題" }));
		expect(onReturnToTitle).toHaveBeenCalledTimes(1);
	});

	it("有片尾時 recap 之後逐句打片尾，最後一句按 Enter 回標題", () => {
		const onReturnToTitle = vi.fn();
		render(
			<ChapterEndScreen
				{...createProps({ onReturnToTitle })}
				ending={{ lines: ["喚醒程序……完成。", "你是……"], illustrationSrc: "/scenes/scene-ending.png" }}
			/>,
		);
		goToRecap();
		pressEnter();
		expect(screen.getByTestId("chapter-end-ending")).toBeTruthy();
		expect(screen.getByText("救援船終端機")).toBeTruthy();
		expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe("喚醒程序……完成。");
		expect(screen.getByTestId("chapter-end-illustration").getAttribute("src")).toBe("/scenes/scene-ending.png");
		pressEnter();
		expect(screen.getByTestId("chapter-end-outro-text").textContent).toBe("你是……");
		expect(screen.getByTestId("chapter-end-continue-hint").textContent).toBe("按 Enter 回標題");
		expect(onReturnToTitle).not.toHaveBeenCalled();
		pressEnter();
		expect(onReturnToTitle).toHaveBeenCalledTimes(1);
	});

	it("卸載後不再監聽 Enter", () => {
		const onReturnToTitle = vi.fn();
		const { unmount } = render(<ChapterEndScreen {...createProps({ onReturnToTitle })} />);
		goToRecap();
		pressEnter();
		unmount();
		pressEnter();
		expect(onReturnToTitle).not.toHaveBeenCalled();
	});
});
