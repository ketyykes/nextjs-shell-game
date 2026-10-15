// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from ".";
import { EXTRA2_COMMAND_DOCS, EXTRA2_COMMAND_ORDER } from "./docsExtra2";

/** 第十九場開放使用、沒編進劇本的指令（設計文件 4.18）。 */
const EXTRA2_COMMANDS = ["tr", "tee", "sed", "date"];

describe("EXTRA2_COMMAND_ORDER", () => {
	it("順序照設計文件 4.18 的清單", () => {
		expect(EXTRA2_COMMAND_ORDER).toEqual(EXTRA2_COMMANDS);
	});

	it("每個名稱都有說明，說明也沒有多出順序外的指令", () => {
		expect(Object.keys(EXTRA2_COMMAND_DOCS).sort()).toEqual([...EXTRA2_COMMANDS].sort());
	});

	it.each(EXTRA2_COMMANDS)("%s 已經註冊成指令", (name) => {
		expect(ALL_COMMANDS.map((command) => command.name)).toContain(name);
	});
});

describe("EXTRA2_COMMAND_DOCS", () => {
	it.each(EXTRA2_COMMANDS)("%s 的說明格式完整", (name) => {
		const doc = EXTRA2_COMMAND_DOCS[name];

		expect(doc.name).toBe(name);
		expect(doc.summary.trim()).not.toBe("");
		expect(doc.usage.startsWith(name)).toBe(true);
		expect(doc.description.length).toBeGreaterThanOrEqual(3);
		expect(doc.examples.length).toBeGreaterThanOrEqual(2);

		for (const example of doc.examples) {
			expect(example.command === name || example.command.startsWith(`${name} `)).toBe(true);
			expect(example.explanation.trim()).not.toBe("");
		}
	});

	it("tr 說明 -d、-s、範圍、類別、跳脫，以及只讀管線輸入", () => {
		const doc = EXTRA2_COMMAND_DOCS.tr;
		const text = doc.description.join("\n");
		for (const token of ["-d", "-s", "a-z", "[:upper:]", "[:lower:]", "[:digit:]", "[:space:]", "\\n", "|", "cat"]) {
			expect(text).toContain(token);
		}
		expect(doc.usage).toContain("-d");
		expect(doc.usage).toContain("-s");
	});

	it("tee 說明同時印出與存檔、-a，以及寫不到時的行為", () => {
		const doc = EXTRA2_COMMAND_DOCS.tee;
		const text = doc.description.join("\n");
		for (const token of ["|", ">", "-a", "畫面"]) {
			expect(text).toContain(token);
		}
		expect(doc.examples.some((example) => example.command.includes("-a"))).toBe(true);
	});

	it("sed 說明 s 的旗標、位址、p 與 d、-n、-E、-i、-e，以及不支援的指令", () => {
		const doc = EXTRA2_COMMAND_DOCS.sed;
		const text = doc.description.join("\n");
		for (const token of ["s/舊/新/", "g", "& ", "\\1", "-E", "2,5", "$", "/ERROR/", "p", "d", "-n", "-i", "-e", ";", "a、i、c、y"]) {
			expect(text).toContain(token);
		}
		for (const flag of ["-n", "-E", "-i", "-e"]) {
			expect(doc.usage).toContain(flag);
		}
		expect(doc.examples.some((example) => example.command.includes("-n"))).toBe(true);
		expect(doc.examples.some((example) => example.command.includes("-i"))).toBe(true);
	});

	it("date 說明 UTC、+格式的常用寫法，以及時間不會自己走", () => {
		const doc = EXTRA2_COMMAND_DOCS.date;
		const text = doc.description.join("\n");
		for (const token of ["UTC", "-u", "+", "%Y", "%m", "%d", "%H", "%M", "%S", "%F", "%T", "%j", "%s", "%%"]) {
			expect(text).toContain(token);
		}
		expect(text).toContain("同一個時間");
		expect(doc.examples.some((example) => example.command.startsWith("date +"))).toBe(true);
	});
});
