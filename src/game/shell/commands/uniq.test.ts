// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extraOperand, fsError, noInput, unknownOption } from "../messages";
import { uniqCommand } from "./uniq";
import { createSystemContext } from "./systemFixtures";

describe("uniq", () => {
	it("指令名稱是 uniq", () => {
		expect(uniqCommand.name).toBe("uniq");
	});

	it("只合併相鄰的重複行，不相鄰的重複保留", () => {
		const result = uniqCommand.run(["relay.log"], createSystemContext());

		expect(result).toEqual({ ok: true, lines: ["ERROR", "OK", "WARN", "ERROR"] });
	});

	it("-c 每行前面加出現次數，靠右對齊 7 格再加一個空格", () => {
		const result = uniqCommand.run(["-c", "relay.log"], createSystemContext());

		expect(result).toEqual({
			ok: true,
			lines: ["      3 ERROR", "      1 OK", "      2 WARN", "      1 ERROR"],
		});
	});

	it("-d 只印重複過的行", () => {
		const result = uniqCommand.run(["-d", "relay.log"], createSystemContext());

		expect(result).toEqual({ ok: true, lines: ["ERROR", "WARN"] });
	});

	it("-cd 合併寫：只印重複過的行並加次數", () => {
		const result = uniqCommand.run(["-cd", "relay.log"], createSystemContext());

		expect(result.lines).toEqual(["      3 ERROR", "      2 WARN"]);
	});

	it("-c -d 分開寫效果一樣", () => {
		const combined = uniqCommand.run(["-cd", "relay.log"], createSystemContext());
		const separated = uniqCommand.run(["-c", "-d", "relay.log"], createSystemContext());

		expect(separated).toEqual(combined);
	});

	it("相鄰的空行也會合併", () => {
		const result = uniqCommand.run([], createSystemContext({ stdin: ["a", "", "", "b"] }));

		expect(result.lines).toEqual(["a", "", "b"]);
	});
});

describe("uniq 輸入來源", () => {
	it("沒給檔名時讀 stdin（典型用法 sort | uniq）", () => {
		const result = uniqCommand.run([], createSystemContext({ stdin: ["A", "A", "B"] }));

		expect(result).toEqual({ ok: true, lines: ["A", "B"] });
	});

	it("有給檔名時忽略 stdin", () => {
		const result = uniqCommand.run(["relay.log"], createSystemContext({ stdin: ["zzz"] }));

		expect(result.lines).not.toContain("zzz");
	});

	it("stdin 是空陣列時輸出空陣列，仍算成功", () => {
		expect(uniqCommand.run([], createSystemContext({ stdin: [] }))).toEqual({ ok: true, lines: [] });
	});

	it("沒給檔名也不在管線裡時回 noInput", () => {
		const result = uniqCommand.run(["-c"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: noInput("uniq", "sort relay.log | uniq") });
	});
});

describe("uniq 輸出檔", () => {
	it("第二個參數是輸出檔：結果寫進檔案，畫面上沒有輸出", () => {
		const context = createSystemContext();
		const result = uniqCommand.run(["relay.log", "out.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "out.txt")).toBe("ERROR\nOK\nWARN\nERROR\n");
	});

	it("選項照樣套用，輸出檔已存在時覆寫", () => {
		const context = createSystemContext();
		context.fs.writeFile(context.cwd, "out.txt", "舊內容\n");
		uniqCommand.run(["-cd", "relay.log", "out.txt"], context);

		expect(context.fs.readFile(context.cwd, "out.txt")).toBe("      3 ERROR\n      2 WARN\n");
	});

	it("輸入寫 - 代表讀管線的輸入", () => {
		const context = createSystemContext({ stdin: ["x", "x", "y"] });
		const result = uniqCommand.run(["-", "out.txt"], context);

		expect(result).toEqual({ ok: true, lines: [] });
		expect(context.fs.readFile(context.cwd, "out.txt")).toBe("x\ny\n");
	});

	it("單獨一個 - 也是讀管線的輸入", () => {
		const result = uniqCommand.run(["-"], createSystemContext({ stdin: ["x", "x"] }));

		expect(result).toEqual({ ok: true, lines: ["x"] });
	});

	it("- 但不在管線裡時回 noInput", () => {
		const result = uniqCommand.run(["-", "out.txt"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: noInput("uniq", "sort relay.log | uniq") });
	});

	it("沒有任何輸出時寫成空檔", () => {
		const context = createSystemContext({ stdin: [] });
		uniqCommand.run(["-", "out.txt"], context);

		expect(context.fs.readFile(context.cwd, "out.txt")).toBe("");
	});

	it("輸入檔讀不到時回報錯誤，不建立輸出檔", () => {
		const context = createSystemContext();
		const result = uniqCommand.run(["nope.log", "out.txt"], context);

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.log") });
		expect(context.fs.exists(context.cwd, "out.txt")).toBe(false);
	});

	it("輸出檔是目錄時回 EISDIR", () => {
		const result = uniqCommand.run(["relay.log", "fragments"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: fsError("EISDIR", "fragments") });
	});

	it("輸出檔的父目錄不存在時回 ENOENT", () => {
		const result = uniqCommand.run(["relay.log", "nodir/out.txt"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nodir/out.txt") });
	});
});

describe("uniq 錯誤", () => {
	it("超過兩個參數回 extraOperand，不寫任何檔案", () => {
		const context = createSystemContext();
		const result = uniqCommand.run(["relay.log", "out.txt", "extra.txt"], context);

		expect(result).toEqual({
			ok: false,
			lines: extraOperand("uniq", "extra.txt", "uniq [-c] [-d] [輸入檔 [輸出檔]]"),
		});
		expect(context.fs.exists(context.cwd, "out.txt")).toBe(false);
	});

	it("檔案不存在回 fsError", () => {
		const result = uniqCommand.run(["nope.log"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.log") });
	});

	it("不認得的選項回 unknownOption", () => {
		const result = uniqCommand.run(["-u", "relay.log"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("uniq", "-u") });
	});

	it("長選項回 unknownOption", () => {
		const result = uniqCommand.run(["--count", "relay.log"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("uniq", "--count") });
	});
});
