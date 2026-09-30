// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hintExhausted } from "../messages";
import { createContext } from "./gameCommandFixtures";
import { hintCommand } from "./hint";

const THREE_HINTS = ["先搞清楚你在哪個目錄", "試試 pwd", "輸入 pwd，會印出目前所在的目錄"];

describe("hint 指令", () => {
	it("名稱是 hint", () => {
		expect(hintCommand.name).toBe("hint");
	});

	it("第 1 次給第 1 段，格式為「提示 1/3：內容」", () => {
		const result = hintCommand.run([], createContext({ hints: THREE_HINTS, hintCount: 0 }));

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual(["提示 1/3：先搞清楚你在哪個目錄"]);
	});

	it("第 2 次給第 2 段", () => {
		const result = hintCommand.run([], createContext({ hints: THREE_HINTS, hintCount: 1 }));

		expect(result.lines).toEqual(["提示 2/3：試試 pwd"]);
	});

	it("第 3 次給第 3 段，還不算用完，沒有額外提醒", () => {
		const result = hintCommand.run([], createContext({ hints: THREE_HINTS, hintCount: 2 }));

		expect(result.lines).toEqual(["提示 3/3：輸入 pwd，會印出目前所在的目錄"]);
	});

	it("第 4 次仍給第 3 段，並附上提示用完的訊息", () => {
		const result = hintCommand.run([], createContext({ hints: THREE_HINTS, hintCount: 3 }));

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual(["提示 3/3：輸入 pwd，會印出目前所在的目錄", ...hintExhausted()]);
	});

	it("次數遠超過段數也維持給最後一段", () => {
		const result = hintCommand.run([], createContext({ hints: THREE_HINTS, hintCount: 99 }));

		expect(result.lines[0]).toBe("提示 3/3：輸入 pwd，會印出目前所在的目錄");
	});

	it.each([0, 1, 2, 3, 4])("hintCount 為 %i 時 hintUsed 是 true", (hintCount) => {
		const result = hintCommand.run([], createContext({ hints: THREE_HINTS, hintCount }));

		expect(result.hintUsed).toBe(true);
	});

	it("只有一段時重複給同一段，第一次不附用完提示，之後才附", () => {
		const hints = ["先看看四周"];

		const first = hintCommand.run([], createContext({ hints, hintCount: 0 }));
		expect(first.lines).toEqual(["提示 1/1：先看看四周"]);

		const second = hintCommand.run([], createContext({ hints, hintCount: 1 }));
		expect(second.lines).toEqual(["提示 1/1：先看看四周", ...hintExhausted()]);
	});

	it("hints 是空陣列時印一行說明，不算錯誤，也不增加計數", () => {
		const result = hintCommand.run([], createContext({ hints: [], hintCount: 0 }));

		expect(result.ok).toBe(true);
		expect(result.lines).toHaveLength(1);
		expect(result.hintUsed).toBeUndefined();
	});

	it("段內容含換行時拆成多行，只有第一行帶前綴", () => {
		const hints = ["第一行\n第二行\n第三行"];
		const result = hintCommand.run([], createContext({ hints, hintCount: 0 }));

		expect(result.lines).toEqual(["提示 1/1：第一行", "第二行", "第三行"]);
	});
});
