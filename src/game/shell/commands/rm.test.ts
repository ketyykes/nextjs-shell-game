// @vitest-environment node
import { describe, expect, it } from "vitest";
import { directoryNeedsRecursive, fsError, missingOperand, unknownOption } from "../messages";
import { createFileContext } from "./fileFixtures";
import { rmCommand } from "./rm";

describe("rm", () => {
	it("指令名稱是 rm", () => {
		expect(rmCommand.name).toBe("rm");
	});

	it("刪除檔案，成功時沒有輸出", () => {
		const context = createFileContext();
		const result = rmCommand.run(["status.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "status.txt")).toBe(false);
	});

	it("一次刪除多個檔案", () => {
		const context = createFileContext();
		const result = rmCommand.run(["backup/core.cfg", "backup/coolant.cfg"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.list(context.cwd, "backup")).toEqual([]);
	});

	it("目錄沒有 -r 時提示要加 -r，目錄還在", () => {
		const context = createFileContext();
		const result = rmCommand.run(["trash"], context);

		expect(result).toEqual({ ok: false, lines: directoryNeedsRecursive("rm", "trash", "rm -r trash") });
		expect(context.fs.exists(context.cwd, "trash")).toBe(true);
	});

	it("-r 連同內容刪除目錄", () => {
		const context = createFileContext();
		const result = rmCommand.run(["-r", "trash"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "trash")).toBe(false);
	});

	it("-R 跟 -r 一樣", () => {
		const context = createFileContext();
		expect(rmCommand.run(["-R", "trash"], context).ok).toBe(true);
		expect(context.fs.exists(context.cwd, "trash")).toBe(false);
	});

	it("不存在時回 ENOENT，其他路徑照樣刪", () => {
		const context = createFileContext();
		const result = rmCommand.run(["nope.txt", "status.txt"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.txt") });
		expect(context.fs.exists(context.cwd, "status.txt")).toBe(false);
	});

	it("-f 時不存在不算錯", () => {
		const context = createFileContext();
		const result = rmCommand.run(["-f", "nope.txt", "status.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "status.txt")).toBe(false);
	});

	it("-f 不會讓沒加 -r 的目錄被刪", () => {
		const result = rmCommand.run(["-f", "trash"], createFileContext());

		expect(result).toEqual({ ok: false, lines: directoryNeedsRecursive("rm", "trash", "rm -r trash") });
	});

	it.each([["-rf"], ["-fr"]])("%s 合併寫可以用", (flag) => {
		const context = createFileContext();
		const result = rmCommand.run([flag, "trash", "nope"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "trash")).toBe(false);
	});

	it("刪根目錄回 EBUSY", () => {
		const result = rmCommand.run(["-rf", "/"], createFileContext());

		expect(result).toEqual({ ok: false, lines: fsError("EBUSY", "/") });
	});

	it("沒有參數時提示需要路徑", () => {
		const result = rmCommand.run([], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("rm", "要刪除的檔案，例如 rm old.log") });
	});

	it("只有 -f 沒有路徑時也提示需要路徑", () => {
		const result = rmCommand.run(["-f"], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("rm", "要刪除的檔案，例如 rm old.log") });
	});

	it("不認得的選項", () => {
		const result = rmCommand.run(["-i", "status.txt"], createFileContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("rm", "-i") });
	});
});
