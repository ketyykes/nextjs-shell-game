// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from ".";
import { EXTRA_COMMAND_DOCS, EXTRA_COMMAND_ORDER } from "./docsExtra";

/** M13-3 開放使用但沒編進劇本的指令。 */
const EXTRA_COMMANDS = ["tree", "cut"];

describe("EXTRA_COMMAND_ORDER", () => {
	it("順序照 M13-3 的清單", () => {
		expect(EXTRA_COMMAND_ORDER).toEqual(EXTRA_COMMANDS);
	});

	it("每個名稱都有說明，說明也沒有多出順序外的指令", () => {
		expect(Object.keys(EXTRA_COMMAND_DOCS).sort()).toEqual([...EXTRA_COMMANDS].sort());
	});

	it.each(EXTRA_COMMANDS)("%s 已經註冊成指令", (name) => {
		expect(ALL_COMMANDS.map((command) => command.name)).toContain(name);
	});
});

describe("EXTRA_COMMAND_DOCS", () => {
	it.each(EXTRA_COMMANDS)("%s 的說明格式完整", (name) => {
		const doc = EXTRA_COMMAND_DOCS[name];

		expect(doc.name).toBe(name);
		expect(doc.summary.trim()).not.toBe("");
		expect(doc.usage.startsWith(name)).toBe(true);
		expect(doc.description.length).toBeGreaterThanOrEqual(3);
		expect(doc.examples.length).toBeGreaterThanOrEqual(2);

		for (const example of doc.examples) {
			expect(example.command.startsWith(`${name} `)).toBe(true);
			expect(example.explanation.trim()).not.toBe("");
		}
	});

	it("tree 說明 -a、-d、-L 與目錄結尾的 /", () => {
		const doc = EXTRA_COMMAND_DOCS.tree;
		const text = doc.description.join("\n");
		for (const flag of ["-a", "-d", "-L"]) {
			expect(doc.usage).toContain(flag);
			expect(text).toContain(flag);
		}
		expect(text).toContain("/");
	});

	it("cut 說明 -d、-f、-c 與範圍寫法", () => {
		const doc = EXTRA_COMMAND_DOCS.cut;
		const text = doc.description.join("\n");
		for (const flag of ["-d", "-f", "-c"]) {
			expect(doc.usage).toContain(flag);
			expect(text).toContain(flag);
		}
		expect(text).toContain("2-4");
		expect(text).toContain("3-");
	});
});
