// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatPlayTime, totalStats } from "./stats";

describe("formatPlayTime", () => {
	it.each([
		[0, "0 秒"],
		[999, "0 秒"],
		[45_400, "45 秒"],
		[60_000, "1 分 0 秒"],
		[12 * 60_000 + 30_000, "12 分 30 秒"],
		[3_600_000, "1 小時 0 分"],
		[3_600_000 + 2 * 60_000 + 59_000, "1 小時 2 分"],
		[-5, "0 秒"],
		[Number.NaN, "0 秒"],
	])("%d 毫秒 → %s", (ms, expected) => {
		expect(formatPlayTime(ms)).toBe(expected);
	});
});

describe("totalStats", () => {
	it("把每章的時間、錯誤、hint 加總", () => {
		expect(
			totalStats({
				"1": { playTimeMs: 1000, errors: 2, hints: 1 },
				"3": { playTimeMs: 500, errors: 0, hints: 4 },
			}),
		).toEqual({ playTimeMs: 1500, errors: 2, hints: 5 });
	});

	it("沒有紀錄時全是 0", () => {
		expect(totalStats({})).toEqual({ playTimeMs: 0, errors: 0, hints: 0 });
	});
});
