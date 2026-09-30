// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearCommand } from "./clear";
import { createContext } from "./gameCommandFixtures";

describe("clear 指令", () => {
	it("名稱是 clear", () => {
		expect(clearCommand.name).toBe("clear");
	});

	it("要求清空畫面且沒有輸出", () => {
		const result = clearCommand.run([], createContext());

		expect(result).toEqual({ ok: true, lines: [], clearScreen: true });
	});

	it("帶多餘參數也照常清空", () => {
		const result = clearCommand.run(["foo"], createContext());

		expect(result.ok).toBe(true);
		expect(result.clearScreen).toBe(true);
	});
});
