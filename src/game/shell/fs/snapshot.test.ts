// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FsDirNode, FsFileNode, FsSnapshot } from "../types";
import { PLAYER_USER } from "../types";
import { DEFAULT_DIR_MODE, DEFAULT_FILE_MODE, DEFAULT_MTIME, getNodeSize } from "./node";
import { buildRootFromSnapshot, ROOT_NAME } from "./snapshot";

function asDir(node: unknown): FsDirNode {
	const dir = node as FsDirNode;
	expect(dir.type).toBe("dir");
	return dir;
}

function asFile(node: unknown): FsFileNode {
	const file = node as FsFileNode;
	expect(file.type).toBe("file");
	return file;
}

describe("buildRootFromSnapshot", () => {
	it("根節點是名稱為 / 的目錄", () => {
		const root = buildRootFromSnapshot({});
		expect(root.type).toBe("dir");
		expect(root.name).toBe("/");
		expect(ROOT_NAME).toBe("/");
		expect(root.children).toEqual({});
	});

	it("字串寫法建立檔案並套用預設值", () => {
		const root = buildRootFromSnapshot({ "wake_up.txt": "喚醒排程：三年後" });
		const file = asFile(root.children["wake_up.txt"]);

		expect(file).toEqual({
			type: "file",
			name: "wake_up.txt",
			content: "喚醒排程：三年後",
			mtime: DEFAULT_MTIME,
			owner: PLAYER_USER,
			mode: DEFAULT_FILE_MODE,
		});
	});

	it("$type: \"file\" 寫法可指定 mtime、owner、mode", () => {
		const root = buildRootFromSnapshot({
			"day_900.txt": {
				$type: "file",
				content: "不要相信那個聲音。",
				mtime: "2031-03-12T08:15:00Z",
				owner: "abin",
				mode: "rw-------",
			},
		});
		const file = asFile(root.children["day_900.txt"]);

		expect(file.content).toBe("不要相信那個聲音。");
		expect(file.mtime).toBe("2031-03-12T08:15:00Z");
		expect(file.owner).toBe("abin");
		expect(file.mode).toBe("rw-------");
	});

	it("$type: \"file\" 沒給的欄位用預設值", () => {
		const root = buildRootFromSnapshot({ "a.txt": { $type: "file", content: "" } });
		const file = asFile(root.children["a.txt"]);

		expect(file.mtime).toBe(DEFAULT_MTIME);
		expect(file.owner).toBe(PLAYER_USER);
		expect(file.mode).toBe(DEFAULT_FILE_MODE);
	});

	it("$type: \"dir\" 寫法可指定欄位，子項放在 children", () => {
		const root = buildRootFromSnapshot({
			abin: {
				$type: "dir",
				owner: "abin",
				mode: "rwx------",
				mtime: "2031-03-11T00:00:00Z",
				children: { "day_001.txt": "第一天。" },
			},
		});
		const dir = asDir(root.children.abin);

		expect(dir.name).toBe("abin");
		expect(dir.owner).toBe("abin");
		expect(dir.mode).toBe("rwx------");
		expect(dir.mtime).toBe("2031-03-11T00:00:00Z");
		expect(asFile(dir.children["day_001.txt"]).content).toBe("第一天。");
	});

	it("一般物件寫法建立目錄並套用預設值", () => {
		const root = buildRootFromSnapshot({ pod_01: {} });
		const dir = asDir(root.children.pod_01);

		expect(dir).toEqual({
			type: "dir",
			name: "pod_01",
			children: {},
			mtime: DEFAULT_MTIME,
			owner: PLAYER_USER,
			mode: DEFAULT_DIR_MODE,
		});
	});

	it("可以處理巢狀好幾層，四種寫法混用", () => {
		const snapshot: FsSnapshot = {
			home: {
				tech: {
					"wake_up.txt": "喚醒排程：三年後",
					pod_01: {},
				},
				abin: {
					$type: "dir",
					owner: "abin",
					children: {
						logs: {
							deep: {
								"day_900.txt": { $type: "file", content: "不要相信那個聲音。", mtime: "2031-03-12T08:15:00Z" },
							},
						},
					},
				},
			},
		};
		const root = buildRootFromSnapshot(snapshot);
		const home = asDir(root.children.home);
		const tech = asDir(home.children.tech);
		const abin = asDir(home.children.abin);
		const deep = asDir(asDir(abin.children.logs).children.deep);

		expect(asFile(tech.children["wake_up.txt"]).content).toBe("喚醒排程：三年後");
		expect(asDir(tech.children.pod_01).children).toEqual({});
		expect(abin.owner).toBe("abin");
		expect(asFile(deep.children["day_900.txt"]).mtime).toBe("2031-03-12T08:15:00Z");
	});

	it("每個節點的 name 等於它在 children 裡的 key", () => {
		const root = buildRootFromSnapshot({ home: { tech: { "a.txt": "a" } } });
		const tech = asDir(asDir(root.children.home).children.tech);

		expect(asDir(root.children.home).name).toBe("home");
		expect(tech.name).toBe("tech");
		expect(tech.children["a.txt"].name).toBe("a.txt");
	});

	it("名稱含 / 時丟 Error", () => {
		expect(() => buildRootFromSnapshot({ "home/tech": {} })).toThrow(Error);
		expect(() => buildRootFromSnapshot({ home: { "a/b.txt": "x" } })).toThrow(/\/home/);
	});

	it("名稱為空字串、. 或 .. 時丟 Error", () => {
		expect(() => buildRootFromSnapshot({ "": "x" })).toThrow(Error);
		expect(() => buildRootFromSnapshot({ ".": {} })).toThrow(Error);
		expect(() => buildRootFromSnapshot({ home: { "..": {} } })).toThrow(Error);
	});

	it("隱藏檔名稱（. 開頭）是合法的", () => {
		const root = buildRootFromSnapshot({ ".secret": "噓" });
		expect(asFile(root.children[".secret"]).content).toBe("噓");
	});

	it("名稱為 __proto__ 時會變成一般子項，不會汙染原型", () => {
		const snapshot = JSON.parse('{"__proto__": "奇怪的檔名"}') as FsSnapshot;
		const root = buildRootFromSnapshot(snapshot);

		expect(Object.keys(root.children)).toEqual(["__proto__"]);
		expect(Object.getPrototypeOf(root.children)).toBe(Object.prototype);
	});
});

describe("getNodeSize", () => {
	it("檔案大小是 UTF-8 位元組數", () => {
		const root = buildRootFromSnapshot({ "a.txt": "abc", "b.txt": "中文" });

		expect(getNodeSize(root.children["a.txt"])).toBe(3);
		// 每個中文字在 UTF-8 佔 3 個位元組
		expect(getNodeSize(root.children["b.txt"])).toBe(6);
	});

	it("目錄大小固定是 4096", () => {
		expect(getNodeSize(buildRootFromSnapshot({}))).toBe(4096);
	});
});
