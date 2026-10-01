// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fsError, missingOperand, unknownOption } from "../messages";
import { createFileContext } from "./fileFixtures";
import { touchCommand } from "./touch";

describe("touch", () => {
	const fixedNow = new Date("2031-04-01T09:30:00.000Z");

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(fixedNow);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("指令名稱是 touch", () => {
		expect(touchCommand.name).toBe("touch");
	});

	it("建立空檔案，成功時沒有輸出", () => {
		const context = createFileContext();
		const result = touchCommand.run(["ignite.flag"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "ignite.flag")).toBe("");
	});

	it("已存在的檔案只更新修改時間，內容不變", () => {
		const context = createFileContext();
		touchCommand.run(["status.txt"], context);

		const file = context.fs.getFile(context.cwd, "status.txt");
		expect(file.content).toBe("主電力：離線\n");
		expect(file.mtime).toBe(fixedNow.toISOString());
	});

	it("一次處理多個檔案", () => {
		const context = createFileContext();
		const result = touchCommand.run(["a.cfg", "b.cfg"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.exists(context.cwd, "a.cfg")).toBe(true);
		expect(context.fs.exists(context.cwd, "b.cfg")).toBe(true);
	});

	it("沒有參數時提示需要檔名", () => {
		const result = touchCommand.run([], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("touch", "一個檔名，例如 touch core.cfg") });
	});

	it("父目錄不存在時回 ENOENT，其他檔案照樣處理", () => {
		const context = createFileContext();
		const result = touchCommand.run(["config/core.cfg", "ok.cfg"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "config/core.cfg") });
		expect(context.fs.exists(context.cwd, "ok.cfg")).toBe(true);
	});

	it("不認得的選項", () => {
		const result = touchCommand.run(["-a", "x"], createFileContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("touch", "-a") });
	});
});
