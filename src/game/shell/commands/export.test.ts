// @vitest-environment node
import { describe, expect, it } from "vitest";
import { invalidAssignment, invalidVariableName, unknownOption } from "../messages";
import { exportCommand } from "./export";
import { createSystemContext } from "./systemFixtures";

describe("export 列出變數", () => {
	it("指令名稱是 export", () => {
		expect(exportCommand.name).toBe("export");
	});

	it("沒參數時依名稱排序列出 declare -x 名稱=\"值\"，不回 nextEnv", () => {
		const result = exportCommand.run([], createSystemContext());

		expect(result).toEqual({
			ok: true,
			lines: ['declare -x HOME="/home/tech"', 'declare -x PWD="/deck4/comms"', 'declare -x USER="tech"'],
		});
	});

	it("用 code unit 排序：大寫在底線與小寫前面", () => {
		const env = { b: "1", _A: "2", Z: "3" };
		const result = exportCommand.run([], createSystemContext({ env }));

		expect(result.lines).toEqual(['declare -x Z="3"', 'declare -x _A="2"', 'declare -x b="1"']);
	});

	it("值裡的雙引號與反斜線會跳脫", () => {
		const env = { MSG: 'say "hi" \\o/' };
		const result = exportCommand.run([], createSystemContext({ env }));

		expect(result.lines).toEqual(['declare -x MSG="say \\"hi\\" \\\\o/"']);
	});

	it("沒有任何變數時輸出空陣列", () => {
		expect(exportCommand.run([], createSystemContext({ env: {} }))).toEqual({ ok: true, lines: [] });
	});
});

describe("export 設定變數", () => {
	it("名稱=值 設定變數，成功不印任何行並回 nextEnv", () => {
		const context = createSystemContext();
		const result = exportCommand.run(["NOVA_DIR=/opt/nova"], context);

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual([]);
		expect(result.nextEnv).toEqual({ ...context.env, NOVA_DIR: "/opt/nova" });
	});

	it("nextEnv 是新物件，不會改到原本的 context.env", () => {
		const context = createSystemContext();
		const before = { ...context.env };
		const result = exportCommand.run(["NOVA_DIR=/opt/nova"], context);

		expect(result.nextEnv).not.toBe(context.env);
		expect(context.env).toEqual(before);
	});

	it("覆寫既有的變數", () => {
		const result = exportCommand.run(["USER=captain"], createSystemContext());

		expect(result.nextEnv?.USER).toBe("captain");
	});

	it("值可以是空字串", () => {
		const result = exportCommand.run(["CAPTAIN_KEY="], createSystemContext());

		expect(result.ok).toBe(true);
		expect(result.nextEnv?.CAPTAIN_KEY).toBe("");
	});

	it("值裡的等號原樣保留，只看第一個等號", () => {
		const result = exportCommand.run(["QUERY=a=b=c"], createSystemContext());

		expect(result.nextEnv?.QUERY).toBe("a=b=c");
	});

	it("一次設定多個變數", () => {
		const result = exportCommand.run(["NOVA_DIR=/opt/nova", "CAPTAIN_KEY=7734"], createSystemContext());

		expect(result.nextEnv?.NOVA_DIR).toBe("/opt/nova");
		expect(result.nextEnv?.CAPTAIN_KEY).toBe("7734");
	});

	it("名稱可以有小寫、數字與底線", () => {
		const result = exportCommand.run(["_deck_4=comms"], createSystemContext());

		expect(result.nextEnv?._deck_4).toBe("comms");
	});

	it("沒有等號且變數不存在時設成空字串", () => {
		const result = exportCommand.run(["NOVA_DIR"], createSystemContext());

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual([]);
		expect(result.nextEnv?.NOVA_DIR).toBe("");
	});

	it("沒有等號且變數已存在時不動它的值", () => {
		const result = exportCommand.run(["USER"], createSystemContext());

		expect(result.ok).toBe(true);
		expect(result.nextEnv?.USER).toBe("tech");
	});
});

describe("export 錯誤", () => {
	it("名稱以數字開頭回 invalidVariableName", () => {
		const result = exportCommand.run(["9LIVES=1"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: invalidVariableName("9LIVES") });
	});

	it("名稱含奇怪字元回 invalidVariableName", () => {
		const result = exportCommand.run(["NOVA-DIR=/opt/nova"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: invalidVariableName("NOVA-DIR") });
	});

	it("沒有等號的名稱不合法也回 invalidVariableName", () => {
		const result = exportCommand.run(["NOVA.DIR"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: invalidVariableName("NOVA.DIR") });
	});

	it("等號前面沒有名稱回 invalidAssignment", () => {
		const result = exportCommand.run(["=/opt/nova"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: invalidAssignment("=/opt/nova") });
	});

	it("等號兩邊有空格（拆成 NOVA_DIR、=、/opt/nova 三個參數）時，只回一次 invalidAssignment，不再罵後面的值", () => {
		const result = exportCommand.run(["NOVA_DIR", "=", "/opt/nova"], createSystemContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(invalidAssignment("="));
	});

	it("部分失敗時合法的仍然設定，整體 ok 為 false", () => {
		const context = createSystemContext();
		const result = exportCommand.run(["NOVA_DIR=/opt/nova", "9X=1"], context);

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(invalidVariableName("9X"));
		expect(result.nextEnv).toEqual({ ...context.env, NOVA_DIR: "/opt/nova" });
	});

	it("全部失敗時不回 nextEnv", () => {
		const result = exportCommand.run(["9X=1"], createSystemContext());

		expect(result.nextEnv).toBeUndefined();
	});

	it("- 開頭的參數回 unknownOption", () => {
		const result = exportCommand.run(["-n", "NOVA_DIR"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("export", "-n") });
	});
});

describe("export 等號旁有空格", () => {
	it("export NAME = VALUE 只回一段空格提示，不再把 VALUE 當變數名稱罵", () => {
		const result = exportCommand.run(["PASSENGERS", "=", "1"], createSystemContext());

		expect(result.ok).toBe(false);
		const text = result.lines.join("\n");
		expect(text).toContain("空格");
		expect(text).not.toContain("不能當變數名稱");
	});
});
