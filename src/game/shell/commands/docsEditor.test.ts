// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from ".";
import { EDITOR_COMMAND_DOCS, EDITOR_COMMAND_ORDER } from "./docsEditor";

describe("EDITOR_COMMAND_DOCS", () => {
	it("只有 nano，而且已經註冊成指令", () => {
		expect(EDITOR_COMMAND_ORDER).toEqual(["nano"]);
		expect(Object.keys(EDITOR_COMMAND_DOCS)).toEqual(["nano"]);
		expect(ALL_COMMANDS.map((command) => command.name)).toContain("nano");
	});

	it("說明格式完整，範例都以 nano 開頭", () => {
		const doc = EDITOR_COMMAND_DOCS.nano;

		expect(doc.name).toBe("nano");
		expect(doc.summary.trim()).not.toBe("");
		expect(doc.usage.startsWith("nano")).toBe(true);
		expect(doc.description.length).toBeGreaterThanOrEqual(3);
		expect(doc.examples.length).toBeGreaterThanOrEqual(2);
		for (const example of doc.examples) {
			expect(example.command.startsWith("nano")).toBe(true);
			expect(example.explanation.trim()).not.toBe("");
		}
	});

	it("說明四個常用按鍵、Esc、存檔時才建立新檔，以及 Ctrl+W 被瀏覽器搶走時的 F6", () => {
		const text = EDITOR_COMMAND_DOCS.nano.description.join("\n");

		for (const key of ["Ctrl+O", "Ctrl+X", "Ctrl+W", "Ctrl+G", "Esc", "F6"]) {
			expect(text).toContain(key);
		}
		expect(text).toContain("不存在");
		expect(text).toContain("control");
	});
});
