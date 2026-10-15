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

describe("第十九場的語法概念：||、$( )、<、2>", () => {
	const SYNTAX_CONCEPTS = ["||", "$( )", "<", "2>"];

	it.each(SYNTAX_CONCEPTS)("%s 查得到說明，範例都用到這個語法", (name) => {
		expect(getTeachDoc(name)).toBe(CONCEPT_DOCS[name]);
		const symbol = name === "$( )" ? "$(" : name;
		expect(CONCEPT_DOCS[name].examples.every((example) => example.command.includes(symbol)), name).toBe(true);
	});

	it("|| 說明左邊失敗才做右邊，被接住的失敗不算錯誤，並跟 && 對照", () => {
		const text = docText("||");
		expect(text).toContain("失敗");
		expect(text).toContain("&&");
		expect(text).toContain("不算錯誤");
	});

	it("$( ) 說明把輸出塞進指令、反引號是舊寫法、雙引號內不切開，裡面是子 shell", () => {
		const text = docText("$( )");
		expect(text).toContain("輸出");
		expect(text).toContain("反引號");
		expect(text).toContain("雙引號");
		expect(text).toContain("cd");
	});

	it("< 說明從檔案讀輸入，跟直接給檔名的差別", () => {
		const text = docText("<");
		expect(text).toContain("讀");
		expect(text).toContain("sort data.txt");
	});

	it("2> 說明錯誤訊息、/dev/null、2>&1，並寫出遊戲裡失敗的指令整段都算錯誤訊息的限制", () => {
		const text = docText("2>");
		expect(text).toContain("錯誤訊息");
		expect(text).toContain("/dev/null");
		expect(text).toContain("2>&1");
		expect(text).toContain("仍然算");
		expect(text).toContain("整段");
	});
});
