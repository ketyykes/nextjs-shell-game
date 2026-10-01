// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FILE_COMMAND_DOCS, FILE_COMMAND_ORDER } from "./docsFiles";

const FILE_COMMANDS = ["mkdir", "touch", "cp", "mv", "rm", "chmod"];

describe("FILE_COMMAND_ORDER", () => {
	it("順序是 mkdir、touch、cp、mv、rm、chmod", () => {
		expect(FILE_COMMAND_ORDER).toEqual(FILE_COMMANDS);
	});

	it("每個名稱都有說明，說明也沒有多出順序外的指令", () => {
		expect(Object.keys(FILE_COMMAND_DOCS).sort()).toEqual([...FILE_COMMANDS].sort());
	});
});

describe("FILE_COMMAND_DOCS", () => {
	it.each(FILE_COMMANDS)("%s 的說明格式完整", (name) => {
		const doc = FILE_COMMAND_DOCS[name];

		expect(doc.name).toBe(name);
		expect(doc.summary.trim()).not.toBe("");
		expect(doc.usage.startsWith(name)).toBe(true);
		expect(doc.description.length).toBeGreaterThanOrEqual(3);
		expect(doc.description.length).toBeLessThanOrEqual(5);
		expect(doc.examples.length).toBeGreaterThanOrEqual(2);
		expect(doc.examples.length).toBeLessThanOrEqual(4);

		for (const example of doc.examples) {
			expect(example.command.startsWith(`${name} `)).toBe(true);
			expect(example.explanation.trim()).not.toBe("");
		}
	});

	it("第三章指令的範例用反應爐設定目錄", () => {
		for (const name of ["mkdir", "touch", "cp", "mv", "rm"]) {
			const commands = FILE_COMMAND_DOCS[name].examples.map((example) => example.command).join("\n");
			expect(commands).toMatch(/config|core\.cfg|coolant\.cfg|backup/);
		}
	});

	it("chmod 的範例用艦橋的封存日誌", () => {
		const commands = FILE_COMMAND_DOCS.chmod.examples.map((example) => example.command).join("\n");
		expect(commands).toContain("/deck5/captain/sealed/log_final.txt");
	});

	it("rm 提醒刪了救不回來", () => {
		expect(FILE_COMMAND_DOCS.rm.description.join("\n")).toContain("救不回來");
	});

	it("mv 提醒也可以用來改名", () => {
		expect(FILE_COMMAND_DOCS.mv.description.join("\n")).toContain("改名");
	});

	it("cp 提醒要加 -r 才能複製目錄", () => {
		expect(FILE_COMMAND_DOCS.cp.description.join("\n")).toContain("-r");
	});

	it("chmod 說明 r、w、x 代表什麼", () => {
		const text = FILE_COMMAND_DOCS.chmod.description.join("\n");
		expect(text).toContain("r 是讀取");
		expect(text).toContain("w 是寫入");
		expect(text).toContain("x 是執行");
	});

	it("mkdir 說明 -p", () => {
		expect(FILE_COMMAND_DOCS.mkdir.description.join("\n")).toContain("-p");
	});
});
