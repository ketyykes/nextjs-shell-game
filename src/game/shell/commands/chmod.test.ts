// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, invalidMode, missingOperand } from "../messages";
import { applyModeSpec, chmodCommand } from "./chmod";
import { createFileContext } from "./fileFixtures";

const SEALED_DIR = "/deck5/captain/sealed";

describe("applyModeSpec", () => {
	it.each([
		["644", "---------", "rw-r--r--"],
		["755", "---------", "rwxr-xr-x"],
		["600", "rwxrwxrwx", "rw-------"],
		["000", "rwxrwxrwx", "---------"],
		["+r", "---------", "r--r--r--"],
		["a+x", "rw-r--r--", "rwxr-xr-x"],
		["u+x", "rw-r--r--", "rwxr--r--"],
		["o-r", "rw-r--r--", "rw-r-----"],
		["go-r", "rw-r--r--", "rw-------"],
		["=r", "rwxrwxrwx", "r--r--r--"],
		["u=rw", "--x--x--x", "rw---x--x"],
		["-w", "rw-rw-rw-", "r--r--r--"],
		["ug+rw", "---------", "rw-rw----"],
		["0644", "---------", "rw-r--r--"],
		["0700", "rwxrwxrwx", "rwx------"],
		["1755", "---------", "rwxr-xr-x"],
		["6444", "---------", "r--r--r--"],
		["u+x,g-w", "rw-rw-r--", "rwxr--r--"],
		["a=r,u+w", "rwxrwxrwx", "rw-r--r--"],
		["u=rwx,go=rx", "---------", "rwxr-xr-x"],
		["ug=rw,o=", "rwxrwxrwx", "rw-rw----"],
		["u+r-x", "rwxrwxrwx", "rw-rwxrwx"],
		["+r,-w", "-wx-wx-wx", "r-xr-xr-x"],
	])("%s 套在 %s 上得到 %s", (spec, current, expected) => {
		expect(applyModeSpec(spec, current)).toBe(expected);
	});

	it.each([
		["abc"],
		["u+"],
		["+z"],
		["64"],
		["06444"],
		["888"],
		["8644"],
		["x+r"],
		["-R"],
		[""],
		["u+x,"],
		[",u+x"],
		["u+x,,g-w"],
		["u+x,644"],
		["u+x,zz"],
	])("%s 不合法回傳 null", (spec) => {
		expect(applyModeSpec(spec, "rw-r--r--")).toBeNull();
	});
});

describe("chmod", () => {
	it("指令名稱是 chmod", () => {
		expect(chmodCommand.name).toBe("chmod");
	});

	it("+r 加回讀取權限後就能讀，成功時沒有輸出", () => {
		const context = createFileContext({ cwd: SEALED_DIR });
		const result = chmodCommand.run(["+r", "log_final.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.getFile(SEALED_DIR, "log_final.txt").mode).toBe("r--r--r--");
		expect(context.fs.readFile(SEALED_DIR, "log_final.txt")).toBe("它還在跑。別相信那個聲音。\n");
	});

	it("數字寫法", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["600", "status.txt"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("rw-------");
	});

	it("逗號組合的符號寫法依序套用", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["u+x,go-r", "status.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("rwx------");
	});

	it("四位數字寫法，第一位的特殊權限不影響九碼權限", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["0640", "status.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("rw-r-----");
	});

	it("逗號組合裡有一段不合法時整個不動", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["u+x,zz", "status.txt"], context);

		expect(result).toEqual({ ok: false, lines: invalidMode("u+x,zz") });
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("rw-r--r--");
	});

	it("可以改目錄的權限", () => {
		const context = createFileContext();
		chmodCommand.run(["700", "backup"], context);

		expect(context.fs.getDir(context.cwd, "backup").mode).toBe("rwx------");
	});

	it("一次改多個檔案", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["u+x", "status.txt", "backup/core.cfg"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("rwxr--r--");
		expect(context.fs.getFile(context.cwd, "backup/core.cfg").mode).toBe("rwxr--r--");
	});

	it("-r 是權限寫法，不是選項", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["-r", "status.txt"], context);

		expect(result.ok).toBe(true);
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("-w-------");
	});

	it("不合法的權限寫法回 invalidMode，檔案不變", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["rwx", "status.txt"], context);

		expect(result).toEqual({ ok: false, lines: invalidMode("rwx") });
		expect(context.fs.getFile(context.cwd, "status.txt").mode).toBe("rw-r--r--");
	});

	it("路徑不存在時回 ENOENT，其他路徑照樣改", () => {
		const context = createFileContext();
		const result = chmodCommand.run(["644", "nope.txt", "backup/core.cfg"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.txt") });
		expect(context.fs.getFile(context.cwd, "backup/core.cfg").mode).toBe("rw-r--r--");
	});

	it("沒有參數時提示需要權限和檔名", () => {
		const result = chmodCommand.run([], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("chmod", "權限和檔名，例如 chmod +r log_final.txt") });
	});

	it("只有權限沒有檔名時也提示", () => {
		const result = chmodCommand.run(["+r"], createFileContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("chmod", "權限和檔名，例如 chmod +r log_final.txt") });
	});
});
