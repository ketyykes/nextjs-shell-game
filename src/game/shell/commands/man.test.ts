// @vitest-environment node
import { describe, expect, it } from "vitest";
import { manNotFound, missingOperand } from "../messages";
import { COMMAND_DOCS } from "./docs";
import { createContext } from "./gameCommandFixtures";
import { manCommand } from "./man";

describe("man 指令", () => {
	it("名稱是 man", () => {
		expect(manCommand.name).toBe("man");
	});

	it("沒有參數時回報缺少運算元，並且算錯誤", () => {
		const result = manCommand.run([], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(missingOperand("man", "一個指令名稱，例如 man ls"));
	});

	it("找不到指令時回報查無說明，並且算錯誤", () => {
		const result = manCommand.run(["xyz"], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(manNotFound("xyz"));
	});

	it("原型上的名稱（例如 constructor）不會被當成指令", () => {
		const result = manCommand.run(["constructor"], createContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(manNotFound("constructor"));
	});

	it("找到時依格式輸出標題、用法、說明與範例", () => {
		const result = manCommand.run(["pwd"], createContext());
		const doc = COMMAND_DOCS.pwd;

		expect(result.ok).toBe(true);
		expect(result.lines).toEqual([
			`pwd — ${doc.summary}`,
			"",
			`用法：${doc.usage}`,
			"",
			...doc.description,
			"",
			"範例：",
			`  ${doc.examples[0].command}`,
			`      ${doc.examples[0].explanation}`,
		]);
	});

	it("ls 的輸出包含用法與每一個範例", () => {
		const result = manCommand.run(["ls"], createContext());
		const doc = COMMAND_DOCS.ls;

		expect(result.lines).toContain(`用法：${doc.usage}`);
		for (const example of doc.examples) {
			expect(result.lines).toContain(`  ${example.command}`);
			expect(result.lines).toContain(`      ${example.explanation}`);
		}
	});

	it("還沒學過的指令也能查", () => {
		const result = manCommand.run(["cat"], createContext({ learnedCommands: [] }));

		expect(result.ok).toBe(true);
		expect(result.lines[0]).toBe(`cat — ${COMMAND_DOCS.cat.summary}`);
	});

	it("只看第一個參數，多餘的參數會被忽略", () => {
		const result = manCommand.run(["cd", "ls"], createContext());

		expect(result.ok).toBe(true);
		expect(result.lines[0]).toContain("cd — ");
	});
});
