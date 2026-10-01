// @vitest-environment node
import { describe, expect, it } from "vitest";
import { psCommand } from "./ps";
import { createSystemContext, createTestProcesses } from "./systemFixtures";

/** 測試程序清單依 pid 排序後的 `ps` 輸出。 */
const PS_LINES = [
	" PID  USER  %CPU  %MEM  STARTED           COMMAND",
	"   1  root   0.1   0.2  2028-05-30 12:00  /sbin/init",
	"  88  root   3.0   0.8  2028-05-30 12:00  /usr/sbin/commsd",
	" 207  tech   0.1   1.5  2031-03-12 08:15  -bash",
	"3141  nova  87.5  42.0  2028-06-01 00:00  /opt/nova/nova --core",
];

describe("ps", () => {
	it("指令名稱是 ps", () => {
		expect(psCommand.name).toBe("ps");
	});

	it("依 pid 排序，欄位依最大寬度對齊，PID、%CPU、%MEM 靠右", () => {
		const result = psCommand.run([], createSystemContext());

		expect(result).toEqual({ ok: true, lines: PS_LINES });
	});

	it.each([["aux"], ["-e"], ["-ef"], ["whatever"]])("參數 %s 被忽略，輸出一樣", (arg) => {
		expect(psCommand.run([arg], createSystemContext())).toEqual({ ok: true, lines: PS_LINES });
	});

	it("沒有程序時只印表頭", () => {
		const result = psCommand.run([], createSystemContext({ processes: [] }));

		expect(result).toEqual({ ok: true, lines: ["PID  USER  %CPU  %MEM  STARTED  COMMAND"] });
	});

	it("欄位比表頭寬時表頭跟著補空白", () => {
		const processes = [
			{
				pid: 123456,
				user: "engineer",
				cpu: 100,
				mem: 5.25,
				started: "2031-03-12T08:15:00Z",
				command: "/bin/sh",
			},
		];
		const result = psCommand.run([], createSystemContext({ processes }));

		expect(result.lines).toEqual([
			"   PID  USER       %CPU  %MEM  STARTED           COMMAND",
			"123456  engineer  100.0   5.3  2031-03-12 08:15  /bin/sh",
		]);
	});

	it("無法解析的啟動時間原樣顯示", () => {
		const processes = [{ pid: 2, user: "nova", cpu: 0, mem: 0, started: "unknown", command: "nova-watch" }];
		const result = psCommand.run([], createSystemContext({ processes }));

		expect(result.lines[1]).toBe("  2  nova   0.0   0.0  unknown  nova-watch");
	});

	it("不會改到原本的程序清單順序，也不回 nextProcesses", () => {
		const context = createSystemContext();
		const result = psCommand.run([], context);

		expect(context.processes).toEqual(createTestProcesses());
		expect(result.nextProcesses).toBeUndefined();
	});
});
