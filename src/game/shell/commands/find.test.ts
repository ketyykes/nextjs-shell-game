// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, missingOperand, unknownOption } from "../messages";
import { findCommand, matchNamePattern } from "./find";
import { createFilterContext, createSealedContext } from "./filterFixtures";

/** `find /deck2` 的完整輸出：深度優先、同層依名稱排序、隱藏檔也列。 */
const DECK2_ALL = [
	"/deck2",
	"/deck2/logs",
	"/deck2/logs/archive",
	"/deck2/logs/archive/.purged.log",
	"/deck2/logs/archive/old.log",
	"/deck2/logs/door_events.log",
	"/deck2/logs/empty.log",
	"/deck2/logs/evac_2028-06-02.log",
	"/deck2/logs/nova_core.log",
	"/deck2/readme.txt",
];

describe("matchNamePattern", () => {
	it("沒有萬用字元時要整個檔名相同", () => {
		expect(matchNamePattern("core", "nova_core.log", false)).toBe(false);
		expect(matchNamePattern("nova_core.log", "nova_core.log", false)).toBe(true);
	});

	it("* 配任意長度（含零個字元）", () => {
		expect(matchNamePattern("*.log", "old.log", false)).toBe(true);
		expect(matchNamePattern("*.log", ".log", false)).toBe(true);
		expect(matchNamePattern("*core*", "nova_core.log", false)).toBe(true);
	});

	it("? 配剛好一個字元", () => {
		expect(matchNamePattern("nova_????.log", "nova_core.log", false)).toBe(true);
		expect(matchNamePattern("nova_???.log", "nova_core.log", false)).toBe(false);
	});

	it("其他符號照字面比對，. 不是萬用字元", () => {
		expect(matchNamePattern("a.c", "abc", false)).toBe(false);
		expect(matchNamePattern("a+(b)", "a+(b)", false)).toBe(true);
	});

	it("ignoreCase 為 true 時不分大小寫", () => {
		expect(matchNamePattern("*NOVA*", "nova_core.log", false)).toBe(false);
		expect(matchNamePattern("*NOVA*", "nova_core.log", true)).toBe(true);
	});
});

describe("find 列出全部", () => {
	it("指令名稱是 find", () => {
		expect(findCommand.name).toBe("find");
	});

	it("給絕對路徑時，起點本身與所有子孫都列出，用玩家給的路徑當前綴", () => {
		const result = findCommand.run(["/deck2"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DECK2_ALL });
	});

	it("沒給路徑時預設是 .，前綴是 ./", () => {
		const result = findCommand.run([], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				".",
				"./archive",
				"./archive/.purged.log",
				"./archive/old.log",
				"./door_events.log",
				"./empty.log",
				"./evac_2028-06-02.log",
				"./nova_core.log",
			],
		});
	});

	it("路徑結尾有 / 時不重複斜線", () => {
		const result = findCommand.run(["archive/"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["archive/", "archive/.purged.log", "archive/old.log"] });
	});

	it("起點是檔案時只列它自己", () => {
		const result = findCommand.run(["nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["nova_core.log"] });
	});

	it("可以給多個起點，依序處理", () => {
		const result = findCommand.run(["archive", "/deck2/readme.txt"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["archive", "archive/.purged.log", "archive/old.log", "/deck2/readme.txt"],
		});
	});

	it("從根目錄找時子路徑不會變成 //", () => {
		const result = findCommand.run(["/", "-name", "readme.txt"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["/deck2/readme.txt"] });
	});
});

describe("find -name / -iname", () => {
	it("-name 用 * 找出所有 .log，隱藏檔也算", () => {
		const result = findCommand.run([".", "-name", "*.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				"./archive/.purged.log",
				"./archive/old.log",
				"./door_events.log",
				"./empty.log",
				"./evac_2028-06-02.log",
				"./nova_core.log",
			],
		});
	});

	it("-name 比對整個檔名", () => {
		const result = findCommand.run(["/deck2", "-name", "*core*"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["/deck2/logs/nova_core.log"] });
	});

	it("起點本身的名稱也會被比對", () => {
		const result = findCommand.run(["/deck2", "-name", "deck2"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["/deck2"] });
	});

	it("-name 分大小寫，沒有符合時 ok 仍為 true、沒有輸出", () => {
		const result = findCommand.run([".", "-name", "*NOVA*"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});

	it("-iname 不分大小寫", () => {
		const result = findCommand.run([".", "-iname", "*NOVA*"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["./nova_core.log"] });
	});

	it("-name 沒接樣式時提示缺少樣式，ok 為 false", () => {
		const result = findCommand.run([".", "-name"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("find", "-name 後面要接樣式，例如 find . -name \"*.log\""),
		});
	});

	it("-iname 沒接樣式時提示缺少樣式，ok 為 false", () => {
		const result = findCommand.run([".", "-iname"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("find", "-iname 後面要接樣式，例如 find . -iname \"*nova*\""),
		});
	});
});

describe("find -type", () => {
	it("-type d 只列目錄", () => {
		const result = findCommand.run(["/deck2", "-type", "d"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["/deck2", "/deck2/logs", "/deck2/logs/archive"] });
	});

	it("-type f 只列檔案，可以跟 -name 一起用", () => {
		const result = findCommand.run(["/deck2", "-type", "f", "-name", "*.txt"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["/deck2/readme.txt"] });
	});

	it("-type 不是 f 或 d 時回報 unknownOption", () => {
		const result = findCommand.run([".", "-type", "x"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("find", "-type x") });
	});

	it("-type 沒接值時提示缺少類型，ok 為 false", () => {
		const result = findCommand.run([".", "-type"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("find", "-type 後面要接 f（檔案）或 d（目錄），例如 find . -type d"),
		});
	});
});

describe("find 錯誤", () => {
	it("不認得的 -xxx 回報 unknownOption", () => {
		const result = findCommand.run([".", "-size", "10k"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("find", "-size") });
	});

	it("路徑不存在時回報 ENOENT，ok 為 false", () => {
		const result = findCommand.run(["nowhere"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nowhere") });
	});

	it("某個起點不存在不中斷，繼續處理其他起點", () => {
		const result = findCommand.run(["nowhere", "archive"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "nowhere"), "archive", "archive/.purged.log", "archive/old.log"],
		});
	});

	it("忽略 stdin，沒給路徑一樣從 . 開始", () => {
		const result = findCommand.run(["-name", "old.log"], createFilterContext({ stdin: ["x"] }));

		expect(result).toEqual({ ok: true, lines: ["./archive/old.log"] });
	});
});

describe("find 權限", () => {
	it("讀不到的目錄本身會列出，但不往下走，回報 EACCES，ok 為 false", () => {
		const result = findCommand.run(["/"], createSealedContext());

		expect(result).toEqual({
			ok: false,
			lines: ["/", "/locked.log", "/open.log", "/vault", ...fsError("EACCES", "/vault")],
		});
	});

	it("讀不到的目錄不影響後面的起點", () => {
		const result = findCommand.run(["vault", "open.log"], createSealedContext());

		expect(result).toEqual({ ok: false, lines: ["vault", ...fsError("EACCES", "vault"), "open.log"] });
	});
});
