// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	acceptSearch,
	cancelSearch,
	currentMatch,
	searchOlder,
	searchPromptLabel,
	startHistorySearch,
	updateSearchQuery,
} from "./historySearch";
import type { HistorySearchState } from "./historySearch";

/** 最舊在前，跟 `Shell.historyEntries` 一樣。 */
const HISTORY = ["ls", "cat wake_up.txt", "cd pod_06", "cat notes.txt", "pwd", "cat notes.txt | wc -l"];

/** 從空白搜尋開始，依序把關鍵字打成 `query`（一次一個字，跟玩家打字一樣）。 */
function typed(query: string, history: readonly string[] = HISTORY, originalLine = ""): HistorySearchState {
	let state = startHistorySearch(originalLine);
	let current = "";
	for (const char of Array.from(query)) {
		current += char;
		state = updateSearchQuery(history, state, current);
	}
	return state;
}

describe("startHistorySearch", () => {
	it("剛進搜尋模式：關鍵字空白、還沒有符合的、不是失敗，記下原本輸入列上的內容", () => {
		const state = startHistorySearch("echo 打到一半");
		expect(state).toEqual({ originalLine: "echo 打到一半", query: "", matchIndex: null, failed: false });
		expect(currentMatch(HISTORY, state)).toBeNull();
	});
});

describe("updateSearchQuery：打字即時搜尋", () => {
	it("從最新往舊找第一筆含關鍵字的（子字串比對）", () => {
		expect(currentMatch(HISTORY, typed("cat"))).toBe("cat notes.txt | wc -l");
		expect(currentMatch(HISTORY, typed("wake"))).toBe("cat wake_up.txt");
		expect(currentMatch(HISTORY, typed("d p"))).toBe("cd pod_06");
	});

	it("中文關鍵字也找得到", () => {
		const history = ["echo 你好", "ls", "echo 再見"];
		expect(currentMatch(history, typed("你好", history))).toBe("echo 你好");
	});

	it("關鍵字變長時從目前符合的那筆往舊找（bash 行為），目前那筆還符合就留著", () => {
		let state = typed("cat");
		state = searchOlder(HISTORY, state);
		expect(currentMatch(HISTORY, state)).toBe("cat notes.txt");
		state = updateSearchQuery(HISTORY, state, "cat ");
		expect(currentMatch(HISTORY, state)).toBe("cat notes.txt");
		state = updateSearchQuery(HISTORY, state, "cat w");
		expect(currentMatch(HISTORY, state)).toBe("cat wake_up.txt");
	});

	it("找不到時標成失敗，畫面上留著上一筆符合的", () => {
		const state = typed("catx");
		expect(state.failed).toBe(true);
		expect(state.query).toBe("catx");
		expect(currentMatch(HISTORY, state)).toBe("cat notes.txt | wc -l");
	});

	it("一開始就找不到時沒有符合的那筆", () => {
		const state = typed("zzz");
		expect(state.failed).toBe(true);
		expect(currentMatch(HISTORY, state)).toBeNull();
	});

	it("刪字（關鍵字不是變長）時從最新的重新找，失敗狀態跟著解除", () => {
		let state = typed("catx");
		state = updateSearchQuery(HISTORY, state, "cat");
		expect(state.failed).toBe(false);
		expect(currentMatch(HISTORY, state)).toBe("cat notes.txt | wc -l");
	});

	it("關鍵字刪光時回到還沒找的狀態", () => {
		const state = updateSearchQuery(HISTORY, typed("cat"), "");
		expect(state).toMatchObject({ query: "", matchIndex: null, failed: false });
	});

	it("沒有歷史時一律失敗", () => {
		const state = typed("ls", []);
		expect(state.failed).toBe(true);
		expect(currentMatch([], state)).toBeNull();
	});
});

describe("searchOlder：再按 Ctrl+R", () => {
	it("往更舊找下一筆含關鍵字的", () => {
		let state = typed("cat");
		state = searchOlder(HISTORY, state);
		expect(currentMatch(HISTORY, state)).toBe("cat notes.txt");
		state = searchOlder(HISTORY, state);
		expect(currentMatch(HISTORY, state)).toBe("cat wake_up.txt");
	});

	it("到最舊還找不到時標成失敗，留在最後一筆符合的", () => {
		let state = typed("cat");
		state = searchOlder(HISTORY, searchOlder(HISTORY, state));
		state = searchOlder(HISTORY, state);
		expect(state.failed).toBe(true);
		expect(currentMatch(HISTORY, state)).toBe("cat wake_up.txt");
	});

	it("跳過跟目前那筆一模一樣的重複歷史（readline 行為）", () => {
		const history = ["cat a", "ls", "cat a", "pwd", "cat a"];
		let state = typed("cat", history);
		expect(state.matchIndex).toBe(4);
		state = searchOlder(history, state);
		expect(state.failed).toBe(true);
		expect(state.matchIndex).toBe(4);
	});

	it("關鍵字空白時用上一次搜尋的關鍵字，從最新的開始找", () => {
		const state = searchOlder(HISTORY, startHistorySearch(""), "wake");
		expect(state.query).toBe("wake");
		expect(currentMatch(HISTORY, state)).toBe("cat wake_up.txt");
	});

	it("關鍵字空白又沒有上一次的關鍵字時什麼都不做", () => {
		const start = startHistorySearch("");
		expect(searchOlder(HISTORY, start)).toEqual(start);
	});
});

describe("離開搜尋", () => {
	it("acceptSearch 帶回目前符合的那筆（Enter、Esc、← →）", () => {
		expect(acceptSearch(HISTORY, typed("pod"))).toBe("cd pod_06");
	});

	it("acceptSearch 沒有符合的時候留著原本輸入列上的內容", () => {
		expect(acceptSearch(HISTORY, typed("zzz", HISTORY, "echo 原本"))).toBe("echo 原本");
		expect(acceptSearch(HISTORY, startHistorySearch("echo 原本"))).toBe("echo 原本");
	});

	it("失敗時帶回畫面上留著的上一筆符合的", () => {
		expect(acceptSearch(HISTORY, typed("podx"))).toBe("cd pod_06");
	});

	it("cancelSearch（Ctrl+G）還原進搜尋前的輸入列", () => {
		expect(cancelSearch(typed("pod", HISTORY, "echo 原本"))).toBe("echo 原本");
	});
});

describe("searchPromptLabel", () => {
	it("照 bash 的寫法顯示提示符，失敗時加 failed", () => {
		expect(searchPromptLabel(typed("cat"))).toBe("(reverse-i-search)`");
		expect(searchPromptLabel(typed("zzz"))).toBe("(failed reverse-i-search)`");
	});
});
