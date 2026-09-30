// @vitest-environment node
import { describe, expect, it } from "vitest";
import { historyEmpty } from "../messages";
import { createContext } from "./gameCommandFixtures";
import { historyCommand } from "./history";

describe("history 指令", () => {
	it("名稱是 history", () => {
		expect(historyCommand.name).toBe("history");
	});

	it("沒有紀錄時顯示空歷史訊息，而且不算錯誤", () => {
		const result = historyCommand.run([], createContext({ history: [] }));

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual(historyEmpty());
	});

	it("編號從 1 開始、寬度 4 右對齊，最舊的在前", () => {
		const result = historyCommand.run([], createContext({ history: ["ls", "cd pod_06", "pwd"] }));

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual(["   1  ls", "   2  cd pod_06", "   3  pwd"]);
	});

	it("編號超過 9 之後仍然右對齊", () => {
		const history = Array.from({ length: 10 }, (_, index) => `cmd${index + 1}`);
		const result = historyCommand.run([], createContext({ history }));

		expect(result.lines[8]).toBe("   9  cmd9");
		expect(result.lines[9]).toBe("  10  cmd10");
	});

	it("不會設定清畫面或 hint 旗標", () => {
		const result = historyCommand.run([], createContext({ history: ["ls"] }));

		expect(result.clearScreen).toBeUndefined();
		expect(result.hintUsed).toBeUndefined();
	});
});
