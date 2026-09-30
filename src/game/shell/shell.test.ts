// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CH1_TEST_SNAPSHOT, createTestFs, OVERRIDE_CONTENT } from "./commands/testFixtures";
import { VirtualFileSystem } from "./fs";
import { commandNotFound, fullwidthChar, missingSpace, pathNotFound, unsupportedOperator } from "./messages";
import { Shell } from "./shell";
import type { ShellOptions } from "./types";

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
		expect(result).toEqual({ input: "   ", lines: [], isError: false, clearScreen: false, cwd: "/home/tech" });
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

	it("管線在第一章回報尚未支援", () => {
		const shell = createShell();
		const result = shell.execute("ls | cat");
		expect(result.isError).toBe(true);
		expect(result.lines).toEqual(unsupportedOperator("|"));
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
