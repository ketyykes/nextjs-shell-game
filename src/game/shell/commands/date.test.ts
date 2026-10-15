// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dateCannotSet, extraOperand, unknownOption } from "../messages";
import { DEFAULT_NOW, dateCommand, formatDate } from "./date";
import { createContext } from "./testFixtures";

/** 第一章喚醒的時間。 */
const WAKE = "2031-03-12T08:15:00Z";

function runDate(args: string[], now: string | undefined = WAKE) {
	return dateCommand.run(args, createContext({ now }));
}

describe("date 預設格式", () => {
	it("指令名稱是 date", () => {
		expect(dateCommand.name).toBe("date");
	});

	it("不給參數照 %a %b %e %H:%M:%S %Z %Y 印 context.now", () => {
		expect(runDate([])).toEqual({ ok: true, lines: ["Wed Mar 12 08:15:00 UTC 2031"] });
	});

	it("日期不足兩位補空白", () => {
		expect(runDate([], "2031-03-01T00:05:09Z").lines).toEqual(["Sat Mar  1 00:05:09 UTC 2031"]);
	});

	it("同一個 context 打幾次都是同一個時間（遊戲沒有會往前走的時鐘）", () => {
		const context = createContext({ now: WAKE });
		expect(dateCommand.run([], context).lines).toEqual(dateCommand.run([], context).lines);
	});

	it("context 沒有 now 時用喚醒時間", () => {
		expect(DEFAULT_NOW).toBe(WAKE);
		expect(runDate([], undefined).lines).toEqual(["Wed Mar 12 08:15:00 UTC 2031"]);
	});

	it("-u 接受（本來就是 UTC），可以跟格式一起用", () => {
		expect(runDate(["-u"]).lines).toEqual(["Wed Mar 12 08:15:00 UTC 2031"]);
		expect(runDate(["-u", "+%H:%M"]).lines).toEqual(["08:15"]);
	});
});

describe("date +格式", () => {
	it.each([
		["+%Y-%m-%d", "2031-03-12"],
		["+%F %T", "2031-03-12 08:15:00"],
		["+%D", "03/12/31"],
		["+%H:%M:%S", "08:15:00"],
		["+%a %b %e", "Wed Mar 12"],
		["+%A %B %d", "Wednesday March 12"],
		["+%j", "071"],
		["+%s", "1931069700"],
		["+%y %C", "31 20"],
		["+%Z %z", "UTC +0000"],
		["+%u %w", "3 3"],
		["+%I %p", "08 AM"],
		["+%R", "08:15"],
		["+100%%", "100%"],
		["+現在是 %H 點", "現在是 08 點"],
	])("%s 印出 %s", (format, expected) => {
		expect(runDate([format]).lines).toEqual([expected]);
	});

	it("%e 與 %k 不足兩位補空白，%d 與 %H 補零", () => {
		expect(runDate(["+[%e][%d][%k][%H]"], "2031-03-01T07:05:09Z").lines).toEqual(["[ 1][01][ 7][07]"]);
	});

	it("下午的 %I 與 %p", () => {
		expect(runDate(["+%I:%M %p"], "2031-03-12T14:02:00Z").lines).toEqual(["02:02 PM"]);
	});

	it("%n 換行、%t 是 Tab", () => {
		expect(runDate(["+%Y%n%m%t%d"]).lines).toEqual(["2031", "03\t12"]);
	});

	it("不認得的 % 寫法與結尾單獨的 % 照原樣印出（GNU 行為）", () => {
		expect(runDate(["+%Q %"]).lines).toEqual(["%Q %"]);
	});

	it("只有 + 印空行", () => {
		expect(runDate(["+"]).lines).toEqual([""]);
	});
});

describe("formatDate", () => {
	it("年內第幾天補到三位", () => {
		expect(formatDate(new Date("2031-01-05T00:00:00Z"), "%j")).toBe("005");
		expect(formatDate(new Date("2031-12-31T23:59:59Z"), "%j")).toBe("365");
	});

	it("午夜是 12 AM", () => {
		expect(formatDate(new Date("2031-03-12T00:30:00Z"), "%I %p %l")).toBe("12 AM 12");
	});
});

describe("date 的錯誤", () => {
	it("不認得的選項", () => {
		expect(runDate(["-d"])).toEqual({ ok: false, lines: unknownOption("date", "-d") });
		expect(runDate(["--date=now"])).toEqual({ ok: false, lines: unknownOption("date", "--date=now") });
	});

	it("不是 + 開頭的參數：這裡不能改時間", () => {
		expect(runDate(["0312081531"])).toEqual({ ok: false, lines: dateCannotSet("0312081531") });
	});

	it("給兩個格式時多一個參數", () => {
		expect(runDate(["+%Y", "+%m"])).toEqual({
			ok: false,
			lines: extraOperand("date", "+%m", "date [-u] [+格式]"),
		});
	});
});
