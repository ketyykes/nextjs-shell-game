// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { CHAPTERS } from "./index";
import { SOLUTIONS, solutionFor } from "./solutions";
import type { TerminalDefinition } from "./types";

/**
 * 一致性守門：`solutions.ts` 是單元測試與 e2e 共用的正解，這裡確認它跟劇本對得上——
 * 每台終端機都有一串、沒有多出來的 id、用真的 Shell 照打只有最後一步過關。
 */

const ALL_TERMINALS: TerminalDefinition[] = CHAPTERS.flatMap((chapter) => chapter.terminals);

/** 用劇本的 FS、起始目錄、環境變數與程序清單開一個真的 shell，跟遊戲裡開終端機一樣。 */
function openTerminal(terminal: TerminalDefinition): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(terminal.fs),
		terminalId: terminal.id,
		hints: terminal.hints,
		learnedCommands: [],
		cwd: terminal.initialCwd,
		env: terminal.env,
		processes: terminal.processes,
	});
}

describe("共用正解 solutions.ts", () => {
	it("六章 36 台終端機各有一串正解，沒有多出劇本裡不存在的 id", () => {
		expect(ALL_TERMINALS).toHaveLength(36);
		const terminalIds = ALL_TERMINALS.map((terminal) => terminal.id).sort();
		expect(Object.keys(SOLUTIONS).sort()).toEqual(terminalIds);
	});

	it("solutionFor 找不到 id 時直接丟錯，e2e 打錯 id 不會默默打空指令", () => {
		expect(solutionFor("ch1-t1")).toBe(SOLUTIONS["ch1-t1"]);
		expect(() => solutionFor("ch9-t9")).toThrow("ch9-t9");
	});

	for (const terminal of ALL_TERMINALS) {
		it(`${terminal.id} ${terminal.title}：照打不會出錯，只有最後一步過關`, () => {
			const shell = openTerminal(terminal);
			const solvedFlags = solutionFor(terminal.id).map((input) => {
				const execution = shell.execute(input);
				expect(execution.isError, `「${input}」不該失敗：${execution.lines.join(" / ")}`).toBe(false);
				const context = createObjectiveContext(terminal.id, execution, shell.fs, shell.home);
				return evaluateObjective(terminal, context);
			});

			expect(solvedFlags.slice(0, -1), "最後一步之前就過關了").not.toContain(true);
			expect(solvedFlags.at(-1), "最後一步沒有過關").toBe(true);
		});
	}
});

describe("正解最後一步接 | less 一樣過關（man less 自己教 grep ERROR x | less）", () => {
	// 有重導向的那幾台輸出寫進檔案，接 less 沒有意義（語法上也不能 > 之後再接 |）
	const pageable = ALL_TERMINALS.filter((terminal) => !solutionFor(terminal.id).at(-1)?.includes(">"));

	it("至少涵蓋 ch2-t3 的 grep 與 ch6-t1 的 ps", () => {
		expect(pageable.map((terminal) => terminal.id)).toEqual(expect.arrayContaining(["ch2-t3", "ch6-t1"]));
	});

	for (const terminal of pageable) {
		it(`${terminal.id} ${terminal.title}`, () => {
			const shell = openTerminal(terminal);
			const steps = solutionFor(terminal.id);
			for (const input of steps.slice(0, -1)) {
				shell.execute(input);
			}

			const execution = shell.execute(`${steps.at(-1)} | less`);
			expect(execution.isError, execution.lines.join(" / ")).toBe(false);
			expect(execution.pagers).toHaveLength(1);
			const context = createObjectiveContext(terminal.id, execution, shell.fs, shell.home);
			expect(evaluateObjective(terminal, context)).toBe(true);
		});
	}
});
