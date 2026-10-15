// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from "./commands";
import { CH1_TEST_SNAPSHOT, createTestFs, OVERRIDE_CONTENT } from "./commands/testFixtures";
import { VirtualFileSystem } from "./fs";
import {
	cannotExit,
	cdTooManyArguments,
	commandIsLowercase,
	commandNotFound,
	emptyCommand,
	emptyListCommand,
	fsError,
	fullPathCommand,
	fullwidthChar,
	missingRedirectTarget,
	missingSpace,
	pathNotFound,
	programNotInstalled,
	similarCommand,
	subcommandRefused,
	sudoDenied,
	unsupportedSyntax,
	whichAlias,
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

	it("照抄 which 印的完整路徑執行時，說明不支援並請玩家直接打指令名", () => {
		const shell = createShell();
		const result = shell.execute("/usr/bin/ls");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(fullPathCommand("/usr/bin/ls", "ls"));
		expect(shell.execute("/bin/cat wake_up.txt").lines).toEqual(fullPathCommand("/bin/cat", "cat"));
		expect(shell.execute("/usr/bin/cd").lines).toEqual(commandNotFound("/usr/bin/cd"));
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

describe("找不到指令時的建議（第十七場）", () => {
	it.each([
		["gerp ERROR log.txt", "gerp", "grep"],
		["sl", "sl", "ls"],
		["cta wake_up.txt", "cta", "cat"],
		["pdw", "pdw", "pwd"],
		["mkdri logs", "mkdri", "mkdir"],
	])("%s 建議最接近的指令，仍然算錯誤", (input, name, suggestion) => {
		const result = createShell().execute(input);
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(similarCommand(name, suggestion));
	});

	it("同分時優先建議已學的指令", () => {
		// ca 跟 cd、cat、cp 的距離都是 1；T1 只學過 pwd、ls、cat
		expect(createShell().execute("ca").lines).toEqual(similarCommand("ca", "cat"));
		expect(createShell({ learnedCommands: ["cd"] }).execute("ca").lines).toEqual(similarCommand("ca", "cd"));
	});

	it("大小寫不同時說指令要用小寫", () => {
		const shell = createShell();
		expect(shell.execute("LS")).toMatchObject({ isError: true, lines: commandIsLowercase("LS", "ls") });
		expect(shell.execute("Cd pod_06").lines).toEqual(commandIsLowercase("Cd", "cd"));
		expect(shell.cwd).toBe("/home/tech");
	});

	it("常見但沒有安裝的程式給專屬說明，仍然算錯誤", () => {
		const shell = createShell();
		expect(shell.execute("vim notes.txt")).toMatchObject({
			isError: true,
			lines: programNotInstalled("vim", { kind: "editor" }),
		});
		expect(shell.execute("apt install vim").lines).toEqual(programNotInstalled("apt", { kind: "package" }));
		expect(shell.execute("python3").lines).toEqual(programNotInstalled("python3", { kind: "language" }));
		expect(shell.execute("ssh nova").lines).toEqual(programNotInstalled("ssh", { kind: "network" }));
		expect(shell.execute("dir").lines).toEqual(programNotInstalled("dir", { kind: "windows", equivalent: "ls" }));
	});

	it("完整路徑與忘記空格的判斷優先，都不中才走拼字建議", () => {
		const shell = createShell();
		expect(shell.execute("/usr/bin/ls").lines).toEqual(fullPathCommand("/usr/bin/ls", "ls"));
		expect(shell.execute("catwake_up.txt").lines).toEqual(missingSpace("cat", "wake_up.txt"));
		// 含 / 的名稱不猜拼字
		expect(shell.execute("/usr/bin/cta").lines).toEqual(commandNotFound("/usr/bin/cta"));
	});

	it("差太多的名稱不亂猜，照舊說找不到", () => {
		const shell = createShell();
		expect(shell.execute("xyz").lines).toEqual(commandNotFound("xyz"));
		expect(shell.execute("q").lines).toEqual(commandNotFound("q"));
		expect(shell.execute("nonexistent_command").lines).toEqual(commandNotFound("nonexistent_command"));
	});

	it("管線裡打錯的指令也給建議", () => {
		const result = createShell().execute("cat wake_up.txt | gerp 三年");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(similarCommand("gerp", "grep"));
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

	it("unset 拿掉變數之後 $名稱 展開成空字串，env 也看不到它", () => {
		const shell = createShell({ env: { NOVA_DIR: "/opt/nova" } });
		expect(shell.execute("unset NOVA_DIR")).toMatchObject({ isError: false, lines: [] });
		expect(shell.env.NOVA_DIR).toBeUndefined();
		expect(shell.execute("echo [$NOVA_DIR]").lines).toEqual(["[]"]);
		expect(shell.execute("env").lines.join("\n")).not.toContain("NOVA_DIR");
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

	it("cd 的萬用字元展開成好幾個目錄時報參數太多，不換目錄", () => {
		const shell = createShell();
		const result = shell.execute("cd pod_*");
		expect(result).toMatchObject({ isError: true, lines: cdTooManyArguments() });
		expect(shell.cwd).toBe("/home/tech");
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

describe("M13-3 新指令", () => {
	it("Tab 補得到 less、tree、cut、diff、which", () => {
		const shell = createShell();

		expect(shell.complete("les").completed).toBe("less ");
		expect(shell.complete("tre").completed).toBe("tree ");
		expect(shell.complete("cu").completed).toBe("cut ");
		expect(shell.complete("dif").completed).toBe("diff ");
		expect(shell.complete("whi").completed).toBe("which ");
	});

	it("沒學過也能直接用（4.8 未學指令開放使用），help 不會列出", () => {
		const shell = createShell();

		expect(shell.execute("which ls")).toMatchObject({ isError: false, lines: ["/usr/bin/ls"] });
		expect(shell.execute("help").lines.join("\n")).not.toMatch(/^(less|tree|cut|diff|which) /m);
	});
});

describe("帳號與登入的彩蛋（第十七場）", () => {
	it("whoami 的輸出只有一行，可以接管線", () => {
		const shell = createShell();
		expect(shell.execute("whoami").lines).toEqual(["tech"]);
		expect(shell.execute("whoami | wc -l").lines).toEqual(shell.execute("echo tech | wc -l").lines);
	});

	it("改了環境變數 USER，whoami 照樣是 tech", () => {
		const shell = createShell();
		shell.execute("export USER=abin");
		expect(shell.execute("whoami").lines).toEqual(["tech"]);
	});

	it("id 顯示 uid 1006，last 的輸出可以用 grep 挑", () => {
		const shell = createShell();
		expect(shell.execute("id").lines[0]).toMatch(/^uid=1006\(tech\) /);
		const abin = shell.execute("last | grep abin").lines;
		expect(abin).toHaveLength(1);
		expect(abin[0]).toContain("Mon Mar 10 02:38 - 02:53");
	});

	it("sudo 被拒絕不算錯誤（不扣氧），但 && 右邊不會執行", () => {
		const shell = createShell();
		expect(shell.execute("sudo cat wake_up.txt")).toMatchObject({ isError: false, lines: sudoDenied("tech") });
		expect(shell.execute("sudo ls && pwd").lines).toEqual(sudoDenied("tech"));
	});

	it("exit 與 logout 關不掉終端機，只說明要按 Esc，不算錯誤", () => {
		const shell = createShell();
		expect(shell.execute("exit")).toMatchObject({ isError: false, lines: cannotExit("exit") });
		expect(shell.execute("logout")).toMatchObject({ isError: false, lines: cannotExit("logout") });
		expect(shell.execute("exit && pwd").lines).toEqual(cannotExit("exit"));
	});

	it("沒學過也能用、Tab 補得到、man 查得到，但 help 不列出", () => {
		const shell = createShell();
		expect(shell.complete("whoa").completed).toBe("whoami ");
		expect(shell.complete("sud").completed).toBe("sudo ");
		for (const name of ["whoami", "id", "last", "sudo", "exit", "logout"]) {
			expect(shell.execute(`man ${name}`).isError).toBe(false);
		}
		expect(shell.execute("help").lines.join("\n")).not.toMatch(/^(whoami|id|last|sudo|exit|logout) /m);
	});
});

describe("Shell 分頁 less（M13-3）", () => {
	const WAKE_UP_LINES = ["喚醒排程：三年後", "原始設定：永不", "修改者："];

	it("less 檔名：輸出區沒有內容，改帶一個分頁請求", () => {
		const shell = createShell();
		const result = shell.execute("less wake_up.txt");

		expect(result).toMatchObject({ isError: false, lines: [] });
		expect(result.pagers).toEqual([{ files: [{ name: "wake_up.txt", lines: WAKE_UP_LINES }], lineNumbers: false }]);
	});

	it("管線最後的 less 翻前一個指令的輸出", () => {
		const shell = createShell();
		const result = shell.execute("cat wake_up.txt | less");

		expect(result.lines).toEqual([]);
		expect(result.pagers).toEqual([{ files: [{ name: null, lines: WAKE_UP_LINES }], lineNumbers: false }]);
	});

	it("less 在管線中間或接重導向時照真的 less 直接輸出內容，不分頁", () => {
		const shell = createShell();
		const piped = shell.execute("less wake_up.txt | wc -l");
		const redirected = shell.execute("less wake_up.txt > copy.txt");

		expect(piped).toMatchObject({ isError: false, lines: ["3"] });
		expect(piped.pagers).toBeUndefined();
		expect(redirected.pagers).toBeUndefined();
		expect(shell.fs.readFile("/home/tech", "copy.txt")).toBe(`${WAKE_UP_LINES.join("\n")}\n`);
	});

	it("有檔案讀不到時錯誤印在輸出區、其他照翻，這一行算錯誤", () => {
		const shell = createShell();
		const result = shell.execute("less nope.txt wake_up.txt");

		expect(result).toMatchObject({ isError: true, lines: pathNotFound("nope.txt") });
		expect(result.pagers?.[0].files.map((file) => file.name)).toEqual(["wake_up.txt"]);
	});

	it("全部讀不到時沒有分頁", () => {
		const shell = createShell();
		const result = shell.execute("less nope.txt");

		expect(result).toMatchObject({ isError: true, lines: pathNotFound("nope.txt") });
		expect(result.pagers).toBeUndefined();
	});

	it("用 ; 串起來時每一段的分頁依序排好，其他段落的輸出照常", () => {
		const shell = createShell();
		const result = shell.execute("less wake_up.txt ; pwd ; less -N wake_up.txt");

		expect(result.lines).toEqual(["/home/tech"]);
		expect(result.pagers?.map((pager) => pager.lineNumbers)).toEqual([false, true]);
		expect(result.segments?.[0].pagers).toHaveLength(1);
	});

	it("沒有 less 的指令沒有 pagers 欄位", () => {
		const shell = createShell();

		expect(shell.execute("pwd").pagers).toBeUndefined();
		expect(shell.execute("pwd ; ls").pagers).toBeUndefined();
	});
});

describe("Shell && 看結束碼，不算錯誤的失敗也會跳過右邊", () => {
	it("grep 沒符合時 && 右邊不執行，整行不算錯誤", () => {
		const shell = createShell();
		const result = shell.execute("grep NOPE wake_up.txt && echo 找到了");
		expect(result).toMatchObject({ isError: false, lines: [] });
		expect(result.segments?.map((segment) => segment.input)).toEqual(["grep NOPE wake_up.txt"]);
	});

	it("grep 有符合時 && 右邊照常執行", () => {
		const shell = createShell();
		const result = shell.execute("grep 喚醒 wake_up.txt && echo 找到了");
		expect(result).toMatchObject({ isError: false, lines: ["喚醒排程：三年後", "找到了"] });
	});

	it("grep -c 沒符合時印 0，&& 右邊照樣不執行", () => {
		const shell = createShell();
		expect(shell.execute("grep -c NOPE wake_up.txt && echo 找到了").lines).toEqual(["0"]);
	});

	it("diff 有差異時 && 右邊不執行，相同時照常執行", () => {
		const shell = createShell();
		shell.execute("echo a > a.txt ; echo b > b.txt ; echo a > c.txt");
		const differ = shell.execute("diff -q a.txt b.txt && echo 一樣");
		expect(differ).toMatchObject({ isError: false, lines: ["Files a.txt and b.txt differ"] });
		expect(shell.execute("diff a.txt c.txt && echo 一樣").lines).toEqual(["一樣"]);
	});

	it("which 找不到時 && 右邊不執行，找得到時照常執行", () => {
		const shell = createShell();
		const missing = shell.execute("which nope && echo 有");
		expect(missing.isError).toBe(false);
		expect(missing.lines).not.toContain("有");
		expect(shell.execute("which ls && echo 有").lines).toEqual(["/usr/bin/ls", "有"]);
	});

	it("管線的結束碼取最後一個指令：grep 在中間沒符合不影響，在最後就跳過", () => {
		const shell = createShell();
		expect(shell.execute("grep NOPE wake_up.txt | wc -l && echo 下一步").lines).toEqual(["0", "下一步"]);
		expect(shell.execute("cat wake_up.txt | grep NOPE && echo 下一步").lines).toEqual([]);
	});

	it("有重導向時也看指令的結束碼", () => {
		const shell = createShell();
		const result = shell.execute("grep NOPE wake_up.txt > found.txt && echo 寫好了");
		expect(result).toMatchObject({ isError: false, lines: [] });
	});

	it("; 不看結束碼，grep 沒符合之後照樣執行", () => {
		const shell = createShell();
		expect(shell.execute("grep NOPE wake_up.txt ; echo 下一段").lines).toEqual(["下一段"]);
	});
});

describe("Shell 唯讀變數（readonlyEnv）", () => {
	it("建立時給的唯讀變數 unset 拿不掉，整行算錯誤，env 不變", () => {
		const shell = createShell({ env: { STATION_MODE: "decommission_countdown" }, readonlyEnv: ["STATION_MODE"] });

		const execution = shell.execute("unset STATION_MODE");

		expect(execution.isError).toBe(true);
		expect(execution.lines.join("\n")).toContain("唯讀");
		expect(shell.env.STATION_MODE).toBe("decommission_countdown");
	});

	it("從存檔還原時再帶入唯讀清單（不存進存檔，來自劇本）", () => {
		const shell = createShell({ env: { STATION_MODE: "decommission_countdown" }, readonlyEnv: ["STATION_MODE"] });
		const state = shell.toState();
		const restored = Shell.fromState(state, VirtualFileSystem.fromSerialized(state.fs), [], undefined, ["STATION_MODE"]);

		expect(restored.execute("unset STATION_MODE").isError).toBe(true);
		expect(restored.env.STATION_MODE).toBe("decommission_countdown");
		expect(state).not.toHaveProperty("readonlyEnv");
	});

	it("沒給唯讀清單時跟原本一樣可以 unset", () => {
		const shell = createShell({ env: { STATION_MODE: "decommission_countdown" } });

		expect(shell.execute("unset STATION_MODE").isError).toBe(false);
		expect(shell.env.STATION_MODE).toBeUndefined();
	});
});

describe("Shell 的時鐘 now（第十九場）", () => {
	it("建立時給的 now 交給指令的 context，打幾次都一樣", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command], { now: "2031-03-12T14:02:00Z" });

		shell.execute("probe");
		shell.execute("probe");

		expect(probe.calls.map((call) => call.context.now)).toEqual(["2031-03-12T14:02:00Z", "2031-03-12T14:02:00Z"]);
	});

	it("從存檔還原時再帶入 now（不存進存檔，來自劇本或章節時鐘）", () => {
		const probe = createProbe();
		const shell = createShellWith([probe.command], { now: "2031-03-12T09:12:00Z" });
		const state = shell.toState();
		const restored = Shell.fromState(
			state,
			VirtualFileSystem.fromSerialized(state.fs),
			[],
			undefined,
			undefined,
			"2031-03-12T09:12:00Z",
		);

		expect(state).not.toHaveProperty("now");
		expect(restored.execute("date").lines).toEqual(["Wed Mar 12 09:12:00 UTC 2031"]);
	});
});

describe("第十九場開放的指令", () => {
	it("Tab 補得到，沒學過也能用，help 不列", () => {
		const shell = createShell();

		expect(shell.complete("te").completed).toBe("tee ");
		expect(shell.complete("dat").completed).toBe("date ");
		expect(shell.execute("help").lines.join("\n")).not.toMatch(/^(tr|tee|date) /m);
	});

	it("tr 接在管線右邊", () => {
		const shell = createShell();

		expect(shell.execute("ls | tr a-z A-Z | tail -n 1").lines).toEqual(["WAKE_UP.TXT"]);
	});

	it("tee 存檔的同時把內容交給下一個指令", () => {
		const shell = createShell();

		expect(shell.execute("ls | tee list.txt | wc -l")).toMatchObject({ isError: false, lines: ["7"] });
		expect(shell.execute("cat list.txt").lines).toEqual(LISTING);
	});

	it("sed 讀檔或管線，單引號包住的 $ 不會被當成變數", () => {
		const shell = createShell();

		expect(shell.execute("sed -n '$p' wake_up.txt").lines).toEqual(["修改者："]);
		expect(shell.execute("cat wake_up.txt | sed 's/三年後/明天/' | head -n 1").lines).toEqual(["喚醒排程：明天"]);
	});

	it("alias 與 unalias 是內建指令，which 找不到程式檔", () => {
		const shell = createShell();

		expect(shell.execute("which alias unalias").lines.join("\n")).toContain("內建");
	});

	it("sed -i 改寫虛擬檔案系統裡的檔案", () => {
		const shell = createShell();

		expect(shell.execute("sed -i '2d' wake_up.txt")).toMatchObject({ isError: false, lines: [] });
		expect(shell.execute("cat wake_up.txt").lines).toEqual(["喚醒排程：三年後", "修改者："]);
	});
});

describe("Shell 別名 alias（第十九場）", () => {
	it("設定之後打別名等於打它的內容，後面的參數接上去", () => {
		const shell = createShell();

		expect(shell.execute("alias ll='ls -l'")).toMatchObject({ isError: false, lines: [] });
		expect(shell.execute("ll pod_06").lines).toEqual(shell.execute("ls -l pod_06").lines);
		expect(shell.execute("alias").lines).toEqual(["alias ll='ls -l'"]);
	});

	it("只展開指令名：參數裡的、引號包住的、反斜線跳脫的都不展開", () => {
		const shell = createShell();
		shell.execute("alias ll='ls -l'");

		expect(shell.execute("echo ll").lines).toEqual(["ll"]);
		expect(shell.execute("'ll'").isError).toBe(true);
		expect(shell.execute("\\ll").isError).toBe(true);
	});

	it("同名的別名不遞迴：alias ls='ls -a' 之後 ls 看得到隱藏檔", () => {
		const shell = createShell();
		shell.execute("alias ls='ls -a'");

		expect(shell.execute("ls").lines).toContain(".nova_cache");
	});

	it("別名可以是管線，放在管線裡也會展開", () => {
		const shell = createShell();
		shell.execute("alias count='wc -l'");
		shell.execute("alias listing='ls | cat'");

		expect(shell.execute("ls | count").lines).toEqual(["7"]);
		expect(shell.execute("listing | count").lines).toEqual(["7"]);
	});

	it("變數在使用時才展開", () => {
		const shell = createShell();
		shell.execute("alias where='echo $PWD'");
		shell.execute("cd pod_06");

		expect(shell.execute("where").lines).toEqual(["/home/tech/pod_06"]);
	});

	it("同一行先定義再用，馬上生效", () => {
		const shell = createShell();

		expect(shell.execute("alias hi='echo hello'; hi").lines).toEqual(["hello"]);
	});

	it("unalias 之後就沒了", () => {
		const shell = createShell();
		shell.execute("alias ll='ls -l'");
		shell.execute("unalias ll");

		expect(shell.execute("ll").isError).toBe(true);
		expect(shell.execute("alias").lines).toEqual([]);
	});

	it("別名不進存檔：從存檔還原的 shell 沒有別名", () => {
		const shell = createShell();
		shell.execute("alias ll='ls -l'");
		const state = shell.toState();
		const restored = Shell.fromState(state, VirtualFileSystem.fromSerialized(state.fs), []);

		expect(state).not.toHaveProperty("aliases");
		expect(restored.execute("alias").lines).toEqual([]);
		expect(restored.execute("ll").isError).toBe(true);
	});

	it("Tab 補得到別名", () => {
		const shell = createShell();
		shell.execute("alias pods='ls pod_06'");

		expect(shell.complete("pod").completed).toBe("pods ");
	});

	it("which 查別名：說明它是別名，不算錯誤", () => {
		const shell = createShell();
		shell.execute("alias ll='ls -l'");

		expect(shell.execute("which ll")).toMatchObject({ isError: false, lines: whichAlias("ll", "alias ll='ls -l'") });
	});
});

describe("Shell 子指令執行 xargs（第十九場）", () => {
	it("把管線輸入接成參數執行，預設是 echo", () => {
		const shell = createShell();

		expect(shell.execute("ls | xargs")).toMatchObject({ isError: false, lines: [LISTING.join(" ")] });
		expect(shell.execute("echo wake_up.txt | xargs cat").lines).toEqual(["喚醒排程：三年後", "原始設定：永不", "修改者："]);
	});

	it("檔案操作直接改到檔案系統", () => {
		const shell = createShell();

		shell.execute("echo a.tmp b.tmp | xargs -n 1 touch");
		expect(shell.execute("ls").lines).toEqual(expect.arrayContaining(["a.tmp", "b.tmp"]));
		shell.execute("ls | grep tmp | xargs rm");
		expect(shell.execute("ls").lines).toEqual(LISTING);
	});

	it("kill 改的程序清單會生效，整行的結果看得到", () => {
		const shell = createShell({ processes: [NOVA_PROCESS, SHELL_PROCESS] });

		const execution = shell.execute("echo 42 | xargs kill");

		expect(execution.isError).toBe(false);
		expect(execution.processes).toEqual([NOVA_PROCESS]);
		expect(shell.processes).toEqual([NOVA_PROCESS]);
	});

	it("cd、export、alias 照 bash 子程序的語意不影響外面", () => {
		const shell = createShell();

		expect(shell.execute("echo pod_06 | xargs cd")).toMatchObject({ isError: false, cwd: "/home/tech" });
		shell.execute("echo X=1 | xargs export");
		shell.execute("echo ll=ls | xargs alias");

		expect(shell.env.X).toBeUndefined();
		expect(shell.execute("alias").lines).toEqual([]);
	});

	it("hint、clear、less、xargs 不能交給 xargs 執行，算錯誤", () => {
		const shell = createShell();

		for (const name of ["hint", "clear", "less", "xargs"]) {
			const execution = shell.execute(`echo wake_up.txt | xargs ${name}`);
			expect(execution).toMatchObject({ isError: true, lines: subcommandRefused(name), clearScreen: false });
			expect(execution.pagers).toBeUndefined();
		}
		expect(shell.hintCount).toBe(0);
	});

	it("找不到的指令照樣給拼字建議，xargs 也看不到別名", () => {
		const shell = createShell();
		shell.execute("alias ll='ls -l'");

		expect(shell.execute("echo x | xargs gerp")).toMatchObject({ isError: true, lines: similarCommand("gerp", "grep") });
		expect(shell.execute("echo x | xargs ll").isError).toBe(true);
	});

	it("其中一次失敗：其餘照跑，整行算錯誤", () => {
		const shell = createShell();

		const execution = shell.execute("echo nope.txt wake_up.txt | xargs -n 1 cat");

		expect(execution.isError).toBe(true);
		expect(execution.lines).toEqual([...fsError("ENOENT", "nope.txt"), "喚醒排程：三年後", "原始設定：永不", "修改者："]);
	});
});
