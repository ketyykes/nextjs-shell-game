// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, noInput, unknownOption } from "../messages";
import { parseWcArgs, wcCommand } from "./wc";
import { createFilterContext, createSealedContext } from "./filterFixtures";

// nova_core.log：3 行、9 個字、59 位元組
// /deck2/readme.txt：「資料中心」加換行，1 行、1 個字、13 位元組（中文字 UTF-8 各 3 位元組）

describe("wc 預設輸出", () => {
	it("指令名稱是 wc", () => {
		expect(wcCommand.name).toBe("wc");
	});

	it("沒有選項時印出行數、字數、位元組數與檔名", () => {
		const result = wcCommand.run(["nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["3 9 59 nova_core.log"] });
	});

	it("位元組用 UTF-8 計算，中文字一個 3 位元組", () => {
		const result = wcCommand.run(["/deck2/readme.txt"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["1 1 13 /deck2/readme.txt"] });
	});

	it("空檔案三個數字都是 0，ok 仍為 true", () => {
		const result = wcCommand.run(["empty.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["0 0 0 empty.log"] });
	});
});

describe("wc 選項", () => {
	it("-l 只印行數", () => {
		const result = wcCommand.run(["-l", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["12 door_events.log"] });
	});

	it("-w 只印字數", () => {
		const result = wcCommand.run(["-w", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["9 nova_core.log"] });
	});

	it("-c 只印位元組數", () => {
		const result = wcCommand.run(["-c", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["59 nova_core.log"] });
	});

	it("合併寫成 -lw", () => {
		const result = wcCommand.run(["-lw", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["3 9 nova_core.log"] });
	});

	it("選項順序不影響欄位順序，固定是行、字、位元組", () => {
		const result = wcCommand.run(["-c", "-l", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["3 59 nova_core.log"] });
	});

	it("不認得的選項回報 unknownOption", () => {
		const result = wcCommand.run(["-m", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("wc", "-m") });
	});

	it("長選項回報 unknownOption", () => {
		const result = wcCommand.run(["--lines", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("wc", "--lines") });
	});

	it("-- 之後的參數都當檔名", () => {
		const result = wcCommand.run(["--", "-l"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "-l") });
	});
});

describe("wc 多個檔案", () => {
	it("最後多一行 total，每欄靠右對齊到該欄最大寬度", () => {
		const result = wcCommand.run(["nova_core.log", "../readme.txt"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["3  9 59 nova_core.log", "1  1 13 ../readme.txt", "4 10 72 total"],
		});
	});

	it("-l 多個檔案也有 total", () => {
		const result = wcCommand.run(["-l", "door_events.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["12 door_events.log", " 3 nova_core.log", "15 total"],
		});
	});

	it("某個檔案失敗不中斷，錯誤放在對應位置，total 只算成功的，ok 為 false", () => {
		const result = wcCommand.run(["-l", "nova_core.log", "missing.log", "door_events.log"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [" 3 nova_core.log", ...fsError("ENOENT", "missing.log"), "12 door_events.log", "15 total"],
		});
	});
});

describe("wc 錯誤", () => {
	it("檔案不存在時回報 ENOENT，ok 為 false", () => {
		const result = wcCommand.run(["missing.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "missing.log") });
	});

	it("參數是目錄時回報 EISDIR，ok 為 false", () => {
		const result = wcCommand.run(["archive"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("EISDIR", "archive") });
	});
});

describe("wc 讀 stdin", () => {
	it("沒給檔名時讀 stdin，不印檔名；位元組數含每行的換行", () => {
		const result = wcCommand.run([], createFilterContext({ stdin: ["a b", "c"] }));

		expect(result).toEqual({ ok: true, lines: ["2 3 6"] });
	});

	it("管線常見用法：算 stdin 有幾行", () => {
		const result = wcCommand.run(["-l"], createFilterContext({ stdin: ["x", "y", "z"] }));

		expect(result).toEqual({ ok: true, lines: ["3"] });
	});

	it("空的 stdin 三個數字都是 0", () => {
		const result = wcCommand.run([], createFilterContext({ stdin: [] }));

		expect(result).toEqual({ ok: true, lines: ["0 0 0"] });
	});

	it("沒給檔名也沒有 stdin 時回報 noInput，ok 為 false", () => {
		const result = wcCommand.run([], createFilterContext());

		expect(result).toEqual({ ok: false, lines: noInput("wc", "wc -l door_events.log") });
	});
});

describe("wc 權限", () => {
	it("讀不到的檔案回報 EACCES，ok 為 false", () => {
		const result = wcCommand.run(["locked.log"], createSealedContext());

		expect(result).toEqual({ ok: false, lines: fsError("EACCES", "locked.log") });
	});
});

describe("wc 選項切分的邊界", () => {
	it("單獨的 - 當成檔名，-- 之後的 -l 也是檔名，沒有選項時三欄全開", () => {
		expect(parseWcArgs(["-", "--", "-l"])).toEqual({
			ok: true,
			options: { lines: true, words: true, bytes: true },
			paths: ["-", "-l"],
		});
	});

	it("第一個未知字母就停下，後面的長選項不會被回報", () => {
		expect(parseWcArgs(["-lz", "--bytes"])).toEqual({ ok: false, lines: unknownOption("wc", "-z") });
	});
});
