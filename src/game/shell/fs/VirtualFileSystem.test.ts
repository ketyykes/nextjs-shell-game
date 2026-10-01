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

// ---------------------------------------------------------------------------
// 第三章到第五章的寫入操作：appendFile、mkdir、touch、remove、move、copy、setMode、glob
// ---------------------------------------------------------------------------

/** 第三章工程艙的快照：反應爐設定目錄被刪了，只剩備份。 */
const CH3_SNAPSHOT: FsSnapshot = {
	deck3: {
		reactor: {
			"status.txt": "主電力：離線\n",
			backup: {
				$type: "dir",
				mtime: "2031-03-01T00:00:00Z",
				owner: "chief",
				children: {
					"core.cfg": { $type: "file", content: "core=on\n", mtime: "2031-03-01T00:00:00Z", owner: "chief", mode: "rw-r-----" },
					"coolant.cfg": { $type: "file", content: "flow=80\n", mtime: "2031-03-01T00:00:00Z", owner: "chief" },
					old: { "notes.txt": "舊筆記\n" },
				},
			},
			logs: {
				"a.log": "A\n",
				"b.log": "B\n",
				"c.txt": "C\n",
				".hidden.log": "H\n",
				"ab.log": "AB\n",
			},
		},
	},
	home: {
		tech: {
			"todo.txt": "第一行\n",
		},
	},
	sealed: {
		"log_final.txt": { $type: "file", content: "它還在跑。\n", owner: "captain", mode: "rw-------" },
		"mine.txt": { $type: "file", content: "我的\n", mode: "-w-------" },
	},
};

function createCh3Fs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot(CH3_SNAPSHOT);
}

describe("寫入操作", () => {
	const fixedNow = new Date("2031-04-01T09:30:00.000Z");
	const nowIso = fixedNow.toISOString();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(fixedNow);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("readFile 權限", () => {
		it("擁有者是玩家但前三碼沒有 r 時丟 EACCES", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.readFile("/sealed", "mine.txt"), "EACCES", "mine.txt");
		});

		it("擁有者是別人而其他人沒有 r 時丟 EACCES", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.readFile("/", "/sealed/log_final.txt"), "EACCES", "/sealed/log_final.txt");
		});

		it("chmod 加回讀取權限後可以讀", () => {
			const fs = createCh3Fs();
			fs.setMode("/sealed", "log_final.txt", "rw-r--r--");
			expect(fs.readFile("/sealed", "log_final.txt")).toBe("它還在跑。\n");
		});
	});

	describe("appendFile", () => {
		it("檔案存在時接在尾端，不自動補換行，並更新 mtime", () => {
			const fs = createCh3Fs();
			fs.appendFile("/home/tech", "todo.txt", "第二行\n");
			fs.appendFile("/home/tech", "~/todo.txt", "第三行");

			const file = fs.getFile("/", "~/todo.txt");
			expect(file.content).toBe("第一行\n第二行\n第三行");
			expect(file.mtime).toBe(nowIso);
		});

		it("檔案不存在時建立，父目錄 mtime 更新", () => {
			const fs = createCh3Fs();
			fs.appendFile("/home/tech", "new.log", "x\n");

			expect(fs.readFile("/home/tech", "new.log")).toBe("x\n");
			expect(fs.getFile("/home/tech", "new.log").owner).toBe("tech");
			expect(fs.getDir("/", "/home/tech").mtime).toBe(nowIso);
		});

		it("父目錄不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.appendFile("/home/tech", "nope/x.log", "x"), "ENOENT", "nope/x.log");
		});

		it("父路徑是檔案時丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.appendFile("/home/tech", "todo.txt/x", "x"), "ENOTDIR", "todo.txt/x");
		});

		it("目標是目錄時丟 EISDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.appendFile("/deck3", "reactor", "x"), "EISDIR", "reactor");
			expectFsError(() => fs.appendFile("/deck3", "/", "x"), "EISDIR", "/");
		});
	});

	describe("mkdir", () => {
		it("建立新目錄，mtime 是現在、擁有者是玩家，父目錄 mtime 更新", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "config");

			const dir = fs.getDir("/deck3/reactor", "config");
			expect(dir.name).toBe("config");
			expect(dir.children).toEqual({});
			expect(dir.mtime).toBe(nowIso);
			expect(dir.owner).toBe("tech");
			expect(dir.mode).toBe("rwxr-xr-x");
			expect(fs.getDir("/", "/deck3/reactor").mtime).toBe(nowIso);
		});

		it("已存在的目錄丟 EEXIST", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.mkdir("/deck3/reactor", "backup"), "EEXIST", "backup");
		});

		it("已存在的檔案丟 EEXIST", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.mkdir("/deck3/reactor", "status.txt"), "EEXIST", "status.txt");
		});

		it("根目錄丟 EEXIST", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.mkdir("/", "/"), "EEXIST", "/");
		});

		it("父目錄不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.mkdir("/deck3/reactor", "config/old"), "ENOENT", "config/old");
		});

		it("父路徑是檔案時丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.mkdir("/deck3/reactor", "status.txt/x"), "ENOTDIR", "status.txt/x");
		});

		it("parents 會連父目錄一起建", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "config/old/v1", { parents: true });

			expect(fs.getDir("/deck3/reactor", "config").mtime).toBe(nowIso);
			expect(fs.getDir("/deck3/reactor", "config/old/v1").owner).toBe("tech");
		});

		it("parents 時已存在的目錄不報錯，也不動它的內容", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "backup", { parents: true });
			fs.mkdir("/", "/", { parents: true });

			expect(fs.exists("/deck3/reactor", "backup/core.cfg")).toBe(true);
			expect(fs.getDir("/deck3/reactor", "backup").mtime).toBe("2031-03-01T00:00:00Z");
		});

		it("parents 時已存在的是檔案仍丟 EEXIST", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.mkdir("/deck3/reactor", "status.txt", { parents: true }), "EEXIST", "status.txt");
		});

		it("parents 時路徑中間是檔案丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(
				() => fs.mkdir("/deck3/reactor", "status.txt/a/b", { parents: true }),
				"ENOTDIR",
				"status.txt/a/b",
			);
		});
	});

	describe("touch", () => {
		it("不存在時建立空檔案，父目錄 mtime 更新", () => {
			const fs = createCh3Fs();
			fs.touch("/deck3/reactor", "ignite.flag");

			const file = fs.getFile("/deck3/reactor", "ignite.flag");
			expect(file.content).toBe("");
			expect(file.mtime).toBe(nowIso);
			expect(file.owner).toBe("tech");
			expect(fs.getDir("/", "/deck3/reactor").mtime).toBe(nowIso);
		});

		it("已存在的檔案只更新 mtime，內容不變", () => {
			const fs = createCh3Fs();
			fs.touch("/deck3/reactor/backup", "core.cfg");

			const file = fs.getFile("/deck3/reactor/backup", "core.cfg");
			expect(file.content).toBe("core=on\n");
			expect(file.mtime).toBe(nowIso);
			expect(fs.getDir("/", "/deck3/reactor/backup").mtime).toBe("2031-03-01T00:00:00Z");
		});

		it("目錄也可以 touch，只更新 mtime", () => {
			const fs = createCh3Fs();
			fs.touch("/deck3/reactor", "backup");
			fs.touch("/deck3/reactor", "/");

			expect(fs.getDir("/deck3/reactor", "backup").mtime).toBe(nowIso);
			expect(fs.getDir("/", "/").mtime).toBe(nowIso);
		});

		it("父目錄不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.touch("/deck3/reactor", "config/core.cfg"), "ENOENT", "config/core.cfg");
		});

		it("父路徑是檔案時丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.touch("/deck3/reactor", "status.txt/x"), "ENOTDIR", "status.txt/x");
		});
	});

	describe("remove", () => {
		it("刪除檔案，父目錄 mtime 更新", () => {
			const fs = createCh3Fs();
			fs.remove("/deck3/reactor", "status.txt");

			expect(fs.exists("/deck3/reactor", "status.txt")).toBe(false);
			expect(fs.getDir("/", "/deck3/reactor").mtime).toBe(nowIso);
		});

		it("recursive 時連同內容刪除目錄", () => {
			const fs = createCh3Fs();
			fs.remove("/deck3/reactor", "backup", { recursive: true });

			expect(fs.exists("/deck3/reactor", "backup")).toBe(false);
			expect(fs.exists("/deck3/reactor", "logs")).toBe(true);
		});

		it("目錄沒有 recursive 時丟 EISDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.remove("/deck3/reactor", "backup/old"), "EISDIR", "backup/old");
			expect(fs.exists("/deck3/reactor", "backup/old")).toBe(true);
		});

		it("根目錄丟 EBUSY", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.remove("/deck3", "/", { recursive: true }), "EBUSY", "/");
			expectFsError(() => fs.remove("/deck3", "../..", { recursive: true }), "EBUSY", "../..");
		});

		it(". 與 .. 丟 EBUSY，避免刪掉自己所在的目錄", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.remove("/deck3/reactor", ".", { recursive: true }), "EBUSY", ".");
			expectFsError(() => fs.remove("/deck3/reactor/logs", "..", { recursive: true }), "EBUSY", "..");
			expect(fs.exists("/", "/deck3/reactor/logs")).toBe(true);
		});

		it("不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.remove("/deck3/reactor", "config"), "ENOENT", "config");
		});

		it("路徑中間是檔案時丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.remove("/deck3/reactor", "status.txt/x"), "ENOTDIR", "status.txt/x");
		});
	});

	describe("move", () => {
		it("目標不存在時視為改名，節點 name 更新、mtime 不變，兩邊父目錄 mtime 更新", () => {
			const fs = createCh3Fs();
			fs.move("/deck3/reactor", "backup/core.cfg", "core.cfg");

			const file = fs.getFile("/deck3/reactor", "core.cfg");
			expect(file.name).toBe("core.cfg");
			expect(file.content).toBe("core=on\n");
			expect(file.mtime).toBe("2031-03-01T00:00:00Z");
			expect(file.owner).toBe("chief");
			expect(fs.exists("/deck3/reactor", "backup/core.cfg")).toBe(false);
			expect(fs.getDir("/", "/deck3/reactor").mtime).toBe(nowIso);
			expect(fs.getDir("/", "/deck3/reactor/backup").mtime).toBe(nowIso);
		});

		it("同一個目錄內改名", () => {
			const fs = createCh3Fs();
			fs.move("/deck3/reactor/logs", "c.txt", "c.log");

			expect(fs.getFile("/deck3/reactor/logs", "c.log").name).toBe("c.log");
			expect(fs.exists("/deck3/reactor/logs", "c.txt")).toBe(false);
		});

		it("目標是既有目錄時搬進去並保留原名", () => {
			const fs = createCh3Fs();
			fs.move("/deck3/reactor", "status.txt", "backup");

			expect(fs.getFile("/deck3/reactor", "backup/status.txt").name).toBe("status.txt");
			expect(fs.exists("/deck3/reactor", "status.txt")).toBe(false);
		});

		it("目錄可以改名，子項跟著走", () => {
			const fs = createCh3Fs();
			fs.move("/deck3/reactor", "backup", "config");

			expect(fs.getDir("/deck3/reactor", "config").name).toBe("config");
			expect(fs.readFile("/deck3/reactor", "config/coolant.cfg")).toBe("flow=80\n");
			expect(fs.exists("/deck3/reactor", "backup")).toBe(false);
		});

		it("來源目錄搬到同名既有目錄時搬進去，變成 to/name", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "archive");
			fs.mkdir("/deck3/reactor", "archive/logs");
			fs.move("/deck3/reactor", "logs", "archive");

			expect(fs.exists("/deck3/reactor", "archive/logs/a.log")).toBe(true);
		});

		it("目標是既有檔案時覆蓋", () => {
			const fs = createCh3Fs();
			fs.move("/deck3/reactor/logs", "a.log", "b.log");

			expect(fs.readFile("/deck3/reactor/logs", "b.log")).toBe("A\n");
			expect(fs.getFile("/deck3/reactor/logs", "b.log").name).toBe("b.log");
			expect(fs.exists("/deck3/reactor/logs", "a.log")).toBe(false);
		});

		it("搬到自己同一個位置不做任何事", () => {
			const fs = createCh3Fs();
			fs.move("/deck3/reactor", "status.txt", "./");

			expect(fs.readFile("/deck3/reactor", "status.txt")).toBe("主電力：離線\n");
		});

		it("把目錄搬進自己或自己的子孫底下丟 EBUSY", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.move("/deck3/reactor", "backup", "backup"), "EBUSY", "backup");
			expectFsError(() => fs.move("/deck3/reactor", "backup", "backup/old"), "EBUSY", "backup/old");
			expectFsError(() => fs.move("/deck3/reactor", "backup", "backup/new"), "EBUSY", "backup/new");
		});

		it("搬根目錄丟 EBUSY", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.move("/deck3", "/", "x"), "EBUSY", "/");
		});

		it("來源不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.move("/deck3/reactor", "config", "x"), "ENOENT", "config");
		});

		it("目標的父目錄不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.move("/deck3/reactor", "status.txt", "nope/status.txt"), "ENOENT", "nope/status.txt");
		});

		it("把目錄搬到既有檔案上丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.move("/deck3/reactor", "logs", "status.txt"), "ENOTDIR", "status.txt");
		});

		it("把檔案搬到同名既有目錄上丟 EISDIR", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "backup/status.txt");
			expectFsError(() => fs.move("/deck3/reactor", "status.txt", "backup"), "EISDIR", "backup");
		});

		it("目錄搬到同名但非空的既有目錄丟 EEXIST", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "archive/logs", { parents: true });
			fs.touch("/deck3/reactor", "archive/logs/keep.txt");
			expectFsError(() => fs.move("/deck3/reactor", "logs", "archive"), "EEXIST", "archive");
		});
	});

	describe("copy", () => {
		it("複製檔案成新名字，內容相同、mtime 是現在、擁有者是玩家、權限保留", () => {
			const fs = createCh3Fs();
			fs.copy("/deck3/reactor", "backup/core.cfg", "core.cfg");

			const copy = fs.getFile("/deck3/reactor", "core.cfg");
			expect(copy).toEqual({
				type: "file",
				name: "core.cfg",
				content: "core=on\n",
				mtime: nowIso,
				owner: "tech",
				mode: "rw-r-----",
			});
			expect(fs.getFile("/deck3/reactor", "backup/core.cfg").owner).toBe("chief");
			expect(fs.getDir("/", "/deck3/reactor").mtime).toBe(nowIso);
		});

		it("目標是既有目錄時複製進去並保留原名", () => {
			const fs = createCh3Fs();
			fs.copy("/deck3/reactor", "status.txt", "backup");

			expect(fs.readFile("/deck3/reactor", "backup/status.txt")).toBe("主電力：離線\n");
			expect(fs.exists("/deck3/reactor", "status.txt")).toBe(true);
		});

		it("目標是既有檔案時覆蓋", () => {
			const fs = createCh3Fs();
			fs.copy("/deck3/reactor/logs", "a.log", "b.log");

			expect(fs.readFile("/deck3/reactor/logs", "b.log")).toBe("A\n");
			expect(fs.readFile("/deck3/reactor/logs", "a.log")).toBe("A\n");
		});

		it("recursive 時深拷貝整個目錄，改複製品不影響原本", () => {
			const fs = createCh3Fs();
			fs.copy("/deck3/reactor", "backup", "config", { recursive: true });

			const config = fs.getDir("/deck3/reactor", "config");
			expect(config.name).toBe("config");
			expect(config.owner).toBe("tech");
			expect(config.mtime).toBe(nowIso);
			expect(fs.getFile("/deck3/reactor", "config/old/notes.txt").owner).toBe("tech");

			fs.writeFile("/deck3/reactor", "config/coolant.cfg", "flow=100\n");
			expect(fs.readFile("/deck3/reactor", "backup/coolant.cfg")).toBe("flow=80\n");
		});

		it("recursive 複製目錄到既有目錄時複製進去", () => {
			const fs = createCh3Fs();
			fs.copy("/deck3/reactor", "logs", "backup", { recursive: true });

			expect(fs.readFile("/deck3/reactor", "backup/logs/a.log")).toBe("A\n");
		});

		it("recursive 複製到同名既有目錄時合併內容", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "archive/logs", { parents: true });
			fs.writeFile("/deck3/reactor", "archive/logs/keep.txt", "留著\n");
			fs.copy("/deck3/reactor", "logs", "archive", { recursive: true });

			expect(fs.readFile("/deck3/reactor", "archive/logs/keep.txt")).toBe("留著\n");
			expect(fs.readFile("/deck3/reactor", "archive/logs/a.log")).toBe("A\n");
		});

		it("來源是目錄而沒有 recursive 時丟 EISDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.copy("/deck3/reactor", "backup", "config"), "EISDIR", "backup");
			expect(fs.exists("/deck3/reactor", "config")).toBe(false);
		});

		it("把目錄複製進自己底下丟 EBUSY", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.copy("/deck3/reactor", "backup", "backup/old", { recursive: true }), "EBUSY", "backup/old");
			expectFsError(() => fs.copy("/deck3/reactor", "/", "x", { recursive: true }), "EBUSY", "x");
		});

		it("來源不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.copy("/deck3/reactor", "config", "x"), "ENOENT", "config");
		});

		it("目標的父目錄不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.copy("/deck3/reactor", "status.txt", "nope/status.txt"), "ENOENT", "nope/status.txt");
		});

		it("把目錄複製到既有檔案上丟 ENOTDIR", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.copy("/deck3/reactor", "logs", "status.txt", { recursive: true }), "ENOTDIR", "status.txt");
		});

		it("把檔案複製到同名既有目錄上丟 EISDIR", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "backup/status.txt");
			expectFsError(() => fs.copy("/deck3/reactor", "status.txt", "backup"), "EISDIR", "backup");
		});

		it("複製到自己身上不做任何事", () => {
			const fs = createCh3Fs();
			fs.copy("/deck3/reactor", "status.txt", "status.txt");
			expect(fs.readFile("/deck3/reactor", "status.txt")).toBe("主電力：離線\n");
		});
	});

	describe("setMode", () => {
		it("改檔案與目錄的權限，mtime 不變", () => {
			const fs = createCh3Fs();
			fs.setMode("/sealed", "log_final.txt", "rw-r--r--");
			fs.setMode("/deck3/reactor", "backup", "rwx------");

			expect(fs.getFile("/sealed", "log_final.txt").mode).toBe("rw-r--r--");
			expect(fs.getDir("/deck3/reactor", "backup").mode).toBe("rwx------");
			expect(fs.getDir("/deck3/reactor", "backup").mtime).toBe("2031-03-01T00:00:00Z");
		});

		it("不合法的 mode 丟一般 Error，不是 FsError", () => {
			const fs = createCh3Fs();
			let caught: unknown;
			try {
				fs.setMode("/sealed", "log_final.txt", "644");
			} catch (error) {
				caught = error;
			}

			expect(caught).toBeInstanceOf(Error);
			expect(caught).not.toBeInstanceOf(FsError);
			expect(fs.getFile("/sealed", "log_final.txt").mode).toBe("rw-------");
		});

		it("不存在時丟 ENOENT", () => {
			const fs = createCh3Fs();
			expectFsError(() => fs.setMode("/sealed", "nope.txt", "rw-r--r--"), "ENOENT", "nope.txt");
		});
	});

	describe("glob", () => {
		it("* 配對目前目錄的檔名，依名稱排序", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor/logs", "*.log")).toEqual(["a.log", "ab.log", "b.log"]);
		});

		it("? 只配一個字元", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor/logs", "?.log")).toEqual(["a.log", "b.log"]);
		});

		it("目錄部分照常解析，回傳保留玩家寫的前綴", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor", "logs/*.log")).toEqual(["logs/a.log", "logs/ab.log", "logs/b.log"]);
			expect(fs.glob("/home", "/deck3/reactor/backup/c*")).toEqual([
				"/deck3/reactor/backup/coolant.cfg",
				"/deck3/reactor/backup/core.cfg",
			]);
			expect(fs.glob("/deck3/reactor/logs", "../back*")).toEqual(["../backup"]);
		});

		it("* 也會配到目錄", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor", "*")).toEqual(["backup", "logs", "status.txt"]);
		});

		it("pattern 以 . 開頭才配到隱藏檔", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor/logs", "*")).not.toContain(".hidden.log");
			expect(fs.glob("/deck3/reactor/logs", ".*")).toEqual([".hidden.log"]);
		});

		it("正規表示式的特殊字元照字面配對", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor/logs", "a.l*")).toEqual(["a.log"]);
			expect(fs.glob("/deck3/reactor/logs", "a+*")).toEqual([]);
		});

		it("沒有相符時回傳空陣列", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor/logs", "*.cfg")).toEqual([]);
		});

		it("目錄部分不存在或不是目錄時回傳空陣列，不丟錯", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor", "nope/*.log")).toEqual([]);
			expect(fs.glob("/deck3/reactor", "status.txt/*")).toEqual([]);
		});

		it("沒有萬用字元時，存在回傳 [pattern]，不存在回傳空陣列", () => {
			const fs = createCh3Fs();
			expect(fs.glob("/deck3/reactor", "logs/a.log")).toEqual(["logs/a.log"]);
			expect(fs.glob("/deck3/reactor", "logs/z.log")).toEqual([]);
		});
	});

	describe("寫入操作後的序列化", () => {
		it("mkdir、copy、move、remove 之後序列化再還原，結果保留", () => {
			const fs = createCh3Fs();
			fs.mkdir("/deck3/reactor", "config");
			fs.copy("/deck3/reactor", "backup/core.cfg", "config");
			fs.move("/deck3/reactor", "backup/coolant.cfg", "config");
			fs.remove("/deck3/reactor", "backup", { recursive: true });

			const restored = VirtualFileSystem.fromSerialized(JSON.parse(JSON.stringify(fs.serialize())) as SerializedFs);
			expect(restored.list("/deck3/reactor", "config").map((node) => node.name)).toEqual(["coolant.cfg", "core.cfg"]);
			expect(restored.exists("/deck3/reactor", "backup")).toBe(false);
		});
	});
});
