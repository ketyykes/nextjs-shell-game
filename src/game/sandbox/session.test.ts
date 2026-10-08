// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from "@/game/shell/commands";
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
