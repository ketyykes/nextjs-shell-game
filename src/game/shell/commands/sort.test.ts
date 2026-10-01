// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, noInput, unknownOption } from "../messages";
import { sortCommand } from "./sort";
import { createSystemContext } from "./systemFixtures";

describe("sort 字串排序", () => {
	it("指令名稱是 sort", () => {
		expect(sortCommand.name).toBe("sort");
	});

	it("預設依字串排序檔案內容", () => {
		const result = sortCommand.run(["fragments/part_01.txt"], createSystemContext());

		expect(result).toEqual({
			ok: true,
			lines: ["01 MAYDAY", "02 KEPLER-9", "03 TO ANY VESSEL"],
		});
	});

	it("用 code unit 比較：大寫排在小寫前面", () => {
		const result = sortCommand.run([], createSystemContext({ stdin: ["b", "a", "B", "A"] }));

		expect(result.lines).toEqual(["A", "B", "a", "b"]);
	});

	it("多個檔案的內容接起來一起排", () => {
		const result = sortCommand.run(
			["fragments/part_01.txt", "fragments/part_02.txt"],
			createSystemContext(),
		);

		expect(result).toEqual({
			ok: true,
			lines: ["01 MAYDAY", "01 MAYDAY", "02 KEPLER-9", "02 KEPLER-9", "03 TO ANY VESSEL", "04 CREW: 1"],
		});
	});

	it("-r 反向排序", () => {
		const result = sortCommand.run(["-r", "fragments/part_01.txt"], createSystemContext());

		expect(result.lines).toEqual(["03 TO ANY VESSEL", "02 KEPLER-9", "01 MAYDAY"]);
	});

	it("-u 排序後去掉相鄰重複的行", () => {
		const result = sortCommand.run(
			["-u", "fragments/part_01.txt", "fragments/part_02.txt"],
			createSystemContext(),
		);

		expect(result.lines).toEqual(["01 MAYDAY", "02 KEPLER-9", "03 TO ANY VESSEL", "04 CREW: 1"]);
	});

	it("-ru 合併寫：反向而且去重", () => {
		const result = sortCommand.run(["-ru"], createSystemContext({ stdin: ["a", "b", "a", "c", "b"] }));

		expect(result.lines).toEqual(["c", "b", "a"]);
	});
});

describe("sort -n 數字排序", () => {
	it("依行首數字排序，支援負號與小數，沒有數字當 0，同值維持原順序", () => {
		const result = sortCommand.run(["-n", "freq.txt"], createSystemContext());

		expect(result).toEqual({
			ok: true,
			lines: ["-3 beta", "noise", "2.5 gamma", "2.5 delta", "10 alpha", "100 epsilon"],
		});
	});

	it("沒有 -n 時 10 會排在 2 前面（字串比較）", () => {
		const result = sortCommand.run([], createSystemContext({ stdin: ["2", "10", "1"] }));

		expect(result.lines).toEqual(["1", "10", "2"]);
	});

	it("行首的空白會略過", () => {
		const result = sortCommand.run(["-n"], createSystemContext({ stdin: ["   12 x", "3 y"] }));

		expect(result.lines).toEqual(["3 y", "   12 x"]);
	});

	it("-nr 由大到小，同值仍維持原順序", () => {
		const result = sortCommand.run(["-nr", "freq.txt"], createSystemContext());

		expect(result.lines).toEqual(["100 epsilon", "10 alpha", "2.5 gamma", "2.5 delta", "noise", "-3 beta"]);
	});

	it("-n -r 分開寫效果一樣", () => {
		const combined = sortCommand.run(["-nr", "freq.txt"], createSystemContext());
		const separated = sortCommand.run(["-n", "-r", "freq.txt"], createSystemContext());

		expect(separated).toEqual(combined);
	});
});

describe("sort 輸入來源", () => {
	it("沒給檔名時讀 stdin", () => {
		const result = sortCommand.run([], createSystemContext({ stdin: ["03 C", "01 A", "02 B"] }));

		expect(result).toEqual({ ok: true, lines: ["01 A", "02 B", "03 C"] });
	});

	it("有給檔名時忽略 stdin", () => {
		const result = sortCommand.run(["fragments/part_01.txt"], createSystemContext({ stdin: ["zzz"] }));

		expect(result.lines).not.toContain("zzz");
	});

	it("stdin 是空陣列時輸出空陣列，仍算成功", () => {
		expect(sortCommand.run([], createSystemContext({ stdin: [] }))).toEqual({ ok: true, lines: [] });
	});

	it("沒給檔名也不在管線裡時回 noInput", () => {
		const result = sortCommand.run([], createSystemContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(noInput("sort", "sort fragments/part_01.txt"));
	});

	it("只給選項沒給檔名也不在管線裡時回 noInput", () => {
		const result = sortCommand.run(["-r"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: noInput("sort", "sort fragments/part_01.txt") });
	});

	it("不會改到 stdin 原陣列", () => {
		const stdin = ["b", "a"];
		sortCommand.run([], createSystemContext({ stdin }));

		expect(stdin).toEqual(["b", "a"]);
	});
});

describe("sort 錯誤", () => {
	it("檔案不存在回 fsError，ok 為 false", () => {
		const result = sortCommand.run(["nope.txt"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nope.txt") });
	});

	it("給目錄回 EISDIR", () => {
		const result = sortCommand.run(["fragments"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: fsError("EISDIR", "fragments") });
	});

	it("不認得的選項回 unknownOption", () => {
		const result = sortCommand.run(["-z", "freq.txt"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("sort", "-z") });
	});

	it("長選項回 unknownOption", () => {
		const result = sortCommand.run(["--reverse", "freq.txt"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("sort", "--reverse") });
	});
});
