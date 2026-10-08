// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COMMAND_DOCS, getTeachDoc } from "./docs";
import { CONCEPT_DOCS } from "./docsConcepts";

/** 新手最需要複習、但不是指令的概念（審計 A14、A38）。 */
const BEGINNER_CONCEPTS = ["*", "Tab", "..", "~"];

/** 把一個條目的 summary、usage 與 description 接成一段文字，方便檢查有沒有講到某件事。 */
function docText(name: string): string {
	const doc = CONCEPT_DOCS[name];
	return [doc.summary, doc.usage, ...doc.description].join("\n");
}

describe("CONCEPT_DOCS", () => {
	it("每個條目的 name 等於 key，summary、usage、description 與 examples 都有內容", () => {
		for (const [key, doc] of Object.entries(CONCEPT_DOCS)) {
			expect(doc.name, key).toBe(key);
			expect(doc.summary.trim(), key).not.toBe("");
			expect(doc.usage.trim(), key).not.toBe("");
			expect(doc.description.length, key).toBeGreaterThan(0);
			expect(doc.examples.length, key).toBeGreaterThan(0);
			for (const example of doc.examples) {
				expect(example.command.trim(), key).not.toBe("");
				expect(example.explanation.trim(), key).not.toBe("");
			}
		}
	});

	it("概念不跟指令同名，help 與 man 的指令清單才不會混進它們", () => {
		for (const key of Object.keys(CONCEPT_DOCS)) {
			expect(Object.hasOwn(COMMAND_DOCS, key), key).toBe(false);
		}
	});

	it.each(BEGINNER_CONCEPTS)("新手概念 %s 查得到說明，回顧卡與已學指令面板才列得出來", (name) => {
		expect(getTeachDoc(name)).toBeDefined();
		expect(getTeachDoc(name)).toBe(CONCEPT_DOCS[name]);
	});

	it("* 說清楚是 shell 的萬用字元、引號包住時不展開，並跟 grep 正規表示式的 * 區分", () => {
		const text = docText("*");
		expect(text).toContain("萬用字元");
		expect(text).toContain("任意");
		expect(text).toContain("引號");
		expect(text).toContain("grep");
		expect(text).toContain("正規表示式");
		expect(CONCEPT_DOCS["*"].examples.some((example) => example.command.includes("*"))).toBe(true);
	});

	it("Tab 說明補全指令與路徑，以及有好幾個候選時怎麼辦", () => {
		const text = docText("Tab");
		expect(text).toContain("補全");
		expect(text).toContain("路徑");
		expect(text).toContain("候選");
	});

	it(".. 是上一層目錄，~ 是家目錄", () => {
		expect(docText("..")).toContain("上一層");
		expect(docText("~")).toContain("家目錄");
		expect(docText("~")).toContain("/home/tech");
	});
});
