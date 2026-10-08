// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PagerRequest } from "@/game/shell/types";
import {
	charDisplayWidth,
	createPagerState,
	describePagerStatus,
	handlePagerKey,
	highlightSegments,
	PAGER_MESSAGES,
	setSearchInput,
	visibleLineRange,
	wrapLines,
} from "./pagerModel";
import type { PagerKeyInput, PagerState, PagerView } from "./pagerModel";

/** 用欄數當寬度：半形 1、全形 2。 */
function wrapByColumns(lines: string[], columns: number) {
	return wrapLines(lines, columns, charDisplayWidth);
}

/** 建一個 `lines` 行、每頁 `pageSize` 行、不換行的畫面。 */
function createView(lines: string[], pageSize: number, fileCount = 1): PagerView {
	return { lines, rows: wrapByColumns(lines, Infinity), pageSize, fileCount };
}

function numberedLines(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `line ${index + 1}`);
}

function key(value: string, ctrlKey = false): PagerKeyInput {
	return { key: value, ctrlKey };
}

/** 依序按一串鍵，回傳最後的狀態與是否離開。 */
function press(view: PagerView, keys: (string | PagerKeyInput)[], start: PagerState = createPagerState()) {
	let state = start;
	let quit = false;
	for (const item of keys) {
		const input = typeof item === "string" ? key(item) : item;
		const result = handlePagerKey(state, input, view);
		state = result.state;
		quit = result.quit;
	}
	return { state, quit };
}

describe("charDisplayWidth 與 wrapLines", () => {
	it("中文與全形字算兩格，英數算一格", () => {
		expect(charDisplayWidth("a")).toBe(1);
		expect(charDisplayWidth("中")).toBe(2);
		expect(charDisplayWidth("：")).toBe(2);
		expect(charDisplayWidth("　")).toBe(2);
	});

	it("太長的行折成好幾列，記得是哪一行、是不是第一列", () => {
		expect(wrapByColumns(["abcdefg", "", "xy"], 3)).toEqual([
			{ lineIndex: 0, text: "abc", first: true },
			{ lineIndex: 0, text: "def", first: false },
			{ lineIndex: 0, text: "g", first: false },
			{ lineIndex: 1, text: "", first: true },
			{ lineIndex: 2, text: "xy", first: true },
		]);
	});

	it("全形字不會被拆到兩列中間", () => {
		expect(wrapByColumns(["a中文b"], 4).map((row) => row.text)).toEqual(["a中", "文b"]);
	});

	it("一個字就比寬度還寬時照樣放一個，不會卡住", () => {
		expect(wrapByColumns(["中文"], 1).map((row) => row.text)).toEqual(["中", "文"]);
	});
});

describe("handlePagerKey 翻頁", () => {
	const view = createView(numberedLines(50), 10);

	it("空白、f、PageDown、Ctrl+F 往下一頁", () => {
		for (const input of [key(" "), key("f"), key("PageDown"), key("f", true)]) {
			expect(press(view, [input]).state.top).toBe(10);
		}
	});

	it("b、PageUp、Ctrl+B 往上一頁，不會超過開頭", () => {
		expect(press(view, [" ", " ", "b"]).state.top).toBe(10);
		expect(press(view, [" ", "PageUp", "PageUp"]).state.top).toBe(0);
		expect(press(view, [" ", key("b", true)]).state.top).toBe(0);
	});

	it("翻到底停在最後一頁（最後一行在畫面最下面）", () => {
		expect(press(view, [" ", " ", " ", " ", " ", " "]).state.top).toBe(40);
	});

	it("↓ j Enter 往下一行，↑ k 往上一行", () => {
		expect(press(view, ["ArrowDown", "j", "Enter"]).state.top).toBe(3);
		expect(press(view, ["ArrowDown", "j", "ArrowUp"]).state.top).toBe(1);
		expect(press(view, ["k"]).state.top).toBe(0);
	});

	it("d、u 半頁", () => {
		expect(press(view, ["d"]).state.top).toBe(5);
		expect(press(view, ["d", "d", "u"]).state.top).toBe(5);
	});

	it("g 到開頭，G 到結尾；Home、End 也可以", () => {
		expect(press(view, ["G"]).state.top).toBe(40);
		expect(press(view, ["G", "g"]).state.top).toBe(0);
		expect(press(view, ["End", "Home"]).state.top).toBe(0);
	});

	it("內容不到一頁時怎麼翻都在開頭", () => {
		expect(press(createView(numberedLines(3), 10), [" ", "G", "j"]).state.top).toBe(0);
	});

	it("q、Q、Esc 離開", () => {
		for (const name of ["q", "Q", "Escape"]) {
			expect(press(view, [name]).quit).toBe(true);
		}
		expect(press(view, [" "]).quit).toBe(false);
	});

	it("認得的鍵回報有處理，不認得的鍵（F5、F12、Tab、單按 Shift）回報沒處理、狀態不變", () => {
		for (const name of [" ", "j", "G", "/", ":", "q", "Escape"]) {
			expect(handlePagerKey(createPagerState(), key(name), view).handled).toBe(true);
		}
		const start = { ...createPagerState(), top: 5, message: PAGER_MESSAGES.notFound };
		for (const name of ["F5", "F12", "Tab", "Shift"]) {
			expect(handlePagerKey(start, key(name), view)).toEqual({ state: start, quit: false, handled: false });
		}
		expect(handlePagerKey(start, key("r", true), view).handled).toBe(false);
	});
});

describe("handlePagerKey 搜尋", () => {
	const lines = ["NOVA boot", "door A1 OPEN", "door A2 OPEN", "ALL LOCK", "door B1 OPEN", ...numberedLines(20), "door Z9 OPEN"];
	const view = createView(lines, 5);

	it("/ 進入輸入模式，打字累積在輸入列，Enter 跳到第一個符合的行放在最上面", () => {
		const typing = press(view, ["/", "L", "O", "C", "K"]);
		expect(typing.state.mode).toBe("search");
		expect(typing.state.input).toBe("LOCK");

		const found = press(view, ["Enter"], typing.state);
		expect(found.state).toMatchObject({ mode: "normal", top: 3, pattern: "LOCK", targetLine: 3 });
	});

	it("從畫面最上面那行開始找，所以最上面那行符合時不動", () => {
		expect(press(view, ["/", "N", "O", "V", "A", "Enter"]).state).toMatchObject({ top: 0, targetLine: 0 });
	});

	it("n 找下一個、N 找上一個", () => {
		const first = press(view, ["/", "d", "o", "o", "r", "Enter"]);
		expect(first.state.targetLine).toBe(1);
		const second = press(view, ["n"], first.state);
		expect(second.state).toMatchObject({ targetLine: 2, top: 2 });
		const back = press(view, ["N"], second.state);
		expect(back.state).toMatchObject({ targetLine: 1, top: 1 });
	});

	it("跳到太後面時停在最後一頁", () => {
		const result = press(view, ["/", "Z", "9", "Enter"]);
		expect(result.state).toMatchObject({ targetLine: 25, top: lines.length - 5 });
	});

	it("用 grep -E 的正規表示式", () => {
		expect(press(view, ["/", "B", "[", "0", "-", "9", "]", "Enter"]).state.targetLine).toBe(4);
	});

	it("? 往上找，從畫面最下面那行開始", () => {
		const atEnd = press(view, ["G"]);
		const result = press(view, ["?", "L", "O", "C", "K", "Enter"], atEnd.state);
		expect(result.state).toMatchObject({ targetLine: 3, top: 3, lastDirection: "backward" });
		expect(press(view, ["n"], result.state).state.message).toBe(PAGER_MESSAGES.notFound);
	});

	it("找不到時留在原地並顯示訊息，下一個鍵清掉訊息", () => {
		const result = press(view, [" ", "/", "x", "y", "z", "Enter"]);
		expect(result.state).toMatchObject({ top: 5, message: PAGER_MESSAGES.notFound });
		expect(press(view, ["j"], result.state).state.message).toBeNull();
	});

	it("最後一個之後再按 n 顯示找不到，不會繞回開頭", () => {
		const last = press(view, ["/", "Z", "9", "Enter"]);
		expect(press(view, ["n"], last.state).state.message).toBe(PAGER_MESSAGES.notFound);
	});

	it("還沒搜尋過就按 n 提示先用 /", () => {
		expect(press(view, ["n"]).state.message).toBe(PAGER_MESSAGES.noPreviousSearch);
	});

	it("樣式不合法時顯示訊息", () => {
		expect(press(view, ["/", "[", "Enter"]).state.message).toBe(PAGER_MESSAGES.invalidPattern);
	});

	it("輸入中 Backspace 刪一個字，刪光再按就回到一般模式；Esc 取消搜尋但不離開分頁", () => {
		const typed = press(view, ["/", "a", "b", "Backspace"]);
		expect(typed.state.input).toBe("a");
		expect(press(view, ["Backspace", "Backspace"], typed.state).state.mode).toBe("normal");
		const cancelled = press(view, ["Escape"], typed.state);
		expect(cancelled).toMatchObject({ quit: false, state: { mode: "normal", input: "" } });
	});

	it("輸入中 Tab、F5 這類不是字的鍵回報沒處理，Esc 與字元有處理", () => {
		const typing = press(view, ["/", "a"]).state;
		expect(handlePagerKey(typing, key("Tab"), view)).toMatchObject({ handled: false, state: { input: "a" } });
		expect(handlePagerKey(typing, key("F5"), view).handled).toBe(false);
		expect(handlePagerKey(typing, key("Escape"), view).handled).toBe(true);
		expect(handlePagerKey(typing, key("q"), view).handled).toBe(true);
	});

	it("輸入中的 q 是字不是離開", () => {
		const result = press(view, ["/", "q"]);
		expect(result).toMatchObject({ quit: false, state: { input: "q" } });
	});

	it("空白的 / 直接 Enter 沿用上一次的樣式", () => {
		const first = press(view, ["/", "d", "o", "o", "r", "Enter"]);
		expect(press(view, ["/", "Enter"], first.state).state.targetLine).toBe(1);
	});

	it("setSearchInput 整段換掉輸入中的樣式（輸入法送出的中文、貼上），Enter 照樣搜尋", () => {
		const chineseView = createView(["開機", "門禁 正常", "門禁 鎖定", ...numberedLines(10)], 3);
		const typing = press(chineseView, ["/"]);
		const composed = setSearchInput(typing.state, "鎖定");
		expect(composed).toMatchObject({ mode: "search", input: "鎖定" });
		expect(press(chineseView, ["Enter"], composed).state).toMatchObject({ mode: "normal", pattern: "鎖定", targetLine: 2 });
	});

	it("setSearchInput 不在輸入模式時不動", () => {
		const state = createPagerState();
		expect(setSearchInput(state, "鎖定")).toBe(state);
	});
});

describe("handlePagerKey 多個檔案", () => {
	const view = createView(numberedLines(30), 10, 3);

	it(":n 換下一個檔案並回到開頭，:p 回上一個", () => {
		const next = press(view, [" ", ":", "n"]);
		expect(next.state).toMatchObject({ fileIndex: 1, top: 0, mode: "normal" });
		expect(press(view, [":", "p"], next.state).state.fileIndex).toBe(0);
	});

	it("已經是最後一個或第一個時顯示訊息", () => {
		expect(press(view, [":", "p"]).state.message).toBe(PAGER_MESSAGES.noPreviousFile);
		const last = press(view, [":", "n", ":", "n", ":", "n"]);
		expect(last.state).toMatchObject({ fileIndex: 2, message: PAGER_MESSAGES.noNextFile });
	});

	it(": 後面接 F5 這類不是字的鍵回報沒處理，仍在等下一個鍵", () => {
		const colon = press(view, [":"]).state;
		expect(handlePagerKey(colon, key("F5"), view)).toMatchObject({ handled: false, state: { mode: "colon" } });
		expect(handlePagerKey(colon, key("Escape"), view)).toMatchObject({ handled: true, quit: false, state: { mode: "normal" } });
	});

	it(":q 也是離開，: 後面接別的鍵就取消", () => {
		expect(press(view, [":", "q"]).quit).toBe(true);
		expect(press(view, [":", "x"]).state).toMatchObject({ mode: "normal", fileIndex: 0 });
	});
});

describe("describePagerStatus 與 visibleLineRange", () => {
	const request: PagerRequest = {
		files: [
			{ name: "door_events.log", lines: numberedLines(40) },
			{ name: "nova_core.log", lines: numberedLines(3) },
		],
		lineNumbers: false,
	};

	it("顯示檔名、第幾個檔案、看到第幾行與百分比", () => {
		const view = createView(request.files[0].lines, 10, 2);
		expect(describePagerStatus(createPagerState(), view, request)).toBe(
			"door_events.log (file 1 of 2) lines 1-10/40 25%",
		);
	});

	it("翻到底顯示 (END)，還有下一個檔案時提示 :n", () => {
		const view = createView(request.files[0].lines, 10, 2);
		const end = press(view, ["G"]).state;
		expect(describePagerStatus(end, view, request)).toBe(
			"door_events.log (file 1 of 2) lines 31-40/40 (END) - Next: nova_core.log",
		);
	});

	it("只有一個檔案時不顯示第幾個；管線輸入沒有檔名", () => {
		const single: PagerRequest = { files: [{ name: null, lines: numberedLines(3) }], lineNumbers: false };
		const view = createView(single.files[0].lines, 10);
		expect(describePagerStatus(createPagerState(), view, single)).toBe("lines 1-3/3 (END)");
	});

	it("空的內容只顯示 (END)", () => {
		const empty: PagerRequest = { files: [{ name: "empty.log", lines: [] }], lineNumbers: false };
		expect(describePagerStatus(createPagerState(), createView([], 10), empty)).toBe("empty.log (END)");
	});

	it("輸入搜尋時狀態列是輸入列，有訊息時顯示訊息", () => {
		const view = createView(request.files[0].lines, 10, 2);
		expect(describePagerStatus(press(view, ["/", "a"]).state, view, request)).toBe("/a");
		expect(describePagerStatus(press(view, ["?"]).state, view, request)).toBe("?");
		expect(describePagerStatus(press(view, [":"]).state, view, request)).toBe(":");
		expect(describePagerStatus(press(view, ["n"]).state, view, request)).toBe(PAGER_MESSAGES.noPreviousSearch);
	});

	it("折行時以邏輯行計算看到的範圍", () => {
		const rows = wrapByColumns(["aaaaaa", "b", "c"], 3);
		const view: PagerView = { lines: ["aaaaaa", "b", "c"], rows, pageSize: 2, fileCount: 1 };
		expect(visibleLineRange(createPagerState(), view)).toEqual({ first: 1, last: 1 });
		expect(visibleLineRange(press(view, ["j"]).state, view)).toEqual({ first: 1, last: 2 });
	});
});

describe("highlightSegments", () => {
	it("把一列切成符合與不符合的片段", () => {
		expect(highlightSegments("door A1 OPEN door", "door")).toEqual([
			{ text: "door", match: true },
			{ text: " A1 OPEN ", match: false },
			{ text: "door", match: true },
		]);
	});

	it("沒有樣式或樣式不合法時整列不標", () => {
		expect(highlightSegments("abc", null)).toEqual([{ text: "abc", match: false }]);
		expect(highlightSegments("abc", "[")).toEqual([{ text: "abc", match: false }]);
	});
});
