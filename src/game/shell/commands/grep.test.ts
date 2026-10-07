// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	conflictingMatchers,
	fsError,
	invalidPattern,
	missingOperand,
	noInput,
	unknownOption,
} from "../messages";
import { grepCommand } from "./grep";
import { createFilterContext, createSealedContext, EVAC_LINES } from "./filterFixtures";

const EVAC = "evac_2028-06-02.log";
const UPPER_ERROR_LINE = "21:42 ERROR 艙門 C2 無回應";
const LOWER_ERROR_LINE = "21:45 error 艙門 C3 鎖定";

describe("grep 基本比對", () => {
	it("指令名稱是 grep", () => {
		expect(grepCommand.name).toBe("grep");
	});

	it("印出含有字串的行，預設分大小寫", () => {
		const result = grepCommand.run(["ERROR", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE] });
	});

	it("中文字串也可以搜", () => {
		const result = grepCommand.run(["艙門", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE, LOWER_ERROR_LINE] });
	});

	it("預設是基本正規表示式：. 配任意一個字元", () => {
		const result = grepCommand.run(["a.c"], createFilterContext({ stdin: ["abc", "a.c", "ac"] }));

		expect(result).toEqual({ ok: true, lines: ["abc", "a.c"] });
	});

	it("^ 是行首，[...] 配其中一個字", () => {
		const result = grepCommand.run(["^21:4[25]", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE, LOWER_ERROR_LINE] });
	});

	it("基本正規表示式裡的 | 是字面字元", () => {
		const result = grepCommand.run(["ERROR|WARN", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});

	it("沒有任何符合不算錯誤：ok 為 true、沒有輸出", () => {
		const result = grepCommand.run(["NOTHING", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});
});

describe("grep 選項", () => {
	it("-i 不分大小寫", () => {
		const result = grepCommand.run(["-i", "error", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE, LOWER_ERROR_LINE] });
	});

	it("-n 在行首加行號", () => {
		const result = grepCommand.run(["-n", "ERROR", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [`2:${UPPER_ERROR_LINE}`] });
	});

	it("-c 只印符合的行數", () => {
		const result = grepCommand.run(["-c", "INFO", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["2"] });
	});

	it("-c 沒有符合時印 0，ok 仍為 true", () => {
		const result = grepCommand.run(["-c", "NOTHING", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["0"] });
	});

	it("-v 反向，印出不含字串的行", () => {
		const result = grepCommand.run(["-v", "艙門", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [EVAC_LINES[0], EVAC_LINES[2], EVAC_LINES[4]] });
	});

	it("旗標可以合併，-in 不分大小寫並加行號", () => {
		const result = grepCommand.run(["-in", "error", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [`2:${UPPER_ERROR_LINE}`, `4:${LOWER_ERROR_LINE}`] });
	});

	it("-vc 計算不符合的行數", () => {
		const result = grepCommand.run(["-vic", "error", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["3"] });
	});

	it("選項可以放在字串與檔名後面", () => {
		const result = grepCommand.run(["error", EVAC, "-i"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE, LOWER_ERROR_LINE] });
	});

	it("-- 之後以 - 開頭的參數也當成字串", () => {
		const result = grepCommand.run(["--", "-n"], createFilterContext({ stdin: ["a -n b", "c"] }));

		expect(result).toEqual({ ok: true, lines: ["a -n b"] });
	});

	it("不認得的選項回報 unknownOption", () => {
		const result = grepCommand.run(["-j", "ERROR", EVAC], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("grep", "-j") });
	});

	it("長選項回報 unknownOption", () => {
		const result = grepCommand.run(["--color", "ERROR", EVAC], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("grep", "--color") });
	});
});

describe("grep -E 與 -F", () => {
	it("-E 是延伸正規表示式，| 代表「或」", () => {
		const result = grepCommand.run(["-E", "ERROR|WARN", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE, EVAC_LINES[2]] });
	});

	it("-E 可以跟 -i、-n 合併", () => {
		const result = grepCommand.run(["-Ein", "error|warn", EVAC], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: [`2:${UPPER_ERROR_LINE}`, `3:${EVAC_LINES[2]}`, `4:${LOWER_ERROR_LINE}`],
		});
	});

	it("-E 搭配 -c 與 -v", () => {
		const result = grepCommand.run(["-Evc", "^21:4[0-3]", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["2"] });
	});

	it("-F 照字面比對，. 就是句點", () => {
		const result = grepCommand.run(["-F", "a.c"], createFilterContext({ stdin: ["abc", "a.c"] }));

		expect(result).toEqual({ ok: true, lines: ["a.c"] });
	});

	it("-F 時 [ 不是特殊符號，不會回報樣式錯誤", () => {
		const result = grepCommand.run(["-F", "a[1"], createFilterContext({ stdin: ["a[1]", "a1"] }));

		expect(result).toEqual({ ok: true, lines: ["a[1]"] });
	});

	it("-Fi 字面比對不分大小寫", () => {
		const result = grepCommand.run(["-Fi", "error", EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE, LOWER_ERROR_LINE] });
	});

	it("-E 與 -F 一起用回報 conflictingMatchers", () => {
		expect(grepCommand.run(["-E", "-F", "x", EVAC], createFilterContext())).toEqual({
			ok: false,
			lines: conflictingMatchers("grep"),
		});
		expect(grepCommand.run(["-FE", "x", EVAC], createFilterContext())).toEqual({
			ok: false,
			lines: conflictingMatchers("grep"),
		});
	});

	it("同一個選項重複給沒關係", () => {
		const result = grepCommand.run(["-E", "-E", "ERROR|WARN", EVAC], createFilterContext());

		expect(result.lines).toEqual([UPPER_ERROR_LINE, EVAC_LINES[2]]);
	});

	it("-r 也用正規表示式比對", () => {
		const result = grepCommand.run(["-r", "^ERROR .*紀錄$", "archive"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["archive/.purged.log:ERROR 隱藏紀錄", "archive/old.log:ERROR 舊紀錄"],
		});
	});
});

describe("grep -w 與 -o", () => {
	const WORD_LINES = ["foo bar", "foobar baz", "bar_foo foo", "foo-foo"];

	it("-w 只挑出整個單字符合的行", () => {
		const result = grepCommand.run(["-w", "foo"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: ["foo bar", "bar_foo foo", "foo-foo"] });
	});

	it("-o 每個符合的片段印一行", () => {
		const result = grepCommand.run(["-o", "fo*"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: ["foo", "foo", "foo", "foo", "foo", "foo"] });
	});

	it("-on 每個片段前面都加所在的行號", () => {
		const result = grepCommand.run(["-on", "foo"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: ["1:foo", "2:foo", "3:foo", "3:foo", "4:foo", "4:foo"] });
	});

	it("-ow 只印整個單字的片段", () => {
		const result = grepCommand.run(["-ow", "foo"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: ["foo", "foo", "foo", "foo"] });
	});

	it("多個檔案時 -o 的每個片段前面加檔案路徑", () => {
		const result = grepCommand.run(["-o", "C[23]", EVAC, EVAC], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [`${EVAC}:C2`, `${EVAC}:C3`, `${EVAC}:C2`, `${EVAC}:C3`] });
	});

	it("-oc 照樣計算符合的行數", () => {
		const result = grepCommand.run(["-oc", "foo"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: ["4"] });
	});

	it("-ov 沒有片段可印，沒有輸出也不算錯誤", () => {
		const result = grepCommand.run(["-ov", "foo"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: [] });
	});

	it("-o 不印空字串的符合", () => {
		const result = grepCommand.run(["-o", "x*"], createFilterContext({ stdin: WORD_LINES }));

		expect(result).toEqual({ ok: true, lines: [] });
	});

	it("-wF 字面的整個單字比對", () => {
		const result = grepCommand.run(["-wF", "v3.1"], createFilterContext({ stdin: ["v3.1 v301", "v3.12", "v301"] }));

		expect(result).toEqual({ ok: true, lines: ["v3.1 v301"] });
	});
});

describe("grep 不合法的樣式", () => {
	it("回報 invalidPattern，ok 為 false", () => {
		const result = grepCommand.run(["[a", EVAC], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidPattern("grep", "[a", "UNMATCHED_BRACKET") });
	});

	it("-E 的群組沒關也回報 invalidPattern", () => {
		const result = grepCommand.run(["-E", "(ERROR", EVAC], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidPattern("grep", "(ERROR", "UNMATCHED_PAREN") });
	});

	it("樣式不合法時不讀檔案，也不回報檔案錯誤", () => {
		const result = grepCommand.run(["a\\", "missing.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidPattern("grep", "a\\", "TRAILING_BACKSLASH") });
	});
});

describe("grep 多個檔案", () => {
	it("每行前面加 檔案路徑:", () => {
		const result = grepCommand.run(["NOVA", "door_events.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["door_events.log:21:43 ALL LOCK by NOVA", "nova_core.log:NOVA core v3.1"],
		});
	});

	it("-n 時是 檔案路徑:行號:內容", () => {
		const result = grepCommand.run(["-n", "NOVA", "door_events.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["door_events.log:12:21:43 ALL LOCK by NOVA", "nova_core.log:1:NOVA core v3.1"],
		});
	});

	it("-c 時每個檔案一行 檔案路徑:數量", () => {
		const result = grepCommand.run(["-c", "LOCK", "door_events.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["door_events.log:4", "nova_core.log:0"] });
	});

	it("某個檔案失敗不中斷，錯誤放在對應位置，ok 為 false", () => {
		const result = grepCommand.run(["NOVA", "missing.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "missing.log"), "nova_core.log:NOVA core v3.1"],
		});
	});
});

describe("grep 目錄與 -r", () => {
	it("給目錄但沒加 -r 時提示要加 -r，ok 為 false", () => {
		const result = grepCommand.run(["ERROR", "archive"], createFilterContext());

		expect(result.ok).toBe(false);
	});

	it("提示的示範指令保留原本的搜尋樣式，照著打就能用", () => {
		const result = grepCommand.run(["ERROR", "archive"], createFilterContext());

		expect(result.lines.join("\n")).toContain("grep -r ERROR archive");
	});

	it("-r 遞迴搜目錄，隱藏檔也搜，路徑用玩家寫法接子路徑", () => {
		const result = grepCommand.run(["-r", "ERROR", "archive"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["archive/.purged.log:ERROR 隱藏紀錄", "archive/old.log:ERROR 舊紀錄"],
		});
	});

	it("-r 的路徑結尾有 / 時不重複斜線", () => {
		const result = grepCommand.run(["-r", "舊紀錄", "archive/"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["archive/old.log:ERROR 舊紀錄"] });
	});

	it("-r 深度優先、同層依名稱排序", () => {
		const result = grepCommand.run(["-r", "ERROR", "/deck2"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				"/deck2/logs/archive/.purged.log:ERROR 隱藏紀錄",
				"/deck2/logs/archive/old.log:ERROR 舊紀錄",
				`/deck2/logs/${EVAC}:${UPPER_ERROR_LINE}`,
			],
		});
	});

	it("-r . 的前綴是 ./", () => {
		const result = grepCommand.run(["-r", "舊紀錄", "."], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["./archive/old.log:ERROR 舊紀錄"] });
	});

	it("-rn 合併：路徑、行號、內容", () => {
		const result = grepCommand.run(["-rn", "rollback", "/deck2/logs"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["/deck2/logs/nova_core.log:3:rollback: pending"] });
	});

	it("-r 給的是檔案時也加檔名前綴", () => {
		const result = grepCommand.run(["-r", "rollback", "nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["nova_core.log:rollback: pending"] });
	});

	it("-r 沒給路徑也沒有 stdin 時搜目前目錄，前綴不加 ./（跟 GNU grep 一樣）", () => {
		const result = grepCommand.run(["-r", "舊紀錄"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["archive/old.log:ERROR 舊紀錄"] });
	});

	it("-r 找不到的路徑回報 ENOENT，ok 為 false", () => {
		const result = grepCommand.run(["-r", "ERROR", "nowhere"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "nowhere") });
	});

	it("-r 沒有任何符合時 ok 為 true", () => {
		const result = grepCommand.run(["-r", "NOTHING", "archive"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});
});

describe("grep 讀 stdin", () => {
	it("沒給檔名時讀 stdin，不加檔名前綴", () => {
		const result = grepCommand.run(["ERROR"], createFilterContext({ stdin: EVAC_LINES }));

		expect(result).toEqual({ ok: true, lines: [UPPER_ERROR_LINE] });
	});

	it("stdin 搭配 -n 印 stdin 的行號", () => {
		const result = grepCommand.run(["-n", "WARN"], createFilterContext({ stdin: EVAC_LINES }));

		expect(result).toEqual({ ok: true, lines: [`3:${EVAC_LINES[2]}`] });
	});

	it("沒給檔名也沒有 stdin 時回報 noInput，ok 為 false", () => {
		const result = grepCommand.run(["ERROR"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: noInput("grep", `grep ERROR ${EVAC}`) });
	});
});

describe("grep 缺少字串", () => {
	const missing = missingOperand("grep", "一個要搜尋的字串，例如 grep ERROR system.log");

	it("什麼都沒給時提示缺少字串，ok 為 false", () => {
		const result = grepCommand.run([], createFilterContext());

		expect(result).toEqual({ ok: false, lines: missing });
	});

	it("只給選項時也提示缺少字串", () => {
		const result = grepCommand.run(["-i"], createFilterContext({ stdin: EVAC_LINES }));

		expect(result).toEqual({ ok: false, lines: missing });
	});
});

describe("grep 權限", () => {
	it("讀不到的檔案回報 EACCES，其他檔案照樣搜，ok 為 false", () => {
		const result = grepCommand.run(["NOVA", "locked.log", "open.log"], createSealedContext());

		expect(result).toEqual({ ok: false, lines: [...fsError("EACCES", "locked.log"), "open.log:NOVA open"] });
	});

	it("-r 遇到讀不到的檔案與目錄都回報 EACCES，不往下搜", () => {
		const result = grepCommand.run(["-r", "NOVA", "/"], createSealedContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("EACCES", "/locked.log"), "/open.log:NOVA open", ...fsError("EACCES", "/vault")],
		});
	});
});
