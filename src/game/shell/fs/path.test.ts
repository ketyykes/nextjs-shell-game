// @vitest-environment node
import { describe, expect, it } from "vitest";
import { basename, dirname, joinPath, normalizePath, resolvePath, splitPath } from "./path";

const HOME = "/home/tech";

describe("normalizePath", () => {
	it("已正規化的絕對路徑維持不變", () => {
		expect(normalizePath("/home/tech")).toBe("/home/tech");
	});

	it("根目錄維持 /", () => {
		expect(normalizePath("/")).toBe("/");
	});

	it("多餘斜線會合併", () => {
		expect(normalizePath("//a///b/")).toBe("/a/b");
	});

	it("結尾斜線會移除", () => {
		expect(normalizePath("/home/tech/")).toBe("/home/tech");
	});

	it(". 會被略過", () => {
		expect(normalizePath("/home/./tech/.")).toBe("/home/tech");
	});

	it(".. 會回到上一層", () => {
		expect(normalizePath("/home/tech/../abin")).toBe("/home/abin");
	});

	it(".. 超過根目錄會停在 /", () => {
		expect(normalizePath("/../../..")).toBe("/");
		expect(normalizePath("/home/../../../etc")).toBe("/etc");
	});

	it("不是 / 開頭時視為從根目錄開始", () => {
		expect(normalizePath("home/tech")).toBe("/home/tech");
	});

	it("空字串視為根目錄", () => {
		expect(normalizePath("")).toBe("/");
	});
});

describe("splitPath", () => {
	it("切成每一段名稱", () => {
		expect(splitPath("/home/tech/pod_01")).toEqual(["home", "tech", "pod_01"]);
	});

	it("根目錄回傳空陣列", () => {
		expect(splitPath("/")).toEqual([]);
	});

	it("會先正規化再切", () => {
		expect(splitPath("//home/./tech/../abin/")).toEqual(["home", "abin"]);
	});
});

describe("joinPath", () => {
	it("接起多段並正規化", () => {
		expect(joinPath("/home", "tech", "../abin")).toBe("/home/abin");
	});
});

describe("dirname", () => {
	it("回傳上層目錄", () => {
		expect(dirname("/home/tech/wake_up.txt")).toBe("/home/tech");
	});

	it("第一層的上層是根目錄", () => {
		expect(dirname("/home")).toBe("/");
	});

	it("根目錄的上層仍是根目錄", () => {
		expect(dirname("/")).toBe("/");
	});
});

describe("basename", () => {
	it("回傳最後一段名稱", () => {
		expect(basename("/home/tech/wake_up.txt")).toBe("wake_up.txt");
	});

	it("會忽略結尾斜線", () => {
		expect(basename("/home/tech/")).toBe("tech");
	});

	it("根目錄回傳 /", () => {
		expect(basename("/")).toBe("/");
	});
});

describe("resolvePath", () => {
	it("絕對路徑不受 cwd 影響", () => {
		expect(resolvePath("/home/tech", "/home/abin", HOME)).toBe("/home/abin");
	});

	it("相對路徑以 cwd 為基準", () => {
		expect(resolvePath("/home/tech", "pod_01", HOME)).toBe("/home/tech/pod_01");
	});

	it("多層相對路徑", () => {
		expect(resolvePath("/home", "tech/pod_01", HOME)).toBe("/home/tech/pod_01");
	});

	it(". 代表目前目錄", () => {
		expect(resolvePath("/home/tech", ".", HOME)).toBe("/home/tech");
	});

	it(".. 代表上層目錄", () => {
		expect(resolvePath("/home/tech", "..", HOME)).toBe("/home");
		expect(resolvePath("/home/tech/pod_01", "../../abin", HOME)).toBe("/home/abin");
	});

	it("在根目錄 cd .. 仍停在 /", () => {
		expect(resolvePath("/", "..", HOME)).toBe("/");
		expect(resolvePath("/home", "../../../..", HOME)).toBe("/");
	});

	it("~ 展開成家目錄", () => {
		expect(resolvePath("/", "~", HOME)).toBe("/home/tech");
	});

	it("~/sub 展開成家目錄底下的路徑", () => {
		expect(resolvePath("/", "~/pod_01", HOME)).toBe("/home/tech/pod_01");
		expect(resolvePath("/", "~/../abin", HOME)).toBe("/home/abin");
	});

	it("~ 會用傳入的 home，而不是寫死的家目錄", () => {
		expect(resolvePath("/", "~/log", "/home/abin")).toBe("/home/abin/log");
	});

	it("~ 不在開頭時只是一般字元", () => {
		expect(resolvePath("/home/tech", "a~", HOME)).toBe("/home/tech/a~");
		expect(resolvePath("/home/tech", "~abin", HOME)).toBe("/home/tech/~abin");
	});

	it("多餘斜線與結尾斜線會被正規化", () => {
		expect(resolvePath("/home/tech", "pod_01///", HOME)).toBe("/home/tech/pod_01");
		expect(resolvePath("/home/tech", "//home///abin/", HOME)).toBe("/home/abin");
	});

	it("空字串回傳目前工作目錄", () => {
		expect(resolvePath("/home/tech/", "", HOME)).toBe("/home/tech");
	});
});
