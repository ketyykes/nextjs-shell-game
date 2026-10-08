// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from "./commands";
import { CH1_TEST_SNAPSHOT, createTestFs, OVERRIDE_CONTENT } from "./commands/testFixtures";
import { VirtualFileSystem } from "./fs";
import {
	commandNotFound,
	emptyCommand,
	emptyListCommand,
	fsError,
	fullwidthChar,
	missingRedirectTarget,
	missingSpace,
	pathNotFound,
	unsupportedSyntax,
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
			hintUsed: false,
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

	it("執行結果的 hintUsed 標出這一行有沒有跑到 hint，卡關偵測用它重算閒置時間", () => {
		const shell = createShell();
		expect(shell.execute("hint").hintUsed).toBe(true);
		expect(shell.execute("pwd").hintUsed).toBe(false);
		expect(shell.execute("hint | tail -n 1").hintUsed).toBe(true);
		expect(shell.execute("xyz").hintUsed).toBe(false);
		// ; 與 && 串接時任一段跑到 hint 就算
		expect(shell.execute("hint ; pwd").hintUsed).toBe(true);
		expect(shell.execute("pwd && hint").hintUsed).toBe(true);
		expect(shell.execute("pwd ; ls").hintUsed).toBe(false);
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
	it("ls > list.txt 不印輸出，之後 cat 讀得到；目標檔先建立，所以清單裡有它自己（跟 bash 一樣）", () => {
		const shell = createShell();
		const result = shell.execute("ls > list.txt");
		expect(result).toMatchObject({ isError: false, lines: [] });
		expect(shell.execute("cat list.txt").lines).toEqual(["list.txt", ...LISTING]);
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

	it("指令失敗時照 bash 先建立空的目標檔，印出指令的錯誤", () => {
		const shell = createShell();
		const result = shell.execute("cat nope.txt > out.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("nope.txt"));
		expect(shell.fs.readFile("/home/tech", "out.txt")).toBe("");
	});

	it("> 在指令執行前就清空既有檔案，指令失敗時留下空檔", () => {
		const shell = createShell();
		shell.execute("pwd > where.txt");
		const result = shell.execute("cat nope.txt > where.txt");
		expect(result.isError).toBe(true);
		expect(shell.fs.readFile("/home/tech", "where.txt")).toBe("");
	});

	it("> 先清空再執行，所以讀同一個檔案會讀到空的（跟 bash 一樣）", () => {
		const shell = createShell();
		shell.execute("pwd > where.txt");
		const result = shell.execute("cat where.txt > where.txt");
		expect(result).toMatchObject({ isError: false, lines: [] });
		expect(shell.fs.readFile("/home/tech", "where.txt")).toBe("");
	});

	it(">> 目標不存在時先建空檔，指令失敗也留下空檔", () => {
		const shell = createShell();
		const result = shell.execute("cat nope.txt >> log.txt");
		expect(result.isError).toBe(true);
		expect(shell.fs.readFile("/home/tech", "log.txt")).toBe("");
	});

	it(">> 目標已存在時指令失敗不動原本的內容", () => {
		const shell = createShell();
		shell.execute("pwd > where.txt");
		shell.execute("cat nope.txt >> where.txt");
		expect(shell.fs.readFile("/home/tech", "where.txt")).toBe("/home/tech\n");
	});

	it("管線中間失敗時目標檔也已經建立，整行只算一次錯誤", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command, failCommand]);
		const result = shell.execute("fail | probe > out.txt");
		expect(result).toMatchObject({ isError: true, lines: ["boom"] });
		expect(probe.calls).toHaveLength(0);
		expect(shell.fs.readFile("/home/tech", "out.txt")).toBe("");
	});

	it("目標路徑不合法時指令不會執行，只回報目標的錯誤", () => {
		const shell = createShell();
		const result = shell.execute("cd /deck1 > nodir/out.txt");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(pathNotFound("nodir/out.txt"));
		expect(shell.cwd).toBe("/home/tech");
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

	it("路徑中間的萬用字元也會展開", () => {
		const probe = createProbe();
		const shell = createCommsShell([probe.command]);
		shell.execute("cd /");
		shell.execute("probe c*/signal_?.log");
		expect(probe.calls[0].args).toEqual(["comms/signal_a.log", "comms/signal_b.log"]);
	});

	it("重導向新建的目標檔不會被同一行的萬用字元配到（bash 先展開再開檔）", () => {
		const probe = createProbe();
		const shell = createCommsShell([probe.command]);
		const result = shell.execute("probe *.log > all.log");
		expect(result.isError).toBe(false);
		expect(probe.calls[0].args).toEqual(["signal_a.log", "signal_b.log"]);
		expect(shell.fs.exists("/comms", "all.log")).toBe(true);
	});

	it("目標檔原本就存在時照樣會被萬用字元配到", () => {
		const probe = createProbe();
		const shell = createCommsShell([probe.command]);
		shell.execute("probe *.txt > notes.txt");
		expect(probe.calls[0].args).toEqual(["notes.txt"]);
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

describe("Shell ~ 展開（M13-2）", () => {
	it("echo ~ 印出家目錄（審計 G2 的例子）", () => {
		const shell = createShell();
		expect(shell.execute("echo ~ ~/pod_06").lines).toEqual(["/home/tech /home/tech/pod_06"]);
	});

	it("用的是這個 session 的家目錄", () => {
		const shell = createShell({ home: "/home/abin", cwd: "/" });
		expect(shell.execute("echo ~").lines).toEqual(["/home/abin"]);
	});

	it("cd ~、cd ~/xxx 跟以前一樣走回家目錄", () => {
		const shell = createShell({ cwd: "/deck1" });
		expect(shell.execute("cd ~ ; pwd").lines).toEqual(["/home/tech"]);
		shell.execute("cd /deck1");
		expect(shell.execute("cd ~/pod_06 && pwd").lines).toEqual(["/home/tech/pod_06"]);
	});

	it("~/ 後面的萬用字元照樣展開", () => {
		const shell = createShell({ cwd: "/deck1" });
		expect(shell.execute("echo ~/*.txt").lines).toEqual(["/home/tech/wake_up.txt"]);
	});

	it("錯誤訊息裡是展開後的路徑（跟 bash 一樣）", () => {
		const shell = createShell();
		expect(shell.execute("cat ~/nope.txt").lines).toEqual(pathNotFound("/home/tech/nope.txt"));
	});

	it("~user 不支援，原樣當成名字，找不到時照常回報", () => {
		const shell = createShell();
		expect(shell.execute("echo ~abin").lines).toEqual(["~abin"]);
		expect(shell.execute("cd ~abin").lines).toEqual(pathNotFound("~abin"));
	});

	it("引號包住的 ~ 不展開", () => {
		const shell = createShell();
		expect(shell.execute(`echo "~" '~/x'`).lines).toEqual(["~ ~/x"]);
	});
});

describe("Shell 不支援的語法（M13-1）", () => {
	it.each([
		["echo hi || echo no", "||"],
		["sleep 5 &", "&"],
		["cat < wake_up.txt", "<"],
		["ls 2>&1", "2>&1"],
		["cat nope.txt 2> err.txt", "2>"],
		["echo $(pwd)", "$("],
		["echo `pwd`", "`"],
	])("%s 回報不支援 %s，算一次錯誤", (input, detail) => {
		const shell = createShell();
		const result = shell.execute(input);
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(unsupportedSyntax(detail));
	});

	it("一行裡有不支援的寫法時一個指令都不執行，也不會先建立重導向的檔案", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command]);
		shell.execute("probe > out.txt ; probe || probe");
		expect(probe.calls).toHaveLength(0);
		expect(shell.fs.exists(shell.cwd, "out.txt")).toBe(false);
	});

	it("引號內的這些符號是字面值", () => {
		const shell = createShell();
		expect(shell.execute("echo 'a || b & c < d 2>&1 $(e) `f`'").lines).toEqual(["a || b & c < d 2>&1 $(e) `f`"]);
		expect(shell.execute('echo "a || b; c && d"').lines).toEqual(["a || b; c && d"]);
	});
});

describe("Shell ; 與 &&（M13-2）", () => {
	it("; 依序執行，後面的指令看得到前面的副作用", () => {
		const shell = createShell();
		const result = shell.execute("cd pod_06 ; pwd");
		expect(result.isError).toBe(false);
		expect(result.lines).toEqual(["/home/tech/pod_06"]);
		expect(shell.cwd).toBe("/home/tech/pod_06");
	});

	it("cd 目錄 && ls 先走進去再列出裡面的東西", () => {
		const shell = createShell();
		expect(shell.execute("cd /home && ls").lines).toEqual(["abin/", "tech/"]);
	});

	it("; 前一段失敗照樣執行下一段，整行算一次錯誤", () => {
		const shell = createShell();
		const result = shell.execute("cat nope.txt ; pwd");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual([...pathNotFound("nope.txt"), "/home/tech"]);
	});

	it("&& 前一段失敗就不執行下一段", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command, failCommand]);
		const result = shell.execute("fail && probe");
		expect(result).toMatchObject({ isError: true, lines: ["boom"] });
		expect(probe.calls).toHaveLength(0);
	});

	it("&& 跳過之後，後面接的 && 也跳過，; 之後重新開始", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command, failCommand]);
		shell.execute("fail && probe && probe ; probe && probe");
		expect(probe.calls).toHaveLength(2);
	});

	it("前一段成功、這一段失敗時，後面的 && 也不執行", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command, failCommand]);
		const result = shell.execute("probe && fail && probe");
		expect(probe.calls).toHaveLength(1);
		expect(result).toMatchObject({ isError: true, lines: ["probed", "boom"] });
	});

	it("每一段可以是帶重導向的管線（; 與 && 比 | 鬆）", () => {
		const shell = createShell();
		const result = shell.execute("ls | cat > list.txt && cat list.txt");
		expect(result.isError).toBe(false);
		expect(result.lines).toContain("wake_up.txt");
		expect(result.lines).toContain("list.txt");
	});

	it("變數在執行到那一段時才展開，前一段 export 的值後一段用得到", () => {
		const shell = createShell();
		const result = shell.execute("export TARGET=/deck1 ; cd $TARGET && pwd");
		expect(result.isError).toBe(false);
		expect(result.lines).toEqual(["/deck1"]);
	});

	it("萬用字元在執行到那一段時才展開，用的是當下的工作目錄", () => {
		const shell = createShell();
		expect(shell.execute("cd /home ; echo *").lines).toEqual(["abin tech"]);
	});

	it("歷史只記整行一次，每一段看到的歷史都不含這一行", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command]);
		shell.execute("pwd");
		shell.execute("probe ; probe");
		expect(shell.historyEntries).toEqual(["pwd", "probe ; probe"]);
		expect(probe.calls.map((call) => call.context.history)).toEqual([["pwd"], ["pwd"]]);
	});

	it("任一段有語法錯誤時整行一段都不執行", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command]);
		const result = shell.execute("probe ; ls |");
		expect(result).toMatchObject({ isError: true, lines: emptyCommand("|") });
		expect(probe.calls).toHaveLength(0);
	});

	it("; 的左邊沒有指令回傳 emptyListCommand", () => {
		const shell = createShell();
		const result = shell.execute("; ls");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(emptyListCommand(";"));
	});

	it("變數展開後才出現的錯誤只算那一段失敗，前面的照樣執行", () => {
		const shell = createShell();
		const result = shell.execute("pwd ; ls > $NOPE");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(["/home/tech", ...missingRedirectTarget(">")]);
	});

	it("segments 依序記下實際執行的每一段，各自帶那一段執行完的狀態", () => {
		const shell = createShellWith([setvarCommand]);
		const result = shell.execute("cd pod_06 ; cat nope.txt ; setvar A 1 && pwd");
		expect(result.segments?.map((segment) => segment.input)).toEqual([
			"cd pod_06",
			"cat nope.txt",
			"setvar A 1",
			"pwd",
		]);
		expect(result.segments?.map((segment) => segment.isError)).toEqual([false, true, false, false]);
		expect(result.segments?.[0].cwd).toBe("/home/tech/pod_06");
		expect(result.segments?.[1].lines).toEqual(pathNotFound("nope.txt"));
		expect(result.segments?.[1].env.A).toBeUndefined();
		expect(result.segments?.[2].env.A).toBe("1");
		expect(result.segments?.[3].lines).toEqual(["/home/tech/pod_06"]);
	});

	it("segments 不含被 && 跳過的段落", () => {
		const shell = createShellWith([failCommand]);
		const result = shell.execute("fail && pwd ; pwd");
		expect(result.segments?.map((segment) => segment.input)).toEqual(["fail", "pwd"]);
	});

	it("只有一段時沒有 segments，結尾的 ; 也一樣", () => {
		const shell = createShell();
		expect(shell.execute("pwd").segments).toBeUndefined();
		const trailing = shell.execute("pwd ;");
		expect(trailing.segments).toBeUndefined();
		expect(trailing).toMatchObject({ input: "pwd ;", lines: ["/home/tech"], isError: false });
	});

	it("審計 G2 的例子：echo hi; echo there 分兩段印出", () => {
		const shell = createShell();
		expect(shell.execute("echo hi; echo there")).toMatchObject({ isError: false, lines: ["hi", "there"] });
	});

	it("clear 之後的段落輸出照樣留下，clear 之前的丟掉", () => {
		const shell = createShell();
		const result = shell.execute("ls ; clear ; pwd");
		expect(result.clearScreen).toBe(true);
		expect(result.lines).toEqual(["/home/tech"]);
		expect(shell.execute("pwd ; clear")).toMatchObject({ clearScreen: true, lines: [] });
	});
});
