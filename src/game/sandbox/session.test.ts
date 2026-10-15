// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from "@/game/shell/commands";
import { noSuchUser, sandboxCannotExit } from "@/game/shell/messages";
import { createSandboxShell, SANDBOX_TERMINAL_ID } from "./session";

/** 執行一行並回傳輸出，順便確認沒有失敗。 */
function run(shell: ReturnType<typeof createSandboxShell>, input: string): string[] {
	const execution = shell.execute(input);
	expect(execution.isError, `${input} 應該成功：${execution.lines.join("\n")}`).toBe(false);
	return execution.lines;
}

describe("createSandboxShell", () => {
	it("終端機 id 是沙盒專用的，起點在家目錄", () => {
		const shell = createSandboxShell();
		expect(shell.terminalId).toBe(SANDBOX_TERMINAL_ID);
		expect(shell.cwd).toBe("/home/tech");
	});

	it("所有已註冊的指令都算學過，help 全部列出", () => {
		const shell = createSandboxShell();
		const allNames = ALL_COMMANDS.map((command) => command.name);
		expect(shell.learnedCommands).toEqual(expect.arrayContaining(allNames));

		const output = run(shell, "help").join("\n");
		for (const name of allNames) {
			expect(output).toContain(name);
		}
	});

	it("每次呼叫都是全新的環境，改了一個不影響下一個（重置靠這個）", () => {
		const first = createSandboxShell();
		run(first, "mkdir scratch_dir");
		run(first, "rm README.txt");
		run(first, "cd /tmp");
		run(first, "export SCRATCH=1");

		const second = createSandboxShell();
		expect(second.cwd).toBe("/home/tech");
		expect(second.historyEntries).toEqual([]);
		const listing = run(second, "ls").join("\n");
		expect(listing).toContain("README.txt");
		expect(listing).not.toContain("scratch_dir");
		expect(second.env.SCRATCH).toBeUndefined();
	});

	describe("帳號與登入的彩蛋（第十七場）", () => {
		/** 沙盒不碰主線（設計文件 4.11）；sudo 的「sudoers 名單」是 sudo 本身的用語，不是船員名單。 */
		const SPOILER = /NOVA|nova|阿彬|abin|回滾|rollback|名單|冷凍|pod_06|撤離|除役/;

		it("id 與 last 用練習環境自己的帳號與登入紀錄，查不到主線的帳號", () => {
			const shell = createSandboxShell();
			expect(run(shell, "id")).toEqual(["uid=1006(tech) gid=1006(tech) groups=1006(tech),100(users)"]);
			expect(shell.execute("id abin")).toMatchObject({ isError: true, lines: noSuchUser("abin") });
			expect(shell.execute("id nova").isError).toBe(true);
			expect(shell.execute("id captain").isError).toBe(true);
			expect(shell.execute("id eng").isError).toBe(true);
			expect(run(shell, "last")[0]).toContain("Sat Aug 14 05:30   still logged in");
		});

		it("exit 與 logout 說明練習模式要按 Esc、會先問要不要離開，不說「工作階段不會登出」", () => {
			const shell = createSandboxShell();
			for (const name of ["exit", "logout"]) {
				const execution = shell.execute(name);
				expect(execution).toMatchObject({ isError: false, lines: sandboxCannotExit(name) });
				expect(execution.lines.join("\n")).not.toContain("不會登出");
			}
			// 跟主線一樣，exit 之後什麼都不會執行
			expect(shell.execute("exit && pwd").lines).toEqual(sandboxCannotExit("exit"));
		});

		it("彩蛋指令的輸出與說明都不劇透主線", () => {
			const shell = createSandboxShell();
			const inputs = ["whoami", "id", "last", "sudo ls", "exit", "logout"];
			const names = ["whoami", "id", "last", "sudo", "exit", "logout"];
			const outputs = [
				...inputs.map((input) => shell.execute(input).lines.join("\n")),
				...names.map((name) => run(shell, `man ${name}`).join("\n")),
			];
			const offending = outputs.filter((text) => SPOILER.test(text.replaceAll("sudoers 名單", "")));
			expect(offending).toEqual([]);
		});
	});

	describe("hint", () => {
		it("給沙盒專用的練習建議，不報錯也不說「沒有提示」", () => {
			const shell = createSandboxShell();
			const lines = run(shell, "hint");
			const text = lines.join("\n");
			expect(text).toContain("練習建議");
			expect(text).not.toContain("沒有提示");
		});

		it("重複輸入輪流給不同建議，用完繞回第一則，不會出現「提示已經全部給過了」", () => {
			const shell = createSandboxShell();
			const seen: string[] = [];
			for (let index = 0; index < 20; index += 1) {
				const text = run(shell, "hint").join("\n");
				expect(text).not.toContain("全部給過了");
				seen.push(text);
			}
			expect(new Set(seen).size).toBeGreaterThan(3);
			expect(seen).toContain(seen[0]);
			const tipCount = new Set(seen).size;
			expect(seen[tipCount]).toBe(seen[0]);
		});
	});
});

describe("第十九場的指令（練習建議與說明裡的寫法照打都能用）", () => {
	it("find trash -name '*.tmp' | xargs rm 只刪暫存檔", () => {
		const shell = createSandboxShell();
		run(shell, "find trash -name '*.tmp' | xargs rm");
		expect(run(shell, "ls trash")).toEqual(["keep_me.txt"]);
	});

	it("ps | grep fan_test | cut -d ' ' -f 1 | xargs kill 結束 fan_test", () => {
		const shell = createSandboxShell();
		run(shell, "ps | grep fan_test | cut -d ' ' -f 1 | xargs kill");
		expect(shell.processes.some((process) => process.command.includes("fan_test"))).toBe(false);
	});

	it("sed、tr、tee、alias 照建議打", () => {
		const shell = createSandboxShell();
		expect(run(shell, "sed 's/INFO/資訊/' logs/sensors.log | head -n 1")[0]).toContain("資訊");
		expect(run(shell, "cat logs/access.log | tr a-z A-Z | head -n 1")).toEqual(["DOOR=LAB-A USER=TECH ACTION=OPEN"]);
		expect(run(shell, "ls logs | tee list.txt")).toEqual(run(shell, "cat list.txt"));
		run(shell, "alias ll='ls -l'");
		expect(run(shell, "ll logs")).toEqual(run(shell, "ls -l logs"));
	});
});
