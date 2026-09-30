// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FsDirNode, FsErrorCode, FsSnapshot, SerializedFs } from "../types";
import { FsError, HOME_DIR } from "../types";
import { VirtualFileSystem } from "./VirtualFileSystem";

/** 第一章 T1 的範例快照：冷凍艙區與阿斌的日誌。 */
const CH1_T1_SNAPSHOT: FsSnapshot = {
	home: {
		tech: {
			pod_01: {},
			pod_02: {},
			pod_03: {},
			pod_04: {},
			pod_05: {},
			pod_06: {},
			"wake_up.txt": "喚醒排程：三年後",
			".nova_cache": "NOVA 暫存資料",
		},
		abin: {
			"day_001.txt": "第一天，一切正常。",
			"day_450.txt": "NOVA 開始會自己改排程了。",
			"day_900.txt": { $type: "file", content: "不要相信那個聲音。", mtime: "2031-03-12T08:15:00Z", owner: "abin" },
		},
	},
};

function createFs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot(CH1_T1_SNAPSHOT);
}

/** 執行 `action` 並斷言它丟出指定代碼與路徑的 `FsError`。 */
function expectFsError(action: () => unknown, code: FsErrorCode, path: string): void {
	let caught: unknown;

	try {
		action();
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeInstanceOf(FsError);
	const fsError = caught as FsError;
	expect(fsError.code).toBe(code);
	expect(fsError.path).toBe(path);
}

describe("VirtualFileSystem 建立", () => {
	it("預設家目錄是 HOME_DIR", () => {
		expect(createFs().home).toBe(HOME_DIR);
	});

	it("可以用 options 指定家目錄，~ 會跟著改變", () => {
		const fs = VirtualFileSystem.fromSnapshot(CH1_T1_SNAPSHOT, { home: "/home/abin" });

		expect(fs.home).toBe("/home/abin");
		expect(fs.resolvePath("/", "~/day_001.txt")).toBe("/home/abin/day_001.txt");
		expect(fs.readFile("/", "~/day_001.txt")).toBe("第一天，一切正常。");
	});
});

describe("resolvePath", () => {
	it("會展開 ~ 並正規化，但不檢查是否存在", () => {
		const fs = createFs();

		expect(fs.resolvePath("/", "~")).toBe("/home/tech");
		expect(fs.resolvePath("/home/tech", "../abin/")).toBe("/home/abin");
		expect(fs.resolvePath("/home/tech", "不存在")).toBe("/home/tech/不存在");
	});
});

describe("getNode", () => {
	it("可以用絕對路徑取得節點", () => {
		const node = createFs().getNode("/", "/home/tech/wake_up.txt");
		expect(node.type).toBe("file");
		expect(node.name).toBe("wake_up.txt");
	});

	it("可以用相對路徑、.、..、~ 取得節點", () => {
		const fs = createFs();

		expect(fs.getNode("/home/tech", "pod_01").name).toBe("pod_01");
		expect(fs.getNode("/home/tech", ".").name).toBe("tech");
		expect(fs.getNode("/home/tech/pod_01", "..").name).toBe("tech");
		expect(fs.getNode("/home/tech/pod_01", "../../abin/day_001.txt").name).toBe("day_001.txt");
		expect(fs.getNode("/", "~").name).toBe("tech");
		expect(fs.getNode("/", "~/pod_06").name).toBe("pod_06");
	});

	it("根目錄的 name 是 /", () => {
		expect(createFs().getNode("/home", "/").name).toBe("/");
	});

	it("不存在時丟 ENOENT，path 是玩家輸入的原字串", () => {
		const fs = createFs();

		expectFsError(() => fs.getNode("/home/tech", "pod_07"), "ENOENT", "pod_07");
		expectFsError(() => fs.getNode("/home/tech", "~/nope/deeper"), "ENOENT", "~/nope/deeper");
	});

	it("路徑中間是檔案時丟 ENOTDIR", () => {
		const fs = createFs();
		expectFsError(() => fs.getNode("/home/tech", "wake_up.txt/something"), "ENOTDIR", "wake_up.txt/something");
	});

	it("對檔案加結尾斜線時丟 ENOTDIR（跟真的 shell 一樣）", () => {
		const fs = createFs();
		expectFsError(() => fs.getNode("/home/tech", "wake_up.txt/"), "ENOTDIR", "wake_up.txt/");
	});

	it("目錄加結尾斜線可以正常取得", () => {
		expect(createFs().getNode("/home/tech", "pod_01/").name).toBe("pod_01");
	});

	it("原型鏈上的名稱（constructor、__proto__）視為不存在", () => {
		const fs = createFs();

		expectFsError(() => fs.getNode("/home/tech", "constructor"), "ENOENT", "constructor");
		expectFsError(() => fs.getNode("/home/tech", "__proto__"), "ENOENT", "__proto__");
	});
});

describe("getDir", () => {
	it("取得目錄節點", () => {
		const dir = createFs().getDir("/", "/home/tech");
		expect(dir.type).toBe("dir");
		expect(Object.keys(dir.children)).toContain("pod_01");
	});

	it("目標是檔案時丟 ENOTDIR", () => {
		const fs = createFs();
		expectFsError(() => fs.getDir("/home/tech", "wake_up.txt"), "ENOTDIR", "wake_up.txt");
	});

	it("不存在時丟 ENOENT", () => {
		const fs = createFs();
		expectFsError(() => fs.getDir("/home/tech", "medbay"), "ENOENT", "medbay");
	});
});

describe("getFile 與 readFile", () => {
	it("取得檔案節點與內容", () => {
		const fs = createFs();

		expect(fs.getFile("/home/tech", "wake_up.txt").content).toBe("喚醒排程：三年後");
		expect(fs.readFile("/home/tech", "../abin/day_900.txt")).toBe("不要相信那個聲音。");
	});

	it("快照指定的 mtime 與 owner 會保留", () => {
		const file = createFs().getFile("/", "/home/abin/day_900.txt");

		expect(file.mtime).toBe("2031-03-12T08:15:00Z");
		expect(file.owner).toBe("abin");
	});

	it("目標是目錄時丟 EISDIR", () => {
		const fs = createFs();

		expectFsError(() => fs.getFile("/home/tech", "pod_01"), "EISDIR", "pod_01");
		expectFsError(() => fs.readFile("/home/tech", "~"), "EISDIR", "~");
	});

	it("不存在時丟 ENOENT", () => {
		const fs = createFs();
		expectFsError(() => fs.readFile("/home/tech", "missing.txt"), "ENOENT", "missing.txt");
	});
});

describe("exists", () => {
	it("存在回傳 true，不存在或路徑中間是檔案回傳 false", () => {
		const fs = createFs();

		expect(fs.exists("/home/tech", "pod_03")).toBe(true);
		expect(fs.exists("/home/tech", "/")).toBe(true);
		expect(fs.exists("/home/tech", "pod_99")).toBe(false);
		expect(fs.exists("/home/tech", "wake_up.txt/x")).toBe(false);
	});
});

describe("list", () => {
	it("依名稱排序並預設濾掉隱藏檔", () => {
		const names = createFs()
			.list("/home/tech", ".")
			.map((node) => node.name);

		expect(names).toEqual(["pod_01", "pod_02", "pod_03", "pod_04", "pod_05", "pod_06", "wake_up.txt"]);
	});

	it("includeHidden 為 true 時列出隱藏檔", () => {
		const names = createFs()
			.list("/", "~", { includeHidden: true })
			.map((node) => node.name);

		expect(names).toContain(".nova_cache");
		expect(names).toHaveLength(8);
		expect(names.indexOf(".nova_cache")).toBeLessThan(names.indexOf("pod_01"));
	});

	it("不論快照裡的順序，輸出都依名稱排序", () => {
		const fs = VirtualFileSystem.fromSnapshot({ c: "", a: {}, b: "" });
		expect(fs.list("/", "/").map((node) => node.name)).toEqual(["a", "b", "c"]);
	});

	it("空目錄回傳空陣列", () => {
		expect(createFs().list("/home/tech", "pod_01")).toEqual([]);
	});

	it("目標是檔案時丟 ENOTDIR", () => {
		const fs = createFs();
		expectFsError(() => fs.list("/home/tech", "wake_up.txt"), "ENOTDIR", "wake_up.txt");
	});

	it("不存在時丟 ENOENT", () => {
		const fs = createFs();
		expectFsError(() => fs.list("/home/tech", "pod_00"), "ENOENT", "pod_00");
	});
});

describe("writeFile", () => {
	const fixedNow = new Date("2031-03-15T12:00:00.000Z");

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(fixedNow);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("不存在時建立新檔案，mtime 是現在時間", () => {
		const fs = createFs();
		fs.writeFile("/home/tech", "note.txt", "記下來");

		const file = fs.getFile("/home/tech", "note.txt");
		expect(file.content).toBe("記下來");
		expect(file.mtime).toBe(fixedNow.toISOString());
		expect(fs.getDir("/", "/home/tech").mtime).toBe(fixedNow.toISOString());
	});

	it("已存在時覆寫內容並更新 mtime", () => {
		const fs = createFs();
		fs.writeFile("/", "/home/abin/day_900.txt", "被改過了");

		const file = fs.getFile("/", "/home/abin/day_900.txt");
		expect(file.content).toBe("被改過了");
		expect(file.mtime).toBe(fixedNow.toISOString());
		expect(file.owner).toBe("abin");
	});

	it("父目錄不存在時丟 ENOENT", () => {
		const fs = createFs();
		expectFsError(() => fs.writeFile("/home/tech", "medbay/log.txt", "x"), "ENOENT", "medbay/log.txt");
	});

	it("父路徑是檔案時丟 ENOTDIR", () => {
		const fs = createFs();
		expectFsError(() => fs.writeFile("/home/tech", "wake_up.txt/x", "x"), "ENOTDIR", "wake_up.txt/x");
	});

	it("目標是目錄時丟 EISDIR", () => {
		const fs = createFs();

		expectFsError(() => fs.writeFile("/home/tech", "pod_01", "x"), "EISDIR", "pod_01");
		expectFsError(() => fs.writeFile("/home/tech", "/", "x"), "EISDIR", "/");
	});
});

describe("序列化與還原", () => {
	it("serialize 回傳 version 1 與整棵樹", () => {
		const data = createFs().serialize();

		expect(data.version).toBe(1);
		expect(data.root.name).toBe("/");
		expect(Object.keys(data.root.children)).toEqual(["home"]);
	});

	it("序列化再還原後內容相同，且是不同的物件參考", () => {
		const original = createFs();
		const data = original.serialize();
		const restored = VirtualFileSystem.fromSerialized(data);

		expect(restored.serialize()).toEqual(data);
		expect(restored.getDir("/", "/")).not.toBe(original.getDir("/", "/"));
		expect(restored.getFile("/", "/home/tech/wake_up.txt")).not.toBe(
			original.getFile("/", "/home/tech/wake_up.txt"),
		);
	});

	it("經過 JSON 字串來回後仍能還原", () => {
		const original = createFs();
		const json = JSON.stringify(original.serialize());
		const restored = VirtualFileSystem.fromSerialized(JSON.parse(json) as SerializedFs);

		expect(restored.readFile("/", "/home/abin/day_900.txt")).toBe("不要相信那個聲音。");
		expect(restored.list("/", "~").map((node) => node.name)).toEqual(
			original.list("/", "~").map((node) => node.name),
		);
	});

	it("修改 serialize 的結果不會影響內部的樹", () => {
		const fs = createFs();
		const data = fs.serialize();
		const home = data.root.children.home as FsDirNode;
		delete home.children.tech;

		expect(fs.exists("/", "/home/tech")).toBe(true);
	});

	it("還原後修改不會影響傳入的序列化資料", () => {
		const data = createFs().serialize();
		const restored = VirtualFileSystem.fromSerialized(data);

		vi.useFakeTimers();
		restored.writeFile("/", "~/wake_up.txt", "改掉了");
		vi.useRealTimers();

		const tech = (data.root.children.home as FsDirNode).children.tech as FsDirNode;
		expect(tech.children["wake_up.txt"]).toMatchObject({ content: "喚醒排程：三年後" });
	});

	it("writeFile 之後序列化再還原，修改會保留", () => {
		const fs = createFs();
		fs.writeFile("/home/tech", "new.txt", "新檔案");
		const restored = VirtualFileSystem.fromSerialized(fs.serialize());

		expect(restored.readFile("/home/tech", "new.txt")).toBe("新檔案");
	});

	it("fromSerialized 可以指定家目錄", () => {
		const restored = VirtualFileSystem.fromSerialized(createFs().serialize(), { home: "/home/abin" });
		expect(restored.resolvePath("/", "~")).toBe("/home/abin");
	});

	it("版本不符時丟 Error", () => {
		const data = { version: 2, root: createFs().serialize().root } as unknown as SerializedFs;
		expect(() => VirtualFileSystem.fromSerialized(data)).toThrow(Error);
	});
});
