// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unknownOption } from "../messages";
import { topCommand } from "./top";
import { createSystemContext, createTestProcesses } from "./systemFixtures";

describe("top", () => {
	it("指令名稱是 top", () => {
		expect(topCommand.name).toBe("top");
	});

	it("標題、程序數、空行，然後依 %CPU 由大到小列出（同值依 pid）", () => {
		const result = topCommand.run([], createSystemContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				"KEPLER-9 系統負載（靜態快照）",
				"程序：4 個",
				"",
				" PID  USER  %CPU  %MEM  STARTED           COMMAND",
				"3141  nova  87.5  42.0  2028-06-01 00:00  /opt/nova/nova --core",
				"  88  root   3.0   0.8  2028-05-30 12:00  /usr/sbin/commsd",
				"   1  root   0.1   0.2  2028-05-30 12:00  /sbin/init",
				" 207  tech   0.1   1.5  2031-03-12 08:15  -bash",
			],
		});
	});

	it("沒有程序時程序數是 0，只印表頭", () => {
		const result = topCommand.run([], createSystemContext({ processes: [] }));

		expect(result).toEqual({
			ok: true,
			lines: ["KEPLER-9 系統負載（靜態快照）", "程序：0 個", "", "PID  USER  %CPU  %MEM  STARTED  COMMAND"],
		});
	});

	it("不會改到原本的程序清單", () => {
		const context = createSystemContext();
		topCommand.run([], context);

		expect(context.processes).toEqual(createTestProcesses());
	});

	it("有參數時回 unknownOption", () => {
		const result = topCommand.run(["-b"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("top", "-b") });
	});
});
