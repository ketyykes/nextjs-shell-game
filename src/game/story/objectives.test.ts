// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import type { ShellExecution } from "@/game/shell/types";
import {
	all,
	any,
	catFile,
	cdInto,
	commandIs,
	createObjectiveContext,
	evaluateObjective,
	lsWithFlag,
	outputContains,
} from "./objectives";
import type { ObjectiveCheck, ObjectiveContext, TerminalDefinition } from "./types";

const HOME = "/home/tech";

const fs = VirtualFileSystem.fromSnapshot({
	home: {
		tech: { "wake_up.txt": "喚醒排程", pod_06: { ".key": "鑰匙" } },
		abin: { "day_900.txt": "不要相信那個聲音。" },
	},
	deck1: {
		systems: {
			power: {
				"status.txt": "異常：斷路器 B3 跳脫",
				breakers: { B3: { ".override": "RESET-B3-7734" } },
			},
		},
	},
});

/** 手組一次執行結果；預設成功、沒有輸出、cwd 在家目錄。 */
function execution(input: string, overrides: Partial<ShellExecution> = {}): ShellExecution {
	return { input, lines: [], isError: false, clearScreen: false, cwd: HOME, ...overrides };
}

/** 從輸入組出判定用的 context。 */
function contextOf(input: string, overrides: Partial<ShellExecution> = {}): ObjectiveContext {
	return createObjectiveContext("ch1-t1", execution(input, overrides), fs, HOME);
}

describe("commandIs", () => {
	it("指令名稱相同才成立", () => {
		expect(commandIs("ls")(contextOf("ls -a"))).toBe(true);
		expect(commandIs("ls")(contextOf("cat ls"))).toBe(false);
	});

	it("command 為 null 時不成立", () => {
		expect(commandIs("ls")(contextOf(""))).toBe(false);
	});
});

describe("catFile", () => {
	const check = catFile("/home/tech/wake_up.txt");

	it("絕對路徑", () => {
		expect(check(contextOf("cat /home/tech/wake_up.txt", { cwd: "/" }))).toBe(true);
	});

	it("相對路徑以 execution.cwd 為基準", () => {
		expect(check(contextOf("cat wake_up.txt"))).toBe(true);
		expect(check(contextOf("cat ../tech/wake_up.txt"))).toBe(true);
		expect(check(contextOf("cat tech/wake_up.txt", { cwd: "/home" }))).toBe(true);
		expect(check(contextOf("cat wake_up.txt", { cwd: "/home" }))).toBe(false);
	});

	it("~ 展開成家目錄", () => {
		expect(check(contextOf("cat ~/wake_up.txt", { cwd: "/deck1/systems" }))).toBe(true);
	});

	it("多個參數中任一個符合即可", () => {
		expect(check(contextOf("cat /home/abin/day_900.txt wake_up.txt"))).toBe(true);
	});

	it("不是 cat 就不成立", () => {
		expect(check(contextOf("ls wake_up.txt"))).toBe(false);
	});
});

describe("cdInto", () => {
	const check = cdInto("/deck1/systems/power");

	it("cd 之後的 cwd 等於目標才成立", () => {
		expect(check(contextOf("cd power", { cwd: "/deck1/systems/power" }))).toBe(true);
		expect(check(contextOf("cd ..", { cwd: "/deck1/systems" }))).toBe(false);
	});

	it("cwd 對但指令不是 cd 不成立", () => {
		expect(check(contextOf("ls", { cwd: "/deck1/systems/power" }))).toBe(false);
	});
});

describe("lsWithFlag", () => {
	it("只檢查旗標", () => {
		const check = lsWithFlag("-a");
		expect(check(contextOf("ls -a"))).toBe(true);
		expect(check(contextOf("ls"))).toBe(false);
		expect(check(contextOf("ls -l"))).toBe(false);
	});

	it("支援 -la、-al 合併寫法與分開寫法", () => {
		expect(lsWithFlag("-a")(contextOf("ls -la"))).toBe(true);
		expect(lsWithFlag("-l")(contextOf("ls -la"))).toBe(true);
		expect(lsWithFlag("-a")(contextOf("ls -al"))).toBe(true);
		expect(lsWithFlag("-l")(contextOf("ls -a -l"))).toBe(true);
	});

	it("-- 之後的 -a 是路徑不是旗標", () => {
		expect(lsWithFlag("-a")(contextOf("ls -- -a"))).toBe(false);
	});

	it("指定目錄時比對路徑參數，相對路徑與 ~ 都會解析", () => {
		const check = lsWithFlag("-a", "/deck1/systems/power/breakers/B3");
		expect(check(contextOf("ls -a /deck1/systems/power/breakers/B3"))).toBe(true);
		expect(check(contextOf("ls -a breakers/B3", { cwd: "/deck1/systems/power" }))).toBe(true);
		expect(check(contextOf("ls -la B3/", { cwd: "/deck1/systems/power/breakers" }))).toBe(true);
		expect(check(contextOf("ls -a /deck1/systems/power"))).toBe(false);
		expect(lsWithFlag("-l", "/home/abin")(contextOf("ls -l ~/../abin", { cwd: "/" }))).toBe(true);
	});

	it("指定目錄但沒有路徑參數時看 execution.cwd", () => {
		const check = lsWithFlag("-a", "/deck1/systems/power/breakers/B3");
		expect(check(contextOf("ls -a", { cwd: "/deck1/systems/power/breakers/B3" }))).toBe(true);
		expect(check(contextOf("ls -a", { cwd: "/deck1/systems/power" }))).toBe(false);
	});
});

describe("outputContains", () => {
	it("任一行含字串就成立", () => {
		const check = outputContains("B3");
		expect(check(contextOf("cat status.txt", { lines: ["狀態：", "異常：斷路器 B3 跳脫"] }))).toBe(true);
		expect(check(contextOf("cat status.txt", { lines: ["正常"] }))).toBe(false);
	});
});

describe("all 與 any", () => {
	const yes: ObjectiveCheck = () => true;
	const no: ObjectiveCheck = () => false;
	const context = contextOf("ls");

	it("all 全部成立才成立，空集合為 true", () => {
		expect(all(yes, yes)(context)).toBe(true);
		expect(all(yes, no)(context)).toBe(false);
		expect(all()(context)).toBe(true);
	});

	it("any 任一成立就成立，空集合為 false", () => {
		expect(any(no, yes)(context)).toBe(true);
		expect(any(no, no)(context)).toBe(false);
		expect(any()(context)).toBe(false);
	});

	it("可以跟基本判定組合", () => {
		const check = all(commandIs("cat"), catFile("/home/abin/day_900.txt"));
		expect(check(contextOf("cat /home/abin/day_900.txt"))).toBe(true);
		expect(check(contextOf("cat ~/wake_up.txt"))).toBe(false);
	});
});

describe("evaluateObjective", () => {
	/** 只有 objective 會被讀到，其餘欄位隨便填。 */
	function terminalWith(check: ObjectiveCheck): TerminalDefinition {
		return {
			id: "ch1-t1",
			title: "測試",
			roomId: "cryo",
			teaches: [],
			fs: {},
			hints: ["提示"],
			objective: { title: "目標", check },
		};
	}

	it("執行成功時交給 check 判定", () => {
		const terminal = terminalWith(catFile("/home/tech/wake_up.txt"));
		expect(evaluateObjective(terminal, contextOf("cat wake_up.txt"))).toBe(true);
		expect(evaluateObjective(terminal, contextOf("ls"))).toBe(false);
	});

	it("isError 為 true 時直接 false，不呼叫 check", () => {
		let called = false;
		const terminal = terminalWith(() => {
			called = true;
			return true;
		});
		expect(evaluateObjective(terminal, contextOf("cat wake_up.txt", { isError: true }))).toBe(false);
		expect(called).toBe(false);
	});
});

describe("createObjectiveContext", () => {
	it("解析輸入填 command，其他欄位原樣帶入", () => {
		const exec = execution("ls -la /home");
		const context = createObjectiveContext("ch1-t4", exec, fs, HOME);
		expect(context).toEqual({
			terminalId: "ch1-t4",
			command: { name: "ls", args: ["-la", "/home"] },
			execution: exec,
			fs,
			home: HOME,
		});
		expect(context.execution).toBe(exec);
		expect(context.fs).toBe(fs);
	});

	it("空輸入、引號沒關、全形字元、管線都給 null command", () => {
		expect(contextOf("").command).toBeNull();
		expect(contextOf("   ").command).toBeNull();
		expect(contextOf('cat "wake_up.txt').command).toBeNull();
		expect(contextOf("cat　wake_up.txt").command).toBeNull();
		expect(contextOf("ls | cat").command).toBeNull();
	});
});
