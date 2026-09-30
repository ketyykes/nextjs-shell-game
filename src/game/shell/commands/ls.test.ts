// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDirNode, createFileNode, VirtualFileSystem } from "../fs";
import { fsError, unknownOption } from "../messages";
import { formatLongLine, formatMtime, lsCommand, parseLsArgs } from "./ls";
import { createContext } from "./testFixtures";

/** `/home/tech` 的簡潔模式輸出（不含隱藏檔）。 */
const HOME_TECH_LINES = [
	"pod_01/",
	"pod_02/",
	"pod_03/",
	"pod_04/",
	"pod_05/",
	"pod_06/",
	"wake_up.txt",
];

/** `/home/abin` 的 `-l` 輸出（不含 total 行）。 */
const HOME_ABIN_LONG_LINES = [
	"-rw-r--r--  abin  60  2028-06-02 09:00  day_001.txt",
	"-rw-r--r--  abin  33  2029-08-25 21:30  day_450.txt",
	"-rw-r--r--  abin  28  2031-03-10 03:07  day_900.txt",
];

describe("ls 簡潔模式", () => {
	it("指令名稱是 ls", () => {
		expect(lsCommand.name).toBe("ls");
	});

	it("無路徑時列出目前目錄，每個項目一行，預設不顯示隱藏檔", () => {
		const result = lsCommand.run([], createContext());

		expect(result).toEqual({ ok: true, lines: HOME_TECH_LINES });
		expect(result.lines).not.toContain(".nova_cache");
	});

	it("目錄名稱結尾加 /，檔案不加", () => {
		const result = lsCommand.run([], createContext());

		expect(result.lines).toContain("pod_01/");
		expect(result.lines).toContain("wake_up.txt");
	});

	it("-a 在最前面加 ./ 與 ../，並顯示隱藏檔", () => {
		const result = lsCommand.run(["-a"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["./", "../", ".nova_cache", ...HOME_TECH_LINES],
		});
	});

	it("ls -a 加路徑可以看到 B3 的 .override", () => {
		const result = lsCommand.run(["-a", "/deck1/systems/power/breakers/B3"], createContext());

		expect(result).toEqual({ ok: true, lines: ["./", "../", ".override"] });
	});

	it("沒有 -a 時 B3 看起來是空的，但 ok 仍為 true", () => {
		const result = lsCommand.run(["/deck1/systems/power/breakers/B3"], createContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});

	it("接相對路徑", () => {
		const result = lsCommand.run(["../abin"], createContext());

		expect(result).toEqual({ ok: true, lines: ["day_001.txt", "day_450.txt", "day_900.txt"] });
	});

	it("接 ~ 開頭的路徑", () => {
		const result = lsCommand.run(["~"], createContext({ cwd: "/" }));

		expect(result.lines).toEqual(HOME_TECH_LINES);
	});

	it("路徑是檔案時只印那個檔案，名稱用玩家輸入的原字串", () => {
		const result = lsCommand.run(["/home/tech/wake_up.txt"], createContext());

		expect(result).toEqual({ ok: true, lines: ["/home/tech/wake_up.txt"] });
	});

	it("路徑不存在時回報 ENOENT，ok 為 false", () => {
		const result = lsCommand.run(["medbay"], createContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "medbay") });
	});

	it("路徑中間有一段是檔案時回報 ENOTDIR，ok 為 false", () => {
		const result = lsCommand.run(["wake_up.txt/inner"], createContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOTDIR", "wake_up.txt/inner") });
	});
});

describe("ls 多路徑", () => {
	it("每個路徑一個區塊，第一行是 <路徑>:，區塊之間空一行，依參數順序", () => {
		const result = lsCommand.run(["/home", "/deck1/systems/power"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["/home:", "abin/", "tech/", "", "/deck1/systems/power:", "breakers/", "status.txt"],
		});
	});

	it("路徑是檔案時該區塊只列那個檔案", () => {
		const result = lsCommand.run(["wake_up.txt", "pod_01"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["wake_up.txt:", "wake_up.txt", "", "pod_01:"],
		});
	});

	it("其中一個路徑不存在時該區塊放錯誤訊息，其他區塊仍輸出，ok 為 false", () => {
		const result = lsCommand.run(["/home", "medbay", "/deck1/systems/power"], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual([
			"/home:",
			"abin/",
			"tech/",
			"",
			"medbay:",
			...fsError("ENOENT", "medbay"),
			"",
			"/deck1/systems/power:",
			"breakers/",
			"status.txt",
		]);
	});

	it("多路徑搭配 -l 時每個區塊各自有 total 行", () => {
		const result = lsCommand.run(["-l", "/home/abin", "/deck1/systems/power/breakers"], createContext());

		expect(result.lines).toEqual([
			"/home/abin:",
			"total 3",
			...HOME_ABIN_LONG_LINES,
			"",
			"/deck1/systems/power/breakers:",
			"total 1",
			"drwxr-xr-x  tech  4096  2031-03-10 00:00  B3/",
		]);
	});
});

describe("ls -l", () => {
	it("第一行是 total <項目數>，之後每行是權限、擁有者、大小、日期、名稱", () => {
		const result = lsCommand.run(["-l", "/home/abin"], createContext());

		expect(result).toEqual({ ok: true, lines: ["total 3", ...HOME_ABIN_LONG_LINES] });
	});

	it("大小欄位在同一次輸出內右對齊到最長的寬度", () => {
		const result = lsCommand.run(["-l"], createContext());

		expect(result.lines).toEqual([
			"total 7",
			"drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_01/",
			"drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_02/",
			"drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_03/",
			"drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_04/",
			"drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_05/",
			"drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_06/",
			"-rw-r--r--  tech    60  2031-03-12 08:15  wake_up.txt",
		]);
	});

	it("-la 時 ./ 與 ../ 也用 -l 格式，分別是目錄自己與父目錄的節點", () => {
		const result = lsCommand.run(["-la", "/home/abin"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				"total 5",
				"drwxr-xr-x  abin  4096  2031-03-10 03:07  ./",
				"drwxr-xr-x  tech  4096  2031-03-10 00:00  ../",
				"-rw-r--r--  abin    60  2028-06-02 09:00  day_001.txt",
				"-rw-r--r--  abin    33  2029-08-25 21:30  day_450.txt",
				"-rw-r--r--  abin    28  2031-03-10 03:07  day_900.txt",
			],
		});
	});

	it("-la、-al、-a -l、-l -a 結果相同", () => {
		const expected = lsCommand.run(["-la"], createContext());

		expect(lsCommand.run(["-al"], createContext())).toEqual(expected);
		expect(lsCommand.run(["-a", "-l"], createContext())).toEqual(expected);
		expect(lsCommand.run(["-l", "-a"], createContext())).toEqual(expected);
		expect(expected.lines).toContain("-rw-r--r--  tech    18  2031-03-10 00:00  .nova_cache");
	});

	it("根目錄的父目錄就是自己", () => {
		const result = lsCommand.run(["-la", "/"], createContext());

		expect(result.lines.slice(0, 3)).toEqual([
			"total 4",
			"drwxr-xr-x  tech  4096  2031-03-10 00:00  ./",
			"drwxr-xr-x  tech  4096  2031-03-10 00:00  ../",
		]);
	});

	it("路徑是檔案時只印一行詳細資料，沒有 total 行", () => {
		const result = lsCommand.run(["-l", "wake_up.txt"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["-rw-r--r--  tech  60  2031-03-12 08:15  wake_up.txt"],
		});
	});

	it("擁有者名稱長度不同時靠左對齊補空白", () => {
		const root = createDirNode("/", {
			short: createFileNode("short", "x", { owner: "ai", mtime: "2031-01-01T00:00:00Z" }),
			long: createFileNode("long", "xxxxxxxxxx", { owner: "abin", mtime: "2031-01-01T00:00:00Z" }),
		});
		const result = lsCommand.run(["-l"], createContext({ cwd: "/", fs: new VirtualFileSystem(root) }));

		expect(result.lines).toEqual([
			"total 2",
			"-rw-r--r--  abin  10  2031-01-01 00:00  long",
			"-rw-r--r--  ai     1  2031-01-01 00:00  short",
		]);
	});
});

describe("ls 選項解析", () => {
	it("未知選項回報 unknownOption，ok 為 false", () => {
		const result = lsCommand.run(["-z"], createContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("ls", "-z") });
	});

	it("合併寫法中有未知字母時只指出那個字母", () => {
		const result = lsCommand.run(["-laz"], createContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("ls", "-z") });
	});

	it("長選項不支援，整個回報", () => {
		const result = lsCommand.run(["--all"], createContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("ls", "--all") });
	});

	it("-- 之後全部當成路徑", () => {
		expect(parseLsArgs(["-a", "--", "-l"])).toEqual({
			ok: true,
			options: { all: true, long: false },
			paths: ["-l"],
		});
	});

	it("-- 之後的 -l 被當成路徑，找不到時回報 ENOENT", () => {
		const result = lsCommand.run(["--", "-l"], createContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "-l") });
	});

	it("選項與路徑可以交錯出現", () => {
		expect(parseLsArgs(["/home", "-l", "pod_01", "-a"])).toEqual({
			ok: true,
			options: { all: true, long: true },
			paths: ["/home", "pod_01"],
		});
	});
});

describe("formatMtime", () => {
	it("用 UTC 輸出 YYYY-MM-DD HH:MM", () => {
		expect(formatMtime("2031-03-12T08:15:00Z")).toBe("2031-03-12 08:15");
	});

	it("帶時區偏移的時間會換算成 UTC", () => {
		expect(formatMtime("2031-03-12T08:15:00+08:00")).toBe("2031-03-12 00:15");
	});

	it("無法解析的字串原樣回傳", () => {
		expect(formatMtime("不是日期")).toBe("不是日期");
	});
});

describe("formatLongLine", () => {
	it("檔案的格式", () => {
		const node = createFileNode("wake_up.txt", "x".repeat(42), { mtime: "2031-03-12T08:15:00Z" });

		expect(formatLongLine(node, node.name)).toBe("-rw-r--r--  tech  42  2031-03-12 08:15  wake_up.txt");
	});

	it("目錄的格式，名稱結尾加 /", () => {
		const node = createDirNode("pod_01", {}, { mtime: "2028-06-01T00:00:00Z" });

		expect(formatLongLine(node, node.name)).toBe("drwxr-xr-x  tech  4096  2028-06-01 00:00  pod_01/");
	});

	it("給寬度時大小靠右、擁有者靠左補空白", () => {
		const node = createFileNode("a.txt", "abc", { mtime: "2031-03-12T08:15:00Z", owner: "ai" });

		expect(formatLongLine(node, "a.txt", { owner: 4, size: 4 })).toBe(
			"-rw-r--r--  ai       3  2031-03-12 08:15  a.txt",
		);
	});

	it("大小用 UTF-8 位元組數計算", () => {
		const node = createFileNode("day_900.txt", "不要", { mtime: "2031-03-10T03:07:00Z", owner: "abin" });

		expect(formatLongLine(node, node.name)).toBe("-rw-r--r--  abin  6  2031-03-10 03:07  day_900.txt");
	});
});
