// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "../fs";
import { diffDirectories, extraOperand, fsError, missingOperand, unknownOption } from "../messages";
import type { CommandContext } from "../types";
import { diffCommand } from "./diff";
import { createFilterContext } from "./filterFixtures";

/** 統一的修改時間，`-u` 標頭用。 */
const MTIME = "2031-03-12T00:15:00Z";

function file(content: string) {
	return { $type: "file" as const, content, mtime: MTIME };
}

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return createFilterContext({
		cwd: "/cfg",
		fs: VirtualFileSystem.fromSnapshot({
			cfg: {
				"old.cfg": file("a\nb\nc\nd\ne\n"),
				"new.cfg": file("a\nB\nc\ne\nf\ng\n"),
				"copy.cfg": file("a\nb\nc\nd\ne\n"),
				"xy.txt": file("x\ny\n"),
				"xy_no_newline.txt": file("x\ny"),
				"empty.txt": file(""),
				"twelve.txt": file("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n"),
				"twelve_edit.txt": file("1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n"),
				"swap_ab.txt": file("a\nb\n"),
				"swap_ba.txt": file("b\na\n"),
				backup: { "old.cfg": file("a\nb\nc\nd\ne\n") },
				other: {},
				locked: { $type: "file", content: "secret\n", mode: "---------" },
			},
		}),
		...overrides,
	});
}

describe("diff 預設格式（GNU normal）", () => {
	it("指令名稱是 diff", () => {
		expect(diffCommand.name).toBe("diff");
	});

	it("兩個檔案一樣時沒有輸出", () => {
		expect(diffCommand.run(["old.cfg", "copy.cfg"], createContext())).toEqual({ ok: true, lines: [] });
	});

	it("改、刪、加三種差異照 GNU diff 的寫法，有差異不算錯誤", () => {
		const result = diffCommand.run(["old.cfg", "new.cfg"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: ["2c2", "< b", "---", "> B", "4d3", "< d", "5a5,6", "> f", "> g"],
		});
	});

	it("空檔案對有內容的檔案：0a1,2 與 1,2d0", () => {
		expect(diffCommand.run(["empty.txt", "xy.txt"], createContext()).lines).toEqual(["0a1,2", "> x", "> y"]);
		expect(diffCommand.run(["xy.txt", "empty.txt"], createContext()).lines).toEqual(["1,2d0", "< x", "< y"]);
	});

	it("相同長度的 LCS 有兩種選法時跟 GNU 一樣先刪後加", () => {
		expect(diffCommand.run(["swap_ab.txt", "swap_ba.txt"], createContext()).lines).toEqual([
			"1d0",
			"< a",
			"2a2",
			"> a",
		]);
	});

	it("結尾少了換行也算不同，並標出 \\ No newline at end of file", () => {
		expect(diffCommand.run(["xy.txt", "xy_no_newline.txt"], createContext()).lines).toEqual([
			"2c2",
			"< y",
			"---",
			"> y",
			"\\ No newline at end of file",
		]);
	});

	it("其中一個是目錄時比對目錄裡同名的檔案", () => {
		expect(diffCommand.run(["old.cfg", "backup"], createContext())).toEqual({ ok: true, lines: [] });
		expect(diffCommand.run(["backup/", "old.cfg"], createContext())).toEqual({ ok: true, lines: [] });
	});

	it("- 代表管線輸入", () => {
		const result = diffCommand.run(["-", "xy.txt"], createContext({ stdin: ["x", "z"] }));

		expect(result.lines).toEqual(["2c2", "< z", "---", "> y"]);
	});
});

describe("diff -u（unified）", () => {
	it("標頭是檔名加修改時間，區塊前後各帶三行上下文", () => {
		const result = diffCommand.run(["-u", "old.cfg", "new.cfg"], createContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				"--- old.cfg\t2031-03-12 00:15:00.000000000 +0000",
				"+++ new.cfg\t2031-03-12 00:15:00.000000000 +0000",
				"@@ -1,5 +1,6 @@",
				" a",
				"-b",
				"+B",
				" c",
				"-d",
				" e",
				"+f",
				"+g",
			],
		});
	});

	it("距離夠遠的差異分成兩個區塊", () => {
		const result = diffCommand.run(["-u", "twelve.txt", "twelve_edit.txt"], createContext());

		expect(result.lines.slice(2)).toEqual([
			"@@ -1,6 +1,6 @@",
			" 1",
			" 2",
			"-3",
			"+X",
			" 4",
			" 5",
			" 6",
			"@@ -8,5 +8,5 @@",
			" 8",
			" 9",
			" 10",
			"-11",
			"+Y",
			" 12",
		]);
	});

	it("空檔案的範圍寫成 -0,0，只有一行時省略 ,1", () => {
		expect(diffCommand.run(["-u", "empty.txt", "xy.txt"], createContext()).lines.slice(2)).toEqual([
			"@@ -0,0 +1,2 @@",
			"+x",
			"+y",
		]);
		expect(diffCommand.run(["-u", "swap_ab.txt", "xy.txt"], createContext()).lines.slice(2)).toEqual([
			"@@ -1,2 +1,2 @@",
			"-a",
			"-b",
			"+x",
			"+y",
		]);
	});

	it("相同時沒有輸出", () => {
		expect(diffCommand.run(["-u", "old.cfg", "copy.cfg"], createContext())).toEqual({ ok: true, lines: [] });
	});
});

describe("diff -q", () => {
	it("只說有沒有不同", () => {
		expect(diffCommand.run(["-q", "old.cfg", "new.cfg"], createContext())).toEqual({
			ok: true,
			lines: ["Files old.cfg and new.cfg differ"],
		});
		expect(diffCommand.run(["-q", "old.cfg", "copy.cfg"], createContext())).toEqual({ ok: true, lines: [] });
	});
});

describe("diff 用法錯誤", () => {
	it("少於兩個檔案", () => {
		const hint = "兩個要比較的檔案，例如 diff core.cfg backup/core.cfg";
		expect(diffCommand.run([], createContext())).toEqual({ ok: false, lines: missingOperand("diff", hint) });
		expect(diffCommand.run(["old.cfg"], createContext())).toEqual({ ok: false, lines: missingOperand("diff", hint) });
	});

	it("多於兩個檔案", () => {
		expect(diffCommand.run(["old.cfg", "new.cfg", "xy.txt"], createContext())).toEqual({
			ok: false,
			lines: extraOperand("diff", "xy.txt", "diff [-u] [-q] 檔案1 檔案2"),
		});
	});

	it("檔案不存在或讀不到", () => {
		expect(diffCommand.run(["old.cfg", "nope.cfg"], createContext())).toEqual({
			ok: false,
			lines: fsError("ENOENT", "nope.cfg"),
		});
		expect(diffCommand.run(["locked", "old.cfg"], createContext())).toEqual({
			ok: false,
			lines: fsError("EACCES", "locked"),
		});
	});

	it("兩個都是目錄時說明只能比檔案", () => {
		expect(diffCommand.run(["backup", "other"], createContext())).toEqual({
			ok: false,
			lines: diffDirectories("backup", "other"),
		});
	});

	it("目錄裡沒有同名檔案時照路徑回報找不到", () => {
		expect(diffCommand.run(["new.cfg", "backup"], createContext())).toEqual({
			ok: false,
			lines: fsError("ENOENT", "backup/new.cfg"),
		});
	});

	it("不認得的選項", () => {
		expect(diffCommand.run(["-y", "old.cfg", "new.cfg"], createContext())).toEqual({
			ok: false,
			lines: unknownOption("diff", "-y"),
		});
	});
});
