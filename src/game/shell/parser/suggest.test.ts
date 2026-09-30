// @vitest-environment node
import { describe, expect, it } from "vitest";
import { suggestMissingSpace } from "./suggest";

const knownCommands = ["pwd", "ls", "cd", "cat", "help", "hint", "man", "history", "clear"];

describe("suggestMissingSpace", () => {
	it("cdmedbay 建議 cd + medbay", () => {
		expect(suggestMissingSpace("cdmedbay", knownCommands)).toEqual({ command: "cd", rest: "medbay" });
	});

	it("catwake_up.txt 建議 cat + wake_up.txt", () => {
		expect(suggestMissingSpace("catwake_up.txt", knownCommands)).toEqual({
			command: "cat",
			rest: "wake_up.txt",
		});
	});

	it("lspod_01 建議 ls + pod_01", () => {
		expect(suggestMissingSpace("lspod_01", knownCommands)).toEqual({ command: "ls", rest: "pod_01" });
	});

	it("剩餘字串可以是參數旗標", () => {
		expect(suggestMissingSpace("ls-la", knownCommands)).toEqual({ command: "ls", rest: "-la" });
	});

	it("剩餘字串可以是中文", () => {
		expect(suggestMissingSpace("cat日誌.txt", knownCommands)).toEqual({ command: "cat", rest: "日誌.txt" });
	});

	it("cd 本身不建議", () => {
		expect(suggestMissingSpace("cd", knownCommands)).toBeNull();
	});

	it("完全等於任何已知指令都不建議", () => {
		for (const command of knownCommands) {
			expect(suggestMissingSpace(command, knownCommands)).toBeNull();
		}
	});

	it("xyz 不建議", () => {
		expect(suggestMissingSpace("xyz", knownCommands)).toBeNull();
	});

	it("空字串不建議", () => {
		expect(suggestMissingSpace("", knownCommands)).toBeNull();
	});

	it("沒有已知指令時不建議", () => {
		expect(suggestMissingSpace("cdmedbay", [])).toBeNull();
	});

	it("多個符合時取最長的前綴", () => {
		expect(suggestMissingSpace("lsabc", ["ls", "lsa"])).toEqual({ command: "lsa", rest: "bc" });
	});

	it("完全等於某個指令時，即使有較短的前綴指令也不建議", () => {
		expect(suggestMissingSpace("lsab", ["ls", "lsab"])).toBeNull();
	});

	it("比輸入更長的指令不算前綴", () => {
		expect(suggestMissingSpace("lsa", ["ls", "lsab"])).toEqual({ command: "ls", rest: "a" });
	});

	it("指令清單順序不影響結果", () => {
		expect(suggestMissingSpace("historyx", ["history", "h", "hi"])).toEqual({ command: "history", rest: "x" });
		expect(suggestMissingSpace("historyx", ["hi", "h", "history"])).toEqual({ command: "history", rest: "x" });
	});

	it("大小寫不同不算前綴", () => {
		expect(suggestMissingSpace("CDmedbay", knownCommands)).toBeNull();
	});

	it("忽略清單中的空字串指令名", () => {
		expect(suggestMissingSpace("xyz", ["", "ls"])).toBeNull();
	});
});
