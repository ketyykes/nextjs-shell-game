// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from "./commands";
import { CH1_TEST_SNAPSHOT, createTestFs, OVERRIDE_CONTENT } from "./commands/testFixtures";
import { VirtualFileSystem } from "./fs";
import {
	commandNotFound,
	emptyCommand,
	fsError,
	fullwidthChar,
	missingRedirectTarget,
	missingSpace,
	pathNotFound,
} from "./messages";
import { Shell } from "./shell";
import type { ShellSessionState } from "./shell";
import type { CommandContext, CommandDefinition, ProcessInfo, ShellOptions } from "./types";

/** 建一個站在 T1 冷凍艙控制台的 shell。 */
function createShell(overrides: Partial<ShellOptions> = {}): Shell {
	return new Shell({
		fs: createTestFs(),
		terminalId: "ch1-t1",
		hints: ["先搞清楚你在哪個目錄。", "試試 pwd。", "輸入 pwd，它會印出你目前所在的目錄。"],
		learnedCommands: ["pwd", "ls", "cat"],
		...overrides,
	});
}

describe("Shell 基本執行", () => {
	it("預設站在家目錄，提示符顯示 ~", () => {
		const shell = createShell();
		expect(shell.cwd).toBe("/home/tech");
		expect(shell.prompt()).toBe("crew@kepler9:~$");
	});

	it("空輸入不是錯誤也沒有輸出", () => {
		const shell = createShell();
		const result = shell.execute("   ");
		expect(result).toEqual({
			input: "   ",
			lines: [],
			isError: false,
			clearScreen: false,
			cwd: "/home/tech",
			env: { HOME: "/home/tech", USER: "tech", PWD: "/home/tech" },
			processes: [],
		});
	});

	it("找不到指令回傳 commandNotFound 並標記為錯誤", () => {
		const shell = createShell();
		const result = shell.execute("xyz");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(commandNotFound("xyz"));
	});

	it("忘記空格時建議正確寫法", () => {
		const shell = createShell();
		const result = shell.execute("catwake_up.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(missingSpace("cat", "wake_up.txt"));
	});

	it("全形空白回傳專屬錯誤", () => {
		const shell = createShell();
		const result = shell.execute("cd　pod_06");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(fullwidthChar("　"));
	});

	it("管線語法錯誤回傳 emptyCommand", () => {
		const shell = createShell();
		const result = shell.execute("ls |");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(emptyCommand("|"));
	});

	it("重導向沒有檔名回傳 missingRedirectTarget", () => {
		const shell = createShell();
		const result = shell.execute("ls >>");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(missingRedirectTarget(">>"));
	});

	it("路徑不存在時 isError 為 true", () => {
		const shell = createShell();
		const result = shell.execute("cat nope.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("nope.txt"));
	});
});

describe("Shell 狀態", () => {
	it("cd 會更新 cwd 與提示符", () => {
		const shell = createShell();
		shell.execute("cd pod_06");
		expect(shell.cwd).toBe("/home/tech/pod_06");
		expect(shell.prompt()).toBe("crew@kepler9:~/pod_06$");
		shell.execute("cd /deck1");
		expect(shell.prompt()).toBe("crew@kepler9:/deck1$");
	});

	it("cd 失敗時 cwd 不變", () => {
		const shell = createShell();
		shell.execute("cd wake_up.txt");
		expect(shell.cwd).toBe("/home/tech");
	});

	it("成功與失敗的輸入都記進歷史，history 指令列得出來", () => {
		const shell = createShell();
		shell.execute("pwd");
		shell.execute("xyz");
		expect(shell.historyEntries).toEqual(["pwd", "xyz"]);
		const result = shell.execute("history");
		expect(result.lines).toEqual(["   1  pwd", "   2  xyz"]);
	});

	it("history 指令看到的歷史不含自己這一筆", () => {
		const shell = createShell();
		const result = shell.execute("history");
		expect(result.lines.some((line) => line.includes("history"))).toBe(false);
	});

	it("上下鍵可以叫回歷史", () => {
		const shell = createShell();
		shell.execute("pwd");
		shell.execute("ls");
		expect(shell.historyUp()).toBe("ls");
		expect(shell.historyUp()).toBe("pwd");
		expect(shell.historyDown()).toBe("ls");
		expect(shell.historyDown()).toBe("");
	});

	it("hint 每次加深一段並累計次數", () => {
		const shell = createShell();
		expect(shell.execute("hint").lines[0]).toContain("先搞清楚你在哪個目錄");
		expect(shell.execute("hint").lines[0]).toContain("試試 pwd");
		expect(shell.execute("hint").lines[0]).toContain("輸入 pwd");
		expect(shell.hintCount).toBe(3);
		const fourth = shell.execute("hint");
		expect(fourth.isError).toBe(false);
		expect(fourth.lines.length).toBeGreaterThan(1);
	});

	it("clear 會要求 UI 清畫面", () => {
		const shell = createShell();
		expect(shell.execute("clear").clearScreen).toBe(true);
	});

	it("help 只列已學指令，learn 之後才出現", () => {
		const shell = createShell({ learnedCommands: ["pwd"] });
		expect(shell.execute("help").lines.some((line) => line.startsWith("ls"))).toBe(false);
		shell.learn("ls");
		shell.learn("ls");
		expect(shell.learnedCommands).toEqual(["pwd", "ls"]);
		expect(shell.execute("help").lines.some((line) => line.startsWith("ls"))).toBe(true);
	});

	it("建構時傳入重複的指令名只留第一份，順序照學會的先後", () => {
		// UI 會把「ls、ls -l、ls -a」這類完整字串轉成指令名再傳進來，轉完會重複
		const shell = createShell({ learnedCommands: ["pwd", "ls", "cd", "ls", "cd", "ls"] });
		expect(shell.learnedCommands).toEqual(["pwd", "ls", "cd"]);
	});

	it("Tab 補全會用目前的 cwd", () => {
		const shell = createShell();
		expect(shell.complete("cat wa").completed).toBe("cat wake_up.txt ");
		shell.execute("cd /deck1/systems/power");
		expect(shell.complete("cat st").completed).toBe("cat status.txt ");
	});

	it("toState 與 fromState 可以還原 cwd、歷史、hint 計數與檔案系統", () => {
		const shell = createShell();
		shell.execute("cd pod_06");
		shell.execute("hint");
		shell.learn("cd");
		const state = shell.toState();
		expect(state).toMatchObject({
			terminalId: "ch1-t1",
			cwd: "/home/tech/pod_06",
			history: ["cd pod_06", "hint"],
			hintCount: 1,
			learnedCommands: ["pwd", "ls", "cat", "cd"],
		});

		const restored = Shell.fromState(state, VirtualFileSystem.fromSerialized(state.fs), ["a", "b", "c"]);
		expect(restored.cwd).toBe("/home/tech/pod_06");
		expect(restored.hintCount).toBe(1);
		expect(restored.historyUp()).toBe("hint");
		expect(restored.execute("cat ../wake_up.txt").isError).toBe(false);
	});

	it("toState 與 fromState 可以還原環境變數與程序清單", () => {
		const shell = createShellWith([setvarCommand, killallCommand], { processes: [NOVA_PROCESS, SHELL_PROCESS] });
		shell.execute("setvar NOVA_DIR /opt/nova");
		shell.execute("cd /deck1");
		const state = shell.toState();
		expect(state.env).toEqual({ HOME: "/home/tech", USER: "tech", PWD: "/deck1", NOVA_DIR: "/opt/nova" });
		expect(state.processes).toEqual([NOVA_PROCESS, SHELL_PROCESS]);

		const restored = Shell.fromState(state, VirtualFileSystem.fromSerialized(state.fs), []);
		expect(restored.env).toEqual({ HOME: "/home/tech", USER: "tech", PWD: "/deck1", NOVA_DIR: "/opt/nova" });
		expect(restored.processes).toEqual([NOVA_PROCESS, SHELL_PROCESS]);
	});

	it("舊存檔沒有 env 與 processes 時用預設值還原", () => {
		const shell = createShell();
		shell.execute("cd pod_06");
		const oldState: ShellSessionState = { ...shell.toState() };
		delete oldState.env;
		delete oldState.processes;
		const restored = Shell.fromState(oldState, VirtualFileSystem.fromSerialized(oldState.fs), []);
		expect(restored.env).toEqual({ HOME: "/home/tech", USER: "tech", PWD: "/home/tech/pod_06" });
		expect(restored.processes).toEqual([]);
	});
});

describe("第一章正解序列", () => {
	it("T1：ls 看到六個冷凍艙與 wake_up.txt，cat 讀出喚醒排程", () => {
		const shell = createShell();
		const listing = shell.execute("ls");
		expect(listing.isError).toBe(false);
		expect(listing.lines).toEqual([
			"pod_01/",
			"pod_02/",
			"pod_03/",
			"pod_04/",
			"pod_05/",
			"pod_06/",
			"wake_up.txt",
		]);

		const content = shell.execute("cat wake_up.txt");
		expect(content.isError).toBe(false);
		expect(content.lines).toEqual(["喚醒排程：三年後", "原始設定：永不", "修改者："]);
	});

	it("T2：用相對路徑一層一層走進去讀 status.txt", () => {
		const shell = createShell({ cwd: "/deck1/systems" });
		expect(shell.execute("ls").lines).toEqual(["power/"]);
		expect(shell.execute("cd power").isError).toBe(false);
		expect(shell.execute("cat status.txt").lines).toEqual(["B3 斷路器：跳脫"]);
		expect(shell.execute("cd ..").isError).toBe(false);
		expect(shell.cwd).toBe("/deck1/systems");
	});

	it("T3：cd ~ 回家，ls /home 看到 abin，ls -l 讀出日誌日期", () => {
		const shell = createShell({ cwd: "/deck1" });
		shell.execute("cd ~");
		expect(shell.cwd).toBe("/home/tech");
		expect(shell.execute("ls /home").lines).toEqual(["abin/", "tech/"]);

		const detail = shell.execute("ls -l /home/abin");
		expect(detail.isError).toBe(false);
		expect(detail.lines[0]).toBe("total 3");
		expect(detail.lines[3]).toMatch(/^-rw-r--r--\s+abin\s+\d+\s+2031-03-10 03:07\s+day_900\.txt$/);
	});

	it("T4：絕對路徑走到 B3，ls 看不到 .override，ls -a 才看得到，cat 讀出重置碼", () => {
		const shell = createShell();
		expect(shell.execute("cd /deck1/systems/power/breakers/B3").isError).toBe(false);
		expect(shell.execute("ls").lines).toEqual([]);
		expect(shell.execute("ls -a").lines).toEqual(["./", "../", ".override"]);
		expect(shell.execute("cat .override").lines).toEqual([OVERRIDE_CONTENT.trimEnd()]);
	});

	it("T6：門鎖檔給的絕對路徑可以直接 cat", () => {
		const fs = VirtualFileSystem.fromSnapshot({
			...CH1_TEST_SNAPSHOT,
			deck1: {
				airlock: {
					"lock.txt": "鑰匙檔在 /home/tech/pod_06/key.txt\n",
				},
			},
			home: {
				tech: {
					pod_06: { "key.txt": "KEY-9F3A\n" },
				},
			},
		});
		const shell = createShell({ fs, cwd: "/deck1/airlock" });
		expect(shell.execute("cat lock.txt").lines).toEqual(["鑰匙檔在 /home/tech/pod_06/key.txt"]);
		expect(shell.execute("cat /home/tech/pod_06/key.txt").lines).toEqual(["KEY-9F3A"]);
	});
});

/** 第六章測試用的程序。 */
const NOVA_PROCESS: ProcessInfo = {
	pid: 1,
	user: "nova",
	cpu: 12.5,
	mem: 30,
	started: "2028-06-01T00:00:00Z",
	command: "/opt/nova/nova --core",
	ignoresTerm: true,
};

const SHELL_PROCESS: ProcessInfo = {
	pid: 42,
	user: "tech",
	cpu: 0.1,
	mem: 0.5,
	started: "2031-03-12T08:15:00Z",
	command: "-bash",
};

/** 記錄每次被呼叫時拿到的參數與 context 的假指令，用來檢查 shell 傳了什麼進去。 */
function createProbe(): { command: CommandDefinition; calls: { args: string[]; context: CommandContext }[] } {
	const calls: { args: string[]; context: CommandContext }[] = [];
	const command: CommandDefinition = {
		name: "probe",
		run(args, context) {
			calls.push({ args, context });
			return { ok: true, lines: ["probed"] };
		},
	};
	return { command, calls };
}

/** 假的 `export`：`setvar 名稱 值` 用 nextEnv 回傳整份新環境變數。 */
const setvarCommand: CommandDefinition = {
	name: "setvar",
	run(args, context) {
		return { ok: true, lines: [], nextEnv: { ...context.env, [args[0]]: args[1] } };
	},
};

/** 假的 `kill`：把所有程序清掉。 */
const killallCommand: CommandDefinition = {
	name: "killall",
	run() {
		return { ok: true, lines: [], nextProcesses: [] };
	},
};

/** 一定失敗的假指令。 */
const failCommand: CommandDefinition = {
	name: "fail",
	run() {
		return { ok: false, lines: ["boom"] };
	},
};

/** 建一個多掛了假指令的 shell。 */
function createShellWith(extra: CommandDefinition[], overrides: Partial<ShellOptions> = {}): Shell {
	return new Shell(
		{
			fs: createTestFs(),
			terminalId: "ch4-t1",
			hints: [],
			learnedCommands: [],
			...overrides,
		},
		[...ALL_COMMANDS, ...extra],
	);
}

const LISTING = ["pod_01/", "pod_02/", "pod_03/", "pod_04/", "pod_05/", "pod_06/", "wake_up.txt"];

describe("Shell 管線", () => {
	it("ls | cat 把 ls 的輸出原樣印出", () => {
		const shell = createShell();
		const result = shell.execute("ls | cat");
		expect(result.isError).toBe(false);
		expect(result.lines).toEqual(LISTING);
	});

	it("cat 檔案 | cat 得到檔案內容", () => {
		const shell = createShell();
		expect(shell.execute("cat wake_up.txt | cat").lines).toEqual(["喚醒排程：三年後", "原始設定：永不", "修改者："]);
	});

	it("第一個指令的 stdin 是 null，之後的 stdin 是前一個的輸出", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command]);
		shell.execute("probe");
		expect(probe.calls[0].context.stdin).toBeNull();

		shell.execute("ls /home | probe");
		expect(probe.calls[1].context.stdin).toEqual(["abin/", "tech/"]);
	});

	it("管線中間失敗就停止，回傳那個指令的錯誤", () => {
		const shell = createShell();
		const result = shell.execute("cat nope.txt | cat");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("nope.txt"));
	});

	it("失敗之後的指令不會被執行", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command, failCommand]);
		const result = shell.execute("fail | probe");
		expect(result).toMatchObject({ isError: true, lines: ["boom"] });
		expect(probe.calls).toHaveLength(0);
	});

	it("管線裡任何一個指令不存在都回報找不到指令", () => {
		const shell = createShell();
		expect(shell.execute("xyz | cat").lines).toEqual(commandNotFound("xyz"));
		const result = shell.execute("ls | xyz");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(commandNotFound("xyz"));
	});

	it("管線裡的指令看到的歷史都不含目前這一筆", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command]);
		shell.execute("pwd");
		shell.execute("ls | probe");
		expect(probe.calls[0].context.history).toEqual(["pwd"]);
	});

	it("管線裡每個指令的副作用都會套用", () => {
		const shell = createShellWith([killallCommand], { processes: [NOVA_PROCESS] });
		const result = shell.execute("cd /deck1 | killall");
		expect(result.isError).toBe(false);
		expect(shell.cwd).toBe("/deck1");
		expect(shell.processes).toEqual([]);
	});
});

describe("Shell 重導向", () => {
	it("ls > list.txt 不印輸出，之後 cat 讀得到", () => {
		const shell = createShell();
		const result = shell.execute("ls > list.txt");
		expect(result).toMatchObject({ isError: false, lines: [] });
		expect(shell.execute("cat list.txt").lines).toEqual(LISTING);
	});

	it("寫入的內容每行結尾都有換行", () => {
		const shell = createShell();
		shell.execute("pwd > where.txt");
		expect(shell.fs.readFile("/home/tech", "where.txt")).toBe("/home/tech\n");
		expect(shell.execute("cat where.txt").lines).toEqual(["/home/tech"]);
	});

	it("> 會覆寫既有檔案", () => {
		const shell = createShell();
		shell.execute("pwd > where.txt");
		shell.execute("pwd > where.txt");
		expect(shell.execute("cat where.txt").lines).toEqual(["/home/tech"]);
	});

	it(">> 會追加在檔案結尾", () => {
		const shell = createShell();
		shell.execute("pwd >> where.txt");
		shell.execute("cd /deck1");
		const result = shell.execute("pwd >> /home/tech/where.txt");
		expect(result).toMatchObject({ isError: false, lines: [] });
		expect(shell.execute("cat ~/where.txt").lines).toEqual(["/home/tech", "/deck1"]);
	});

	it("沒有輸出時寫入空字串", () => {
		const shell = createShell();
		shell.execute("ls pod_01 > empty.txt");
		expect(shell.fs.readFile("/home/tech", "empty.txt")).toBe("");
	});

	it("管線結尾的重導向寫入最後一個指令的輸出", () => {
		const shell = createShell();
		shell.execute("cat wake_up.txt | cat > copy.txt");
		expect(shell.fs.readFile("/home/tech", "copy.txt")).toBe("喚醒排程：三年後\n原始設定：永不\n修改者：\n");
	});

	it("指令失敗時不寫檔，印出錯誤", () => {
		const shell = createShell();
		const result = shell.execute("cat nope.txt > out.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("nope.txt"));
		expect(shell.fs.exists("/home/tech", "out.txt")).toBe(false);
	});

	it("目標的父目錄不存在時回報路徑錯誤", () => {
		const shell = createShell();
		const result = shell.execute("ls > nodir/list.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("nodir/list.txt"));
	});

	it("目標是目錄時回報 EISDIR", () => {
		const shell = createShell();
		const result = shell.execute("ls > pod_01");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(fsError("EISDIR", "pod_01"));
	});
});

describe("Shell 環境變數", () => {
	it("預設有 HOME、USER、PWD", () => {
		const shell = createShell({ cwd: "/deck1" });
		expect(shell.env).toEqual({ HOME: "/home/tech", USER: "tech", PWD: "/deck1" });
	});

	it("options.env 可以覆蓋與追加", () => {
		const shell = createShell({ env: { USER: "abin", NOVA_DIR: "/opt/nova" } });
		expect(shell.env).toEqual({ HOME: "/home/tech", USER: "abin", PWD: "/home/tech", NOVA_DIR: "/opt/nova" });
	});

	it("cd $HOME 回到家目錄", () => {
		const shell = createShell({ cwd: "/deck1" });
		expect(shell.execute("cd $HOME").isError).toBe(false);
		expect(shell.cwd).toBe("/home/tech");
	});

	it("cat $HOME/wake_up.txt 讀得到檔案", () => {
		const shell = createShell({ cwd: "/deck1" });
		expect(shell.execute("cat $HOME/wake_up.txt").lines).toEqual(["喚醒排程：三年後", "原始設定：永不", "修改者："]);
	});

	it("單引號內的 $HOME 不展開", () => {
		const shell = createShell();
		expect(shell.execute("cat '$HOME/wake_up.txt'").lines).toEqual(pathNotFound("$HOME/wake_up.txt"));
	});

	it("PWD 跟著 cd 變，執行結果也帶 env", () => {
		const shell = createShell();
		const result = shell.execute("cd /deck1/systems");
		expect(result.env.PWD).toBe("/deck1/systems");
		expect(shell.env.PWD).toBe("/deck1/systems");
	});

	it("指令回傳 nextEnv 會取代環境變數，之後的展開用新值", () => {
		const shell = createShellWith([setvarCommand]);
		const result = shell.execute("setvar LOG /home/abin/day_900.txt");
		expect(result.env.LOG).toBe("/home/abin/day_900.txt");
		expect(shell.execute("cat $LOG").lines).toEqual(["不要相信那個聲音。"]);
	});

	it("指令拿到的 env 是目前的環境變數", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command], { env: { NOVA_DIR: "/opt/nova" } });
		shell.execute("probe");
		expect(probe.calls[0].context.env).toEqual({
			HOME: "/home/tech",
			USER: "tech",
			PWD: "/home/tech",
			NOVA_DIR: "/opt/nova",
		});
	});

	it("env getter 與執行結果都是拷貝，改了不影響 shell", () => {
		const shell = createShell();
		shell.env.HOME = "/tmp";
		shell.execute("pwd").env.HOME = "/tmp";
		expect(shell.env.HOME).toBe("/home/tech");
	});
});

describe("Shell 程序清單", () => {
	it("預設是空陣列", () => {
		expect(createShell().processes).toEqual([]);
	});

	it("建構時複製一份，外部改原陣列不影響 shell", () => {
		const initial = [NOVA_PROCESS, SHELL_PROCESS];
		const shell = createShell({ processes: initial });
		initial.pop();
		shell.processes.pop();
		expect(shell.processes).toEqual([NOVA_PROCESS, SHELL_PROCESS]);
	});

	it("指令拿到目前的程序清單，nextProcesses 會取代它", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command, killallCommand], { processes: [NOVA_PROCESS] });
		shell.execute("probe");
		expect(probe.calls[0].context.processes).toEqual([NOVA_PROCESS]);

		const result = shell.execute("killall");
		expect(result.processes).toEqual([]);
		expect(shell.processes).toEqual([]);
	});
});

describe("Shell 萬用字元", () => {
	/** 第四章通訊艙風格的目錄，萬用字元測試用。 */
	function createCommsShell(extra: CommandDefinition[] = []): Shell {
		const fs = VirtualFileSystem.fromSnapshot({
			...CH1_TEST_SNAPSHOT,
			comms: {
				"signal_a.log": "A\n",
				"signal_b.log": "B\n",
				"notes.txt": "N\n",
				".hidden.log": "H\n",
			},
		});
		return createShellWith(extra, { fs, cwd: "/comms" });
	}

	it("cat *.log 展開成相符的檔案，依名稱排序，不含隱藏檔", () => {
		const shell = createCommsShell();
		const result = shell.execute("cat *.log");
		expect(result.isError).toBe(false);
		expect(result.lines).toEqual(["A", "B"]);
	});

	it("? 配一個字元", () => {
		const shell = createCommsShell();
		expect(shell.execute("cat signal_?.log").lines).toEqual(["A", "B"]);
	});

	it("帶路徑的 pattern 保留路徑前綴", () => {
		const probe = createProbe();
		const shell = createCommsShell([probe.command]);
		shell.execute("cd ~");
		shell.execute("probe /comms/*.log");
		expect(probe.calls[0].args).toEqual(["/comms/signal_a.log", "/comms/signal_b.log"]);
	});

	it("被引號包住的參數不展開", () => {
		const shell = createCommsShell();
		const result = shell.execute("cat '*.log'");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("*.log"));
	});

	it("沒有相符時保留原字串，cat 回報找不到", () => {
		const shell = createCommsShell();
		const result = shell.execute("cat *.xyz");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("*.xyz"));
	});

	it("指令名不展開", () => {
		const shell = createCommsShell();
		const result = shell.execute("ca* notes.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(commandNotFound("ca*"));
	});

	it("管線右邊的參數也會展開", () => {
		const probe = createProbe();
		const shell = createCommsShell([probe.command]);
		shell.execute("ls | probe *.txt");
		expect(probe.calls[0].args).toEqual(["notes.txt"]);
	});
});
