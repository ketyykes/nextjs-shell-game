// @vitest-environment node
import { describe, expect, it } from "vitest";
import { manNotFound } from "../messages";
import { COMMAND_DOCS } from "./docs";
import { createContext } from "./gameCommandFixtures";
import { helpCommand } from "./help";
import { manCommand } from "./man";

describe("help 指令", () => {
	it("名稱是 help", () => {
		expect(helpCommand.name).toBe("help");
	});

	it("只列出已學的指令，格式為標題、對齊的列表與結尾提示", () => {
		const context = createContext({ learnedCommands: ["pwd", "ls"] });
		const result = helpCommand.run([], context);

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual([
			"目前會的指令：",
			`pwd  ${COMMAND_DOCS.pwd.summary}`,
			`ls   ${COMMAND_DOCS.ls.summary}`,
			"輸入 man <指令> 看詳細說明，卡關輸入 hint。",
		]);
	});

	it("沒學過的指令不會出現", () => {
		const context = createContext({ learnedCommands: ["pwd"] });
		const output = helpCommand.run([], context).lines.join("\n");

		expect(output).not.toContain(COMMAND_DOCS.ls.summary);
		expect(output).not.toContain(COMMAND_DOCS.cat.summary);
	});

	it("順序照 COMMAND_DOC_ORDER，而不是學會的順序", () => {
		const context = createContext({ learnedCommands: ["cat", "help", "pwd", "cd", "ls"] });
		const listLines = helpCommand.run([], context).lines.slice(1, -1);
		const names = listLines.map((line) => line.split(/\s+/)[0]);

		expect(names).toEqual(["pwd", "ls", "cd", "cat", "help"]);
	});

	it("名稱欄寬以最長的名稱對齊", () => {
		const context = createContext({ learnedCommands: ["pwd", "history"] });
		const listLines = helpCommand.run([], context).lines.slice(1, -1);

		expect(listLines[0]).toBe(`pwd      ${COMMAND_DOCS.pwd.summary}`);
		expect(listLines[1]).toBe(`history  ${COMMAND_DOCS.history.summary}`);
	});

	it("不在順序表裡的指令排在最後，維持學會的順序", () => {
		const context = createContext({ learnedCommands: ["zeta", "ls", "alpha"] });
		const listLines = helpCommand.run([], context).lines.slice(1, -1);
		const names = listLines.map((line) => line.split(/\s+/)[0]);

		expect(names).toEqual(["ls", "zeta", "alpha"]);
	});

	it("teaches 裡的概念（Tab、*、..、~、>、|、$變數）學了也不會被當成指令列出", () => {
		const context = createContext({ learnedCommands: ["ls", "Tab", "*", "..", "~", ">", ">>", "|", "$變數"] });
		const listLines = helpCommand.run([], context).lines.slice(1, -1);

		expect(listLines).toEqual([`ls  ${COMMAND_DOCS.ls.summary}`]);
	});

	it("只學過概念、還沒學過指令時，跟什麼都沒學一樣提示用 hint", () => {
		const result = helpCommand.run([], createContext({ learnedCommands: ["Tab", ".."] }));

		expect(result.lines).toHaveLength(1);
		expect(result.lines[0]).toContain("hint");
	});

	it("重複學到的指令只列一次", () => {
		const context = createContext({ learnedCommands: ["ls", "ls"] });
		const listLines = helpCommand.run([], context).lines.slice(1, -1);

		expect(listLines).toHaveLength(1);
	});

	it("還沒學會任何指令時提示用 hint，而且不算錯誤", () => {
		const result = helpCommand.run([], createContext({ learnedCommands: [] }));

		expect(result.ok).toBe(true);
		expect(result.lines).toHaveLength(1);
		expect(result.lines[0]).toContain("hint");
	});

	it("help <指令> 等同 man <指令>", () => {
		const context = createContext({ learnedCommands: [] });

		expect(helpCommand.run(["ls"], context)).toEqual(manCommand.run(["ls"], context));
	});

	it("help 後面接不存在的指令，回報與 man 相同的找不到訊息", () => {
		const result = helpCommand.run(["xyz"], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(manNotFound("xyz"));
	});
});
