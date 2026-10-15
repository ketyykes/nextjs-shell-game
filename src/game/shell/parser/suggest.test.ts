// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	editDistance,
	findUnavailableProgram,
	suggestLowercaseCommand,
	suggestMissingSpace,
	suggestSimilarCommand,
} from "./suggest";

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

/** 跟 `ALL_COMMANDS` 一樣的註冊順序（拼字建議同分時照這個順序）。 */
const registeredCommands = [
	"pwd", "ls", "cd", "cat", "help", "hint", "man", "history", "clear",
	"head", "tail", "wc", "grep", "find",
	"mkdir", "touch", "cp", "mv", "rm",
	"echo", "sort", "uniq",
	"export", "env", "chmod",
	"ps", "top", "kill",
	"tree", "cut", "diff", "which", "less",
];

describe("editDistance", () => {
	it("相同字串距離是 0", () => {
		expect(editDistance("grep", "grep")).toBe(0);
	});

	it("插入、刪除、替換各算一次", () => {
		expect(editDistance("ls", "lsa")).toBe(1);
		expect(editDistance("cat", "ct")).toBe(1);
		expect(editDistance("cat", "cut")).toBe(1);
	});

	it("相鄰兩個字對調只算一次", () => {
		expect(editDistance("gerp", "grep")).toBe(1);
		expect(editDistance("sl", "ls")).toBe(1);
		expect(editDistance("pdw", "pwd")).toBe(1);
		expect(editDistance("mkdri", "mkdir")).toBe(1);
	});

	it("一般情況照逐字比對累加", () => {
		expect(editDistance("xyz", "wc")).toBe(3);
		expect(editDistance("", "abc")).toBe(3);
		expect(editDistance("hsitroy", "history")).toBe(2);
	});
});

describe("suggestSimilarCommand", () => {
	it.each([
		["gerp", "grep"],
		["sl", "ls"],
		["cta", "cat"],
		["pdw", "pwd"],
		["mkdri", "mkdir"],
	])("%s 建議 %s", (input, expected) => {
		expect(suggestSimilarCommand(input, registeredCommands)).toBe(expected);
	});

	it("單一字元不猜", () => {
		expect(suggestSimilarCommand("l", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("x", registeredCommands)).toBeNull();
	});

	it("五個字以內只接受距離 1", () => {
		expect(suggestSimilarCommand("xyz", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("lsxx", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("gerpp", registeredCommands)).toBeNull();
	});

	it("六個字以上接受距離 2", () => {
		expect(suggestSimilarCommand("hsitroy", registeredCommands)).toBe("history");
	});

	it("只猜英文字母組成的名稱：路徑、萬用字元、底線、數字都不猜", () => {
		expect(suggestSimilarCommand("ca*", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("/usr/bin/cta", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("nonexistent_command", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("ls2", registeredCommands)).toBeNull();
		expect(suggestSimilarCommand("", registeredCommands)).toBeNull();
	});

	it("跟指令完全一樣不算打錯", () => {
		expect(suggestSimilarCommand("ls", registeredCommands)).toBeNull();
	});

	it("大寫的打錯字也猜得出來", () => {
		expect(suggestSimilarCommand("GERP", registeredCommands)).toBe("grep");
	});

	it("同分時已學的指令優先", () => {
		// ca 跟 cd、cat、cp 的距離都是 1
		expect(suggestSimilarCommand("ca", registeredCommands, ["pwd", "ls", "cat"])).toBe("cat");
	});

	it("同分而且學過與否一樣時照註冊順序", () => {
		expect(suggestSimilarCommand("ca", registeredCommands)).toBe("cd");
		expect(suggestSimilarCommand("ks", registeredCommands, ["ls", "ps"])).toBe("ls");
	});

	it("距離比較近的優先於已學的", () => {
		// hsitroy 跟 history 距離 2；學過的 ls 距離更遠，不會被選中
		expect(suggestSimilarCommand("hsitroy", registeredCommands, ["ls"])).toBe("history");
	});
});

describe("suggestLowercaseCommand", () => {
	it("換成小寫就是指令時回傳小寫的名稱", () => {
		expect(suggestLowercaseCommand("LS", registeredCommands)).toBe("ls");
		expect(suggestLowercaseCommand("Cd", registeredCommands)).toBe("cd");
	});

	it("本來就是小寫、或換成小寫也不是指令時回傳 null", () => {
		expect(suggestLowercaseCommand("ls", registeredCommands)).toBeNull();
		expect(suggestLowercaseCommand("GERP", registeredCommands)).toBeNull();
	});
});

describe("findUnavailableProgram", () => {
	it("常見的編輯器、套件管理、程式語言、網路工具各自歸類", () => {
		expect(findUnavailableProgram("vim")).toEqual({ kind: "editor" });
		expect(findUnavailableProgram("emacs")).toEqual({ kind: "editor" });
		expect(findUnavailableProgram("apt")).toEqual({ kind: "package" });
		expect(findUnavailableProgram("python")).toEqual({ kind: "language" });
		expect(findUnavailableProgram("ssh")).toEqual({ kind: "network" });
	});

	it("Windows 命令提示字元的指令帶上這裡對應的指令", () => {
		expect(findUnavailableProgram("dir")).toEqual({ kind: "windows", equivalent: "ls" });
		expect(findUnavailableProgram("cls")).toEqual({ kind: "windows", equivalent: "clear" });
	});

	it("大小寫不分", () => {
		expect(findUnavailableProgram("VIM")).toEqual({ kind: "editor" });
	});

	it("nano 是真的指令（4.22），不在清單裡", () => {
		expect(findUnavailableProgram("nano")).toBeNull();
		expect(findUnavailableProgram("NANO")).toBeNull();
	});

	it("不在清單裡的回傳 null", () => {
		expect(findUnavailableProgram("grep")).toBeNull();
		expect(findUnavailableProgram("xyz")).toBeNull();
	});
});
