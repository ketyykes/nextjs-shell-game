// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, missingOperand, unknownOption } from "../messages";
import { cpCommand } from "./cp";
import { CORE_CFG_CONTENT, COOLANT_CFG_CONTENT, createFileContext } from "./fileFixtures";

describe("cp", () => {
	it("指令名稱是 cp", () => {
		expect(cpCommand.name).toBe("cp");
	});

	it("複製檔案成新名字，原檔還在，成功時沒有輸出", () => {
		const context = createFileContext();
		const result = cpCommand.run(["backup/core.cfg", "core.cfg"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "core.cfg")).toBe(CORE_CFG_CONTENT);
		expect(context.fs.exists(context.cwd, "backup/core.cfg")).toBe(true);
	});

	it("目的地是既有目錄時複製進去", () => {
		const context = createFileContext();
		const result = cpCommand.run(["status.txt", "backup"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.exists(context.cwd, "backup/status.txt")).toBe(true);
	});

	it("多個來源複製進同一個目錄", () => {
		const context = createFileContext();
		context.fs.mkdir(context.cwd, "config");
		const result = cpCommand.run(["backup/core.cfg", "backup/coolant.cfg", "config/"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "config/core.cfg")).toBe(CORE_CFG_CONTENT);
		expect(context.fs.readFile(context.cwd, "config/coolant.cfg")).toBe(COOLANT_CFG_CONTENT);
	});

	it("-r 複製整個目錄", () => {
		const context = createFileContext();
		const result = cpCommand.run(["-r", "backup", "config"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "config/coolant.cfg")).toBe(COOLANT_CFG_CONTENT);
	});

	it("-R 跟 -r 一樣", () => {
		const context = createFileContext();
		const result = cpCommand.run(["-R", "backup", "config"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.exists(context.cwd, "config/core.cfg")).toBe(true);
	});

	it("來源是目錄而沒有 -r 時提示要加 -r", () => {
		const context = createFileContext();
		const result = cpCommand.run(["backup", "config"], context);

		expect(result.ok).toBe(false);
		expect(context.fs.exists(context.cwd, "config")).toBe(false);
	});

	it("提示的示範指令保留目的地，照著打就能用", () => {
		const context = createFileContext();
		const result = cpCommand.run(["backup", "config"], context);

		expect(result.lines.join("\n")).toContain("cp -r backup config");
	});

	it("沒有參數時提示需要來源和目的地", () => {
		const result = cpCommand.run([], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("cp", "來源和目的地，例如 cp core.cfg backup/") });
	});

	it("只有一個參數時提示還缺目的地", () => {
		const result = cpCommand.run(["core.cfg"], createFileContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("cp", "在 core.cfg 後面再接一個目的地，例如 cp core.cfg backup/"),
		});
	});

	it("多個來源而目的地不是既有目錄時說明用法，不複製任何東西", () => {
		const context = createFileContext();
		const result = cpCommand.run(["backup/core.cfg", "backup/coolant.cfg", "config"], context);

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("cp", "一個已經存在的目錄當最後的目的地，才能一次處理多個來源，例如 cp core.cfg coolant.cfg backup/"),
		});
		expect(context.fs.exists(context.cwd, "config")).toBe(false);
	});

	it("來源不存在時回 ENOENT，其他來源照樣複製", () => {
		const context = createFileContext();
		const result = cpCommand.run(["nope.cfg", "status.txt", "backup"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.cfg") });
		expect(context.fs.exists(context.cwd, "backup/status.txt")).toBe(true);
	});

	it("把目錄複製進自己底下回 EBUSY", () => {
		const result = cpCommand.run(["-r", "backup", "backup/inner"], createFileContext());

		expect(result).toEqual({ ok: false, lines: fsError("EBUSY", "backup/inner") });
	});

	it("不認得的選項", () => {
		const result = cpCommand.run(["-z", "a", "b"], createFileContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("cp", "-z") });
	});
});
