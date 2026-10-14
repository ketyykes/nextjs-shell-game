// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from ".";
import { ACCOUNT_COMMAND_DOCS, ACCOUNT_COMMAND_ORDER } from "./docsAccount";

/** 第十七場的帳號與登入彩蛋。 */
const ACCOUNT_COMMANDS = ["whoami", "id", "last", "sudo", "exit", "logout"];

describe("ACCOUNT_COMMAND_ORDER", () => {
	it("順序照第十七場的清單", () => {
		expect(ACCOUNT_COMMAND_ORDER).toEqual(ACCOUNT_COMMANDS);
	});

	it("每個名稱都有說明，說明也沒有多出順序外的指令", () => {
		expect(Object.keys(ACCOUNT_COMMAND_DOCS).sort()).toEqual([...ACCOUNT_COMMANDS].sort());
	});

	it.each(ACCOUNT_COMMANDS)("%s 已經註冊成指令", (name) => {
		expect(ALL_COMMANDS.map((command) => command.name)).toContain(name);
	});
});

describe("ACCOUNT_COMMAND_DOCS", () => {
	it.each(ACCOUNT_COMMANDS)("%s 的說明格式完整", (name) => {
		const doc = ACCOUNT_COMMAND_DOCS[name];

		expect(doc.name).toBe(name);
		expect(doc.summary.trim()).not.toBe("");
		expect(doc.usage.startsWith(name)).toBe(true);
		expect(doc.description.length).toBeGreaterThanOrEqual(2);
		expect(doc.examples.length).toBeGreaterThanOrEqual(1);
	});

	it("exit 與 logout 說明這裡要按 Esc", () => {
		for (const name of ["exit", "logout"]) {
			expect(ACCOUNT_COMMAND_DOCS[name].description.join("\n")).toContain("Esc");
		}
	});

	it("不指涉性別，也不提主線的人名（沙盒的 man 也看得到）", () => {
		const text = JSON.stringify(ACCOUNT_COMMAND_DOCS);
		expect(text).not.toMatch(/[他她]/);
		expect(text).not.toMatch(/abin|阿彬|NOVA|nova/);
	});
});
