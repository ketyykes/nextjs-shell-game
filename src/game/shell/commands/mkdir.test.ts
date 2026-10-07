// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, missingOperand, mkdirParentMissing, unknownOption } from "../messages";
import { createFileContext } from "./fileFixtures";
import { mkdirCommand } from "./mkdir";

describe("mkdir", () => {
	it("指令名稱是 mkdir", () => {
		expect(mkdirCommand.name).toBe("mkdir");
	});

	it("建立一個目錄，成功時沒有輸出", () => {
		const context = createFileContext();
		const result = mkdirCommand.run(["config"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.getDir(context.cwd, "config").name).toBe("config");
	});

	it("一次建立多個目錄", () => {
		const context = createFileContext();
		const result = mkdirCommand.run(["config", "logs"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.exists(context.cwd, "config")).toBe(true);
		expect(context.fs.exists(context.cwd, "logs")).toBe(true);
	});

	it("沒有參數時提示需要目錄名稱", () => {
		const result = mkdirCommand.run([], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("mkdir", "一個目錄名稱，例如 mkdir backup") });
	});

	it("目錄已存在時回 EEXIST 訊息", () => {
		const result = mkdirCommand.run(["backup"], createFileContext());

		expect(result).toEqual({ ok: false, lines: fsError("EEXIST", "backup") });
	});

	it("父目錄不存在時教玩家用 mkdir -p", () => {
		const result = mkdirCommand.run(["config/old"], createFileContext());

		expect(result).toEqual({ ok: false, lines: mkdirParentMissing("config/old") });
	});

	it("-p 連父目錄一起建，已存在的目錄也不報錯", () => {
		const context = createFileContext();
		const result = mkdirCommand.run(["-p", "config/old/v1", "backup"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.exists(context.cwd, "config/old/v1")).toBe(true);
	});

	it("多個目錄中有一個失敗時不中斷，整體 ok 為 false", () => {
		const context = createFileContext();
		const result = mkdirCommand.run(["config", "backup", "logs"], context);

		expect(result).toEqual({ ok: false, lines: fsError("EEXIST", "backup") });
		expect(context.fs.exists(context.cwd, "config")).toBe(true);
		expect(context.fs.exists(context.cwd, "logs")).toBe(true);
	});

	it("不認得的選項", () => {
		const result = mkdirCommand.run(["-x", "config"], createFileContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("mkdir", "-x") });
	});
});

describe("mkdir 上層目錄不存在", () => {
	it("不加 -p 建多層目錄時，錯誤訊息教玩家用 mkdir -p", () => {
		const context = createFileContext();
		const result = mkdirCommand.run(["auth/keys"], context);

		expect(result.ok).toBe(false);
		const text = result.lines.join("\n");
		expect(text).toContain("mkdir -p auth/keys");
		expect(text).not.toContain("用 ls 看看");
	});
});
