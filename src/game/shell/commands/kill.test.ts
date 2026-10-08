// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	invalidPid,
	missingOperand,
	noSuchProcess,
	processIgnoredSignal,
	processProtected,
	unknownOption,
} from "../messages";
import { killCommand } from "./kill";
import { createSystemContext, createTestProcesses } from "./systemFixtures";

const NOVA_COMMAND = "/opt/nova/nova --core";
const MISSING_PID = missingOperand("kill", "一個程序編號，例如 kill 42；編號用 ps 查");

/** 取出結果程序清單的 pid，方便比對。 */
function pidsOf(processes: { pid: number }[] | undefined): number[] | undefined {
	return processes?.map((process) => process.pid);
}

describe("kill 成功", () => {
	it("指令名稱是 kill", () => {
		expect(killCommand.name).toBe("kill");
	});

	it("終止一般程序：印一行訊息並回不含它的 nextProcesses", () => {
		const result = killCommand.run(["207"], createSystemContext());

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual(["已終止程序 207（-bash）"]);
		expect(pidsOf(result.nextProcesses)).toEqual([3141, 1, 88]);
	});

	it("nextProcesses 是新陣列，不會改到原本的 context.processes", () => {
		const context = createSystemContext();
		const result = killCommand.run(["207"], context);

		expect(result.nextProcesses).not.toBe(context.processes);
		expect(context.processes).toEqual(createTestProcesses());
	});

	it.each([["-9"], ["-KILL"]])("%s 可以終止忽略一般訊號的程序", (signal) => {
		const result = killCommand.run([signal, "3141"], createSystemContext());

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual([`已終止程序 3141（${NOVA_COMMAND}）`]);
		expect(pidsOf(result.nextProcesses)).toEqual([1, 207, 88]);
	});

	it.each([["-15"], ["-TERM"]])("%s 跟不帶訊號一樣可以終止一般程序", (signal) => {
		const result = killCommand.run([signal, "88"], createSystemContext());

		expect(result.ok).toBe(true);
		expect(pidsOf(result.nextProcesses)).toEqual([3141, 1, 207]);
	});

	it("PID 前面有 0 也認得", () => {
		const result = killCommand.run(["0088"], createSystemContext());

		expect(result.lines).toEqual(["已終止程序 88（/usr/sbin/commsd）"]);
	});
});

describe("kill 被拒絕", () => {
	it("忽略一般訊號的程序不帶 -9 時回 processIgnoredSignal，不回 nextProcesses", () => {
		const result = killCommand.run(["3141"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: processIgnoredSignal(3141, NOVA_COMMAND) });
	});

	it.each([["-15"], ["-TERM"]])("%s 也會被忽略一般訊號的程序忽略", (signal) => {
		const result = killCommand.run([signal, "3141"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: processIgnoredSignal(3141, NOVA_COMMAND) });
	});

	it("受保護的程序不帶 -9 回 processProtected", () => {
		const result = killCommand.run(["1"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: processProtected(1, "/sbin/init") });
	});

	it("受保護的程序帶 -9 也回 processProtected", () => {
		const result = killCommand.run(["-9", "1"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: processProtected(1, "/sbin/init") });
	});
});

describe("kill 多個 PID", () => {
	it("逐一處理，失敗不中斷，整體 ok 為 false，成功的仍然移除", () => {
		const result = killCommand.run(["207", "999", "88"], createSystemContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual([
			"已終止程序 207（-bash）",
			...noSuchProcess(999),
			"已終止程序 88（/usr/sbin/commsd）",
		]);
		expect(pidsOf(result.nextProcesses)).toEqual([3141, 1]);
	});

	it("同一個 PID 給兩次，第二次找不到", () => {
		const result = killCommand.run(["207", "207"], createSystemContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(["已終止程序 207（-bash）", ...noSuchProcess(207)]);
	});

	it("-9 對所有 PID 都有效", () => {
		const result = killCommand.run(["-9", "3141", "207"], createSystemContext());

		expect(result.ok).toBe(true);
		expect(pidsOf(result.nextProcesses)).toEqual([1, 88]);
	});
});

describe("kill 錯誤", () => {
	it("沒有參數回 missingOperand", () => {
		expect(killCommand.run([], createSystemContext())).toEqual({ ok: false, lines: MISSING_PID });
	});

	it("只有訊號沒有 PID 回 missingOperand", () => {
		expect(killCommand.run(["-9"], createSystemContext())).toEqual({ ok: false, lines: MISSING_PID });
	});

	it.each([["abc"], ["0"], ["1.5"], ["42x"]])("PID %s 不是正整數回 invalidPid", (value) => {
		const result = killCommand.run([value], createSystemContext());

		expect(result).toEqual({ ok: false, lines: invalidPid(value) });
	});

	it("找不到的 PID 回 noSuchProcess", () => {
		const result = killCommand.run(["999"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: noSuchProcess(999) });
	});

	it.each([["-5"], ["-HUP"], ["--force"]])("不認得的訊號 %s 回 unknownOption", (signal) => {
		const result = killCommand.run([signal, "207"], createSystemContext());

		expect(result).toEqual({ ok: false, lines: unknownOption("kill", signal) });
	});
});

describe("kill 忘記 dash 的訊號", () => {
	it("kill 9 1207 提示訊號要加 dash，不把 9 當成程序編號", () => {
		const result = killCommand.run(["9", "3141"], createSystemContext());

		expect(result.ok).toBe(false);
		const text = result.lines.join("\n");
		expect(text).toContain("kill -9 3141");
		expect(text).not.toContain("沒有編號 9");
	});
});

describe("kill 選項切分的邊界", () => {
	it("單獨的 - 不是 PID，回 unknownOption", () => {
		expect(killCommand.run(["-", "207"], createSystemContext())).toEqual({
			ok: false,
			lines: unknownOption("kill", "-"),
		});
	});

	it("-- 沒有特別意義，回 unknownOption", () => {
		expect(killCommand.run(["--", "207"], createSystemContext())).toEqual({
			ok: false,
			lines: unknownOption("kill", "--"),
		});
	});

	it("訊號可以放在 PID 後面，多個訊號以最後一個為準", () => {
		const result = killCommand.run(["3141", "-9", "-TERM"], createSystemContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(processIgnoredSignal(3141, NOVA_COMMAND));
	});
});
