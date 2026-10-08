// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, invalidNumber, missingOperand, noInput, unknownOption } from "../messages";
import { headCommand, parseLineCountArgs } from "./head";
import { createFilterContext, createSealedContext, DOOR_EVENTS_LINES, EVAC_LINES, NOVA_CORE_LINES } from "./filterFixtures";

describe("head 單一檔案", () => {
	it("指令名稱是 head", () => {
		expect(headCommand.name).toBe("head");
	});

	it("預設印出前 10 行", () => {
		const result = headCommand.run(["door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(0, 10) });
	});

	it("檔案不足 N 行時全部印出", () => {
		const result = headCommand.run(["nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: NOVA_CORE_LINES });
	});

	it("-n 5 印出前 5 行", () => {
		const result = headCommand.run(["-n", "5", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(0, 5) });
	});

	it("-n5 黏在一起也可以", () => {
		const result = headCommand.run(["-n5", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(0, 5) });
	});

	it("-5 簡寫等同 -n 5", () => {
		const result = headCommand.run(["-5", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(0, 5) });
	});

	it("選項可以放在檔名後面", () => {
		const result = headCommand.run(["door_events.log", "-n", "2"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(0, 2) });
	});

	it("空檔案沒有輸出，ok 仍為 true", () => {
		const result = headCommand.run(["empty.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});

	it("可以用絕對路徑", () => {
		const result = headCommand.run(["-n", "1", "/deck2/logs/nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["NOVA core v3.1"] });
	});
});

describe("head 數字錯誤", () => {
	it("-n 後面不是數字時回報 invalidNumber", () => {
		const result = headCommand.run(["-n", "abc", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidNumber("head", "abc") });
	});

	it("-n 0 不是正整數，回報 invalidNumber", () => {
		const result = headCommand.run(["-n", "0", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidNumber("head", "0") });
	});

	it("-n 0 的提示說明要 1 以上的整數，不會說「0 不是數字」", () => {
		const result = headCommand.run(["-n", "0", "door_events.log"], createFilterContext());
		const text = result.lines.join("\n");

		expect(text).toContain("1 以上的整數");
		expect(text).not.toContain("不是數字");
	});

	it("-n 負數回報 invalidNumber", () => {
		const result = headCommand.run(["-n", "-3", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidNumber("head", "-3") });
	});

	it("-n2x 這種混了字母的回報 invalidNumber", () => {
		const result = headCommand.run(["-n2x", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidNumber("head", "2x") });
	});

	it("-n 後面什麼都沒有時提示缺少行數", () => {
		const result = headCommand.run(["-n"], createFilterContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(missingOperand("head", "在 -n 後面接要顯示的行數，例如 head -n 5 door_events.log"));
	});
});

describe("head 選項", () => {
	it("不認得的選項回報 unknownOption", () => {
		const result = headCommand.run(["-z", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("head", "-z") });
	});

	it("長選項回報 unknownOption", () => {
		const result = headCommand.run(["--lines=3", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("head", "--lines=3") });
	});

	it("-- 之後的參數都當檔名", () => {
		const result = headCommand.run(["--", "-n"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "-n") });
	});
});

describe("head 多個檔案", () => {
	it("每個檔案前加 ==> 檔名 <==，檔案之間空一行", () => {
		const result = headCommand.run(["-n", "2", "door_events.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				"==> door_events.log <==",
				...DOOR_EVENTS_LINES.slice(0, 2),
				"",
				"==> nova_core.log <==",
				...NOVA_CORE_LINES.slice(0, 2),
			],
		});
	});

	it("某個檔案失敗不中斷，錯誤放在對應位置，ok 為 false", () => {
		const result = headCommand.run(
			["-n", "1", "door_events.log", "missing.log", "nova_core.log"],
			createFilterContext(),
		);

		expect(result).toEqual({
			ok: false,
			lines: [
				"==> door_events.log <==",
				DOOR_EVENTS_LINES[0],
				...fsError("ENOENT", "missing.log"),
				"",
				"==> nova_core.log <==",
				NOVA_CORE_LINES[0],
			],
		});
	});

	it("第一個檔案就失敗時，下一個標題前不多空一行", () => {
		const result = headCommand.run(["-n", "1", "missing.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "missing.log"), "==> nova_core.log <==", NOVA_CORE_LINES[0]],
		});
	});
});

describe("head 錯誤", () => {
	it("檔案不存在時回報 ENOENT，ok 為 false", () => {
		const result = headCommand.run(["missing.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "missing.log") });
	});

	it("參數是目錄時回報 EISDIR，ok 為 false", () => {
		const result = headCommand.run(["archive"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("EISDIR", "archive") });
	});
});

describe("head 讀 stdin", () => {
	it("沒給檔名時讀管線前一個指令的輸出", () => {
		const result = headCommand.run(["-n", "2"], createFilterContext({ stdin: EVAC_LINES }));

		expect(result).toEqual({ ok: true, lines: EVAC_LINES.slice(0, 2) });
	});

	it("stdin 不加 ==> <== 標題", () => {
		const result = headCommand.run([], createFilterContext({ stdin: ["a", "b"] }));

		expect(result).toEqual({ ok: true, lines: ["a", "b"] });
	});

	it("有給檔名時忽略 stdin", () => {
		const result = headCommand.run(["-n", "1", "nova_core.log"], createFilterContext({ stdin: ["x"] }));

		expect(result).toEqual({ ok: true, lines: ["NOVA core v3.1"] });
	});

	it("沒給檔名也沒有 stdin 時回報 noInput，ok 為 false", () => {
		const result = headCommand.run([], createFilterContext());

		expect(result).toEqual({ ok: false, lines: noInput("head", "head -n 5 door_events.log") });
	});
});

describe("head 權限", () => {
	it("讀不到的檔案回報 EACCES，ok 為 false", () => {
		const result = headCommand.run(["locked.log"], createSealedContext());

		expect(result).toEqual({ ok: false, lines: fsError("EACCES", "locked.log") });
	});
});

describe("head 選項切分的邊界", () => {
	it("不認得的合併選項只回報第一個字母", () => {
		expect(parseLineCountArgs("head", ["-xyz"])).toEqual({ ok: false, lines: unknownOption("head", "-x") });
	});

	it("-n 後面的參數一律當行數，即使它是 -- 或 -5", () => {
		expect(parseLineCountArgs("head", ["-n", "--", "a"])).toEqual({ ok: false, lines: invalidNumber("head", "--") });
		expect(parseLineCountArgs("head", ["-n", "-5"])).toEqual({ ok: false, lines: invalidNumber("head", "-5") });
	});

	it("-- 之後的 -n 5 都當檔名，行數維持預設", () => {
		expect(parseLineCountArgs("head", ["--", "-n", "5"])).toEqual({ ok: true, count: 10, paths: ["-n", "5"] });
	});

	it("單獨的 - 當檔名，多次給行數以最後一次為準", () => {
		expect(parseLineCountArgs("head", ["-n", "3", "-", "-2"])).toEqual({ ok: true, count: 2, paths: ["-"] });
	});
});
