// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COMMAND_DOC_ORDER, COMMAND_DOCS, getCommandDoc } from "./docs";

const CHAPTER_ONE_COMMANDS = ["pwd", "ls", "cd", "cat", "help", "hint", "man", "history", "clear"];
/** 第二到六章的指令，照章節順序接在第一章後面（設計文件 4.3）。 */
const LATER_COMMANDS = [
	"head", "tail", "wc", "grep", "find",
	"mkdir", "touch", "cp", "mv", "rm", "chmod",
	"echo", "sort", "uniq", "export", "env", "ps", "top", "kill",
];

describe("COMMAND_DOCS", () => {
	it.each(CHAPTER_ONE_COMMANDS)("第一章指令 %s 有說明", (name) => {
		expect(COMMAND_DOCS[name]).toBeDefined();
	});

	it("每個 doc 的 name 等於它的 key", () => {
		for (const [key, doc] of Object.entries(COMMAND_DOCS)) {
			expect(doc.name).toBe(key);
		}
	});

	it("每個 doc 都有 summary、usage、description 與 examples", () => {
		for (const doc of Object.values(COMMAND_DOCS)) {
			expect(doc.summary.trim()).not.toBe("");
			expect(doc.usage.trim()).not.toBe("");
			expect(doc.description.length).toBeGreaterThan(0);
			expect(doc.examples.length).toBeGreaterThan(0);
		}
	});

	it("每個範例都有指令與說明，且指令以該指令名稱開頭", () => {
		for (const doc of Object.values(COMMAND_DOCS)) {
			for (const example of doc.examples) {
				expect(example.command.startsWith(doc.name)).toBe(true);
				expect(example.explanation.trim()).not.toBe("");
			}
		}
	});

	it("ls 的說明涵蓋 -a 與 -l", () => {
		const text = COMMAND_DOCS.ls.description.join("\n");
		expect(text).toContain("-a");
		expect(text).toContain("-l");
		expect(text).toContain("-la");
	});

	it("cd 的說明涵蓋 ..、~ 與不帶參數", () => {
		const text = COMMAND_DOCS.cd.description.join("\n");
		expect(text).toContain("..");
		expect(text).toContain("~");
		expect(text).toContain("不帶");
	});

	it("cat 的說明提到可以一次讀多個檔案", () => {
		expect(COMMAND_DOCS.cat.description.join("\n")).toContain("多個");
	});

	it("grep 的用法與說明涵蓋正規表示式、-E 與 -F", () => {
		const doc = COMMAND_DOCS.grep;
		const text = doc.description.join("\n");
		expect(doc.usage).toContain("-E");
		expect(doc.usage).toContain("-F");
		expect(text).toContain("正規表示式");
		expect(text).toContain("-E");
		expect(text).toContain("-F");
		expect(doc.examples.some((example) => example.command.includes("-E"))).toBe(true);
	});

	it("grep 的用法、說明與範例涵蓋 -w 與 -o", () => {
		const doc = COMMAND_DOCS.grep;
		const text = doc.description.join("\n");
		for (const flag of ["-w", "-o"]) {
			expect(doc.usage).toContain(flag);
			expect(text).toContain(flag);
			expect(doc.examples.some((example) => example.command.includes(flag))).toBe(true);
		}
	});
});

describe("COMMAND_DOC_ORDER", () => {
	it("順序符合設計：先第一章，再依章節接上", () => {
		expect(COMMAND_DOC_ORDER).toEqual([...CHAPTER_ONE_COMMANDS, ...LATER_COMMANDS]);
	});

	it("每個名稱都能在 COMMAND_DOCS 找到", () => {
		for (const name of COMMAND_DOC_ORDER) {
			expect(COMMAND_DOCS[name]).toBeDefined();
		}
	});

	it("COMMAND_DOCS 的每個指令都有出現在順序清單裡", () => {
		for (const name of Object.keys(COMMAND_DOCS)) {
			expect(COMMAND_DOC_ORDER).toContain(name);
		}
	});
});

describe("getCommandDoc", () => {
	it("找得到的指令回傳 doc", () => {
		expect(getCommandDoc("ls")).toBe(COMMAND_DOCS.ls);
	});

	it("找不到的指令回傳 undefined", () => {
		expect(getCommandDoc("nope")).toBeUndefined();
	});

	it("原型上的名稱不會被當成指令", () => {
		expect(getCommandDoc("constructor")).toBeUndefined();
		expect(getCommandDoc("toString")).toBeUndefined();
	});
});
