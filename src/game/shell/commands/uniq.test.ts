// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, missingOperand, noInput, unknownOption } from "../messages";
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

describe("uniq 錯誤", () => {
	it("給兩個以上檔案回 missingOperand 的用法說明", () => {
		const result = uniqCommand.run(["relay.log", "freq.txt"], createSystemContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(
			missingOperand(
				"uniq",
				"最多一個檔名；要處理多個檔案，先用 sort 把它們接起來再交給 uniq，例如 sort part_01.txt part_02.txt | uniq",
			),
		);
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
