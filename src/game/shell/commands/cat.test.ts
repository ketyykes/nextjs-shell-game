// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, missingOperand } from "../messages";
import { catCommand, splitContentLines } from "./cat";
import { createContext } from "./testFixtures";

describe("cat", () => {
	it("指令名稱是 cat", () => {
		expect(catCommand.name).toBe("cat");
	});

	it("讀取單一檔案，內容切成多行", () => {
		const result = catCommand.run(["wake_up.txt"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["喚醒排程：三年後", "原始設定：永不", "修改者："],
		});
	});

	it("內容結尾的換行不會多印一個空行", () => {
		const result = catCommand.run(["/home/abin/day_900.txt"], createContext());

		expect(result.lines).toEqual(["不要相信那個聲音。"]);
	});

	it("可以用絕對路徑讀隱藏檔", () => {
		const result = catCommand.run(["/deck1/systems/power/breakers/B3/.override"], createContext());

		expect(result).toEqual({ ok: true, lines: ["RESET-B3-7734"] });
	});

	it("多個檔案依序串接，不加分隔", () => {
		const result = catCommand.run(["/deck1/systems/power/status.txt", "wake_up.txt"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["B3 斷路器：跳脫", "喚醒排程：三年後", "原始設定：永不", "修改者："],
		});
	});

	it("參數是目錄時回報 EISDIR 訊息，ok 為 false", () => {
		const result = catCommand.run(["pod_01"], createContext());

		expect(result).toEqual({ ok: false, lines: fsError("EISDIR", "pod_01") });
	});

	it("檔案不存在時回報 ENOENT 訊息，ok 為 false", () => {
		const result = catCommand.run(["sleep.txt"], createContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "sleep.txt") });
	});

	it("沒有參數時提示缺少檔名，ok 為 false", () => {
		const result = catCommand.run([], createContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("cat", "一個檔名，例如 cat wake_up.txt"),
		});
	});

	it("多檔案時其中一個失敗，其他內容仍輸出，錯誤放在對應位置，ok 為 false", () => {
		const result = catCommand.run(
			["/home/abin/day_900.txt", "missing.txt", "/deck1/systems/power/status.txt"],
			createContext(),
		);

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual([
			"不要相信那個聲音。",
			...fsError("ENOENT", "missing.txt"),
			"B3 斷路器：跳脫",
		]);
	});
});

describe("splitContentLines", () => {
	it("空檔案沒有任何輸出", () => {
		expect(splitContentLines("")).toEqual([]);
	});

	it("沒有結尾換行時保留最後一行", () => {
		expect(splitContentLines("a\nb")).toEqual(["a", "b"]);
	});

	it("只去掉最後一個換行，中間與結尾多出的空行照印", () => {
		expect(splitContentLines("a\n\nb\n\n")).toEqual(["a", "", "b", ""]);
	});
});
