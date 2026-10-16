// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyStutter, STUTTER_MARK, stutterPoints } from "./novaStutter";

describe("stutterPoints／applyStutter（NOVA 斷句）", () => {
	const LINE = "你確定你是技師嗎我查不到你的名字這不太對應該有名字的";

	it("每隔幾個字插一次，同一句每次一樣", () => {
		const points = stutterPoints(LINE);
		expect(points.length).toBeGreaterThanOrEqual(2);
		expect(stutterPoints(LINE)).toEqual(points);
		for (let index = 1; index < points.length; index += 1) {
			const gap = points[index] - points[index - 1];
			expect(gap).toBeGreaterThanOrEqual(4);
			expect(gap).toBeLessThanOrEqual(10);
		}
	});

	it("只斷在兩個中文字之間：不斷在標點旁、不拆開英數（指令與路徑照樣能抄）", () => {
		const text = "技師，試試 ls /home/tech，然後用 cat wake_up.txt 讀喚醒排程，那個檔案寫得很清楚。";
		const chars = Array.from(text);
		for (const point of stutterPoints(text)) {
			expect(chars[point - 1]).toMatch(/\p{Script=Han}/u);
			expect(chars[point]).toMatch(/\p{Script=Han}/u);
		}
	});

	it("結尾至少留兩個字，不會斷在最後", () => {
		const chars = Array.from(LINE);
		for (const point of stutterPoints(LINE)) {
			expect(point).toBeLessThanOrEqual(chars.length - 2);
		}
	});

	it("很短的句子不斷", () => {
		expect(stutterPoints("喚醒程序")).toEqual([]);
	});

	it("applyStutter 在打到的位置之後插入……，拿掉……就是原文", () => {
		const points = stutterPoints(LINE);
		const full = applyStutter(LINE, points);
		expect(full.split(STUTTER_MARK)).toHaveLength(points.length + 1);
		expect(full.split(STUTTER_MARK).join("")).toBe(LINE);
	});

	it("打字打到一半時只插已經打到的位置；剛好打到斷點時……馬上出現（停頓就停在這裡）", () => {
		const points = stutterPoints(LINE);
		const chars = Array.from(LINE);
		const first = points[0];
		expect(applyStutter(chars.slice(0, first - 1).join(""), points)).not.toContain(STUTTER_MARK);
		expect(applyStutter(chars.slice(0, first).join(""), points)).toBe(`${chars.slice(0, first).join("")}${STUTTER_MARK}`);
	});

	it("沒有斷點時原樣回傳", () => {
		expect(applyStutter(LINE, [])).toBe(LINE);
	});
});
