// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, missingOperand, unknownOption } from "../messages";
import { CORE_CFG_CONTENT, createFileContext } from "./fileFixtures";
import { mvCommand } from "./mv";

describe("mv", () => {
	it("指令名稱是 mv", () => {
		expect(mvCommand.name).toBe("mv");
	});

	it("改名，原名稱消失，成功時沒有輸出", () => {
		const context = createFileContext();
		const result = mvCommand.run(["status.txt", "status.old"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "status.txt")).toBe(false);
		expect(context.fs.readFile(context.cwd, "status.old")).toBe("主電力：離線\n");
	});

	it("目的地是既有目錄時搬進去", () => {
		const context = createFileContext();
		const result = mvCommand.run(["backup/core.cfg", "."], context);

		expect(result.ok).toBe(true);
		expect(context.fs.readFile(context.cwd, "core.cfg")).toBe(CORE_CFG_CONTENT);
		expect(context.fs.exists(context.cwd, "backup/core.cfg")).toBe(false);
	});

	it("目錄不用 -r 也能搬", () => {
		const context = createFileContext();
		const result = mvCommand.run(["backup", "config"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "config/core.cfg")).toBe(true);
	});

	it("多個來源搬進同一個目錄", () => {
		const context = createFileContext();
		const result = mvCommand.run(["backup/core.cfg", "backup/coolant.cfg", "trash"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.list(context.cwd, "backup")).toEqual([]);
		expect(context.fs.exists(context.cwd, "trash/coolant.cfg")).toBe(true);
	});

	it("沒有參數時提示需要來源和目的地", () => {
		const result = mvCommand.run([], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("mv", "來源和目的地，例如 mv core.cfg backup/") });
	});

	it("只有一個參數時提示還缺目的地", () => {
		const result = mvCommand.run(["core.cfg"], createFileContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("mv", "在 core.cfg 後面再接一個目的地，例如 mv core.cfg backup/"),
		});
	});

	it("多個來源而目的地不是既有目錄時說明用法，不搬任何東西", () => {
		const context = createFileContext();
		const result = mvCommand.run(["backup/core.cfg", "backup/coolant.cfg", "status.txt"], context);

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("mv", "一個已經存在的目錄當最後的目的地，才能一次處理多個來源，例如 mv core.cfg coolant.cfg backup/"),
		});
		expect(context.fs.exists(context.cwd, "backup/core.cfg")).toBe(true);
	});

	it("來源不存在時回 ENOENT，其他來源照樣搬", () => {
		const context = createFileContext();
		const result = mvCommand.run(["nope.cfg", "status.txt", "trash"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.cfg") });
		expect(context.fs.exists(context.cwd, "trash/status.txt")).toBe(true);
	});

	it("把目錄搬進自己底下回 EBUSY", () => {
		const result = mvCommand.run(["backup", "backup/inner"], createFileContext());

		expect(result).toEqual({ ok: false, lines: fsError("EBUSY", "backup/inner") });
	});

	it("不認得的選項", () => {
		const result = mvCommand.run(["-f", "a", "b"], createFileContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("mv", "-f") });
	});
});
