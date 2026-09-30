// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findFullwidthChar } from "./fullwidth";

describe("findFullwidthChar", () => {
	it("純半形輸入回傳 null", () => {
		expect(findFullwidthChar("cd pod_01")).toBeNull();
		expect(findFullwidthChar("cat 'a b' \"c\" | > >>")).toBeNull();
	});

	it("空字串回傳 null", () => {
		expect(findFullwidthChar("")).toBeNull();
	});

	it("偵測到全形空白", () => {
		expect(findFullwidthChar("cd　pod_01")).toBe("　");
	});

	it("偵測到全形逗號", () => {
		expect(findFullwidthChar("cat a，b")).toBe("，");
	});

	it.each(["。", "？", "！", "：", "；", "（", "）", "「", "」", "『", "』", "、", "／", "～", "－", "＿", "＂", "＇", "＜", "＞", "＝", "＋", "＊", "＆", "＠", "＃", "％", "＄"])(
		"偵測到全形標點 %s",
		(char) => {
			expect(findFullwidthChar(`ls${char}`)).toBe(char);
		},
	);

	it("偵測到全形英數字", () => {
		expect(findFullwidthChar("ｌｓ")).toBe("ｌ");
		expect(findFullwidthChar("cat pod_０1")).toBe("０");
	});

	it("偵測到中文輸入法打出的彎引號", () => {
		expect(findFullwidthChar("cat “a b”")).toBe("“");
		expect(findFullwidthChar("cat ‘a’")).toBe("‘");
	});

	it("回傳第一個出現的全形字元", () => {
		expect(findFullwidthChar("a，b　c")).toBe("，");
	});

	it("中文檔名不誤判", () => {
		expect(findFullwidthChar("cat 日誌.txt")).toBeNull();
		expect(findFullwidthChar("cd 醫療艙")).toBeNull();
		expect(findFullwidthChar("cat 不要相信那個聲音")).toBeNull();
	});

	it("中文字後面接全形標點仍會偵測", () => {
		expect(findFullwidthChar("cat 日誌。txt")).toBe("。");
	});
});
