// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import type { ShellExecution } from "@/game/shell/types";
import {
	all,
	any,
	anyCommandIs,
	catFile,
	cdInto,
	commandIs,
	commandTouches,
	commandHasOption,
	createObjectiveContext,
	envEquals,
	evaluateObjective,
	fileAbsent,
	fileContains,
	fileExists,
	lsWithFlag,
	noProcessMatching,
	outputContains,
	redirectsTo,
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
	return { input, lines: [], isError: false, clearScreen: false, cwd: HOME, env: {}, processes: [], hintUsed: false, ...overrides };
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

	describe("一行用 ; 或 && 串了好幾段（有 segments）時逐段判定", () => {
		/** 用好幾段組出整行的執行結果：整行的輸出是各段接起來，狀態是最後一段的。 */
		function lineOf(segments: ShellExecution[]): ObjectiveContext {
			const last = segments[segments.length - 1];
			const whole = execution(segments.map((segment) => segment.input).join(" ; "), {
				lines: segments.flatMap((segment) => segment.lines),
				cwd: last.cwd,
				env: last.env,
				processes: last.processes,
				segments,
			});
			return createObjectiveContext("ch1-t1", whole, fs, HOME);
		}

		it("任一段成立就過關", () => {
			const terminal = terminalWith(catFile("/home/tech/wake_up.txt"));
			const context = lineOf([execution("cd /home/tech"), execution("cat wake_up.txt")]);
			expect(evaluateObjective(terminal, context)).toBe(true);
		});

		it("每一段用自己執行完的 cwd 解析相對路徑，後面換了目錄不影響", () => {
			const terminal = terminalWith(catFile("/home/tech/wake_up.txt"));
			const context = lineOf([execution("cat wake_up.txt"), execution("cd /deck1", { cwd: "/deck1" })]);
			expect(evaluateObjective(terminal, context)).toBe(true);
		});

		it("輸出只看同一段的，別段的輸出不會湊成過關", () => {
			const terminal = terminalWith(all(commandIs("cat"), outputContains("RESET-B3-7734")));
			const context = lineOf([
				execution("cat wake_up.txt", { lines: ["喚醒排程"] }),
				execution("echo RESET-B3-7734", { lines: ["RESET-B3-7734"] }),
			]);
			expect(evaluateObjective(terminal, context)).toBe(false);
		});

		it("變數用那一段執行完的 env 展開", () => {
			const terminal = terminalWith(catFile("/home/tech/wake_up.txt"));
			const context = lineOf([
				execution("export F=wake_up.txt", { env: { F: "wake_up.txt" } }),
				execution("cat $F", { env: { F: "wake_up.txt" } }),
			]);
			expect(evaluateObjective(terminal, context)).toBe(true);
		});

		it("整行有一段失敗（isError）就不判定", () => {
			const terminal = terminalWith(catFile("/home/tech/wake_up.txt"));
			const segments = [execution("cat nope.txt", { isError: true }), execution("cat wake_up.txt")];
			const whole = execution("cat nope.txt ; cat wake_up.txt", { isError: true, segments });
			expect(evaluateObjective(terminal, createObjectiveContext("ch1-t1", whole, fs, HOME))).toBe(false);
		});
	});
});

describe("createObjectiveContext", () => {
	it("解析輸入填 command，其他欄位原樣帶入", () => {
		const exec = execution("ls -la /home");
		const context = createObjectiveContext("ch1-t4", exec, fs, HOME);
		expect(context).toEqual({
			terminalId: "ch1-t4",
			command: { name: "ls", args: ["-la", "/home"] },
			pipeline: { commands: [{ name: "ls", args: ["-la", "/home"] }], redirect: null },
			execution: exec,
			fs,
			home: HOME,
		});
		expect(context.execution).toBe(exec);
		expect(context.fs).toBe(fs);
	});

	it("空輸入、引號沒關、全形字元都給 null command 與 null pipeline", () => {
		expect(contextOf("").command).toBeNull();
		expect(contextOf("").pipeline).toBeNull();
		expect(contextOf("   ").command).toBeNull();
		expect(contextOf('cat "wake_up.txt').command).toBeNull();
		expect(contextOf("cat　wake_up.txt").command).toBeNull();
	});

	it("管線的 command 是第一個指令", () => {
		expect(contextOf("ls | cat").command).toEqual({ name: "ls", args: [] });
	});

	it("開頭的 ~ 跟 shell 一樣展開成家目錄，參數就是實際執行的樣子", () => {
		expect(contextOf("cat ~/wake_up.txt ~abin").command).toEqual({
			name: "cat",
			args: ["/home/tech/wake_up.txt", "~abin"],
		});
	});
});

describe("管線與重導向", () => {
	it("createObjectiveContext 帶完整管線，command 是第一個指令", () => {
		const context = contextOf("cat a.log | grep ERROR | wc -l");
		expect(context.command?.name).toBe("cat");
		expect(context.pipeline?.commands.map((command) => command.name)).toEqual(["cat", "grep", "wc"]);
		expect(context.pipeline?.redirect).toBeNull();
	});

	it("anyCommandIs 看整條管線", () => {
		expect(anyCommandIs("grep")(contextOf("cat a.log | grep ERROR"))).toBe(true);
		expect(anyCommandIs("sort")(contextOf("cat a.log | grep ERROR"))).toBe(false);
		expect(anyCommandIs("cat")(contextOf(""))).toBe(false);
	});

	it("commandTouches 任一同名指令的參數解析後等於目標", () => {
		const check = commandTouches("grep", "/home/abin/day_900.txt");
		expect(check(contextOf("cat x | grep 聲音 ../abin/day_900.txt"))).toBe(true);
		expect(check(contextOf("grep 聲音 wake_up.txt"))).toBe(false);
	});

	it("commandHasOption 支援合併旗標", () => {
		expect(commandHasOption("grep", "-r")(contextOf("grep -rn ERROR logs"))).toBe(true);
		expect(commandHasOption("grep", "-r")(contextOf("grep -n ERROR logs"))).toBe(false);
		expect(commandHasOption("rm", "-r")(contextOf("rm -rf old"))).toBe(true);
	});

	it("commandHasOption 不把 -- 之後的參數與長選項算成短選項", () => {
		expect(commandHasOption("grep", "-r")(contextOf("grep -- -r logs"))).toBe(false);
		expect(commandHasOption("grep", "-r")(contextOf("grep --recursive ERROR logs"))).toBe(false);
	});

	it("commandTouches 跳過選項，-- 之後以 - 開頭的也算路徑", () => {
		expect(commandTouches("cat", "/home/tech/-notes")(contextOf("cat -- -notes"))).toBe(true);
		expect(commandTouches("cat", "/home/tech/-notes")(contextOf("cat -notes"))).toBe(false);
	});

	it("redirectsTo 比對重導向目標與種類", () => {
		expect(redirectsTo("/home/tech/out.txt")(contextOf("sort parts > out.txt"))).toBe(true);
		expect(redirectsTo("/home/tech/out.txt", "append")(contextOf("sort parts > out.txt"))).toBe(false);
		expect(redirectsTo("/home/tech/out.txt", "append")(contextOf("echo hi >> out.txt"))).toBe(true);
		expect(redirectsTo("/home/tech/out.txt")(contextOf("sort parts"))).toBe(false);
	});
});

describe("檔案系統與環境狀態", () => {
	it("fileExists、fileAbsent 看執行後的檔案系統", () => {
		expect(fileExists("/home/tech/wake_up.txt")(contextOf("ls"))).toBe(true);
		expect(fileExists("/home/tech/nope")(contextOf("ls"))).toBe(false);
		expect(fileAbsent("/home/tech/nope")(contextOf("ls"))).toBe(true);
		expect(fileAbsent("/home/tech/wake_up.txt")(contextOf("ls"))).toBe(false);
	});

	it("fileContains 讀檔案內容", () => {
		expect(fileContains("/home/abin/day_900.txt", "不要相信")(contextOf("ls"))).toBe(true);
		expect(fileContains("/home/abin/day_900.txt", "相信我")(contextOf("ls"))).toBe(false);
		expect(fileContains("/home/abin/missing.txt", "x")(contextOf("ls"))).toBe(false);
	});

	it("envEquals 看執行後的環境變數", () => {
		expect(envEquals("NOVA_DIR", "/opt/nova")(contextOf("export NOVA_DIR=/opt/nova", { env: { NOVA_DIR: "/opt/nova" } }))).toBe(true);
		expect(envEquals("NOVA_DIR", "/opt/nova")(contextOf("export NOVA_DIR=/tmp", { env: { NOVA_DIR: "/tmp" } }))).toBe(false);
		expect(envEquals("NOVA_DIR", "/opt/nova")(contextOf("ls"))).toBe(false);
	});

	it("noProcessMatching 看執行後的程序清單", () => {
		const nova = { pid: 1, user: "nova", cpu: 1, mem: 1, started: "2028-06-02T04:40:00Z", command: "/opt/nova/nova --core" };
		expect(noProcessMatching("nova --core")(contextOf("kill -9 1", { processes: [] }))).toBe(true);
		expect(noProcessMatching("nova --core")(contextOf("kill 1", { processes: [nova] }))).toBe(false);
	});
});
