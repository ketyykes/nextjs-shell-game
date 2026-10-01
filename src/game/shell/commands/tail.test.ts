// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, invalidNumber, missingOperand, noInput, unknownOption } from "../messages";
import { tailCommand } from "./tail";
import { createFilterContext, createSealedContext, DOOR_EVENTS_LINES, EVAC_LINES, NOVA_CORE_LINES } from "./filterFixtures";

describe("tail 單一檔案", () => {
	it("指令名稱是 tail", () => {
		expect(tailCommand.name).toBe("tail");
	});

	it("預設印出最後 10 行", () => {
		const result = tailCommand.run(["door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(-10) });
	});

	it("檔案不足 N 行時全部印出", () => {
		const result = tailCommand.run(["nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: NOVA_CORE_LINES });
	});

	it("-n 3 印出最後 3 行", () => {
		const result = tailCommand.run(["-n", "3", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(-3) });
	});

	it("-n3 黏在一起也可以", () => {
		const result = tailCommand.run(["-n3", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: DOOR_EVENTS_LINES.slice(-3) });
	});

	it("-1 簡寫等同 -n 1，看到最後一筆 NOVA 鎖門紀錄", () => {
		const result = tailCommand.run(["-1", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["21:43 ALL LOCK by NOVA"] });
	});

	it("空檔案沒有輸出，ok 仍為 true", () => {
		const result = tailCommand.run(["empty.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: [] });
	});
});

describe("tail 選項錯誤", () => {
	it("-n 後面不是正整數時回報 invalidNumber", () => {
		const result = tailCommand.run(["-n", "+5", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidNumber("tail", "+5") });
	});

	it("-0 回報 invalidNumber", () => {
		const result = tailCommand.run(["-0", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: invalidNumber("tail", "0") });
	});

	it("-n 後面什麼都沒有時提示缺少行數", () => {
		const result = tailCommand.run(["-n"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: missingOperand("tail", "在 -n 後面接要顯示的行數，例如 tail -n 5 door_events.log"),
		});
	});

	it("不認得的選項回報 unknownOption", () => {
		const result = tailCommand.run(["-f", "door_events.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("tail", "-f") });
	});
});

describe("tail 多個檔案", () => {
	it("每個檔案前加 ==> 檔名 <==，檔案之間空一行", () => {
		const result = tailCommand.run(["-n", "1", "door_events.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: ["==> door_events.log <==", "21:43 ALL LOCK by NOVA", "", "==> nova_core.log <==", "rollback: pending"],
		});
	});

	it("某個檔案失敗不中斷，ok 為 false", () => {
		const result = tailCommand.run(["-n", "1", "archive", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("EISDIR", "archive"), "==> nova_core.log <==", "rollback: pending"],
		});
	});
});

describe("tail 錯誤與 stdin", () => {
	it("檔案不存在時回報 ENOENT，ok 為 false", () => {
		const result = tailCommand.run(["missing.log"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: fsError("ENOENT", "missing.log") });
	});

	it("沒給檔名時讀 stdin", () => {
		const result = tailCommand.run(["-n", "2"], createFilterContext({ stdin: EVAC_LINES }));

		expect(result).toEqual({ ok: true, lines: EVAC_LINES.slice(-2) });
	});

	it("沒給檔名也沒有 stdin 時回報 noInput，ok 為 false", () => {
		const result = tailCommand.run([], createFilterContext());

		expect(result).toEqual({ ok: false, lines: noInput("tail", "tail -n 5 door_events.log") });
	});
});

describe("tail 權限", () => {
	it("讀不到的檔案回報 EACCES，ok 為 false", () => {
		const result = tailCommand.run(["locked.log"], createSealedContext());

		expect(result).toEqual({ ok: false, lines: fsError("EACCES", "locked.log") });
	});
});
