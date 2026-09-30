// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CommandHistory } from "./history";

describe("CommandHistory", () => {
	it("push 之後 entries 依輸入順序列出", () => {
		const history = new CommandHistory();
		history.push("pwd");
		history.push("ls");
		expect(history.entries()).toEqual(["pwd", "ls"]);
	});

	it("空白輸入不會被記錄", () => {
		const history = new CommandHistory();
		history.push("");
		history.push("   ");
		expect(history.entries()).toEqual([]);
	});

	it("連續相同的指令只記一次", () => {
		const history = new CommandHistory();
		history.push("ls");
		history.push("ls");
		history.push("pwd");
		history.push("ls");
		expect(history.entries()).toEqual(["ls", "pwd", "ls"]);
	});

	it("push 會去掉前後空白", () => {
		const history = new CommandHistory();
		history.push("  cat wake_up.txt  ");
		expect(history.entries()).toEqual(["cat wake_up.txt"]);
	});

	it("沒有歷史時 up 回傳 null、down 回傳空字串", () => {
		const history = new CommandHistory();
		expect(history.up()).toBeNull();
		expect(history.down()).toBe("");
	});

	it("up 從最新一筆往回走，到最舊會停住", () => {
		const history = new CommandHistory(["pwd", "ls", "cat a"]);
		expect(history.up()).toBe("cat a");
		expect(history.up()).toBe("ls");
		expect(history.up()).toBe("pwd");
		expect(history.up()).toBe("pwd");
	});

	it("down 往新的方向走，超過最新一筆回到空白", () => {
		const history = new CommandHistory(["pwd", "ls"]);
		history.up();
		history.up();
		expect(history.down()).toBe("ls");
		expect(history.down()).toBe("");
		expect(history.down()).toBe("");
	});

	it("push 之後游標重置，再按 up 拿到最新一筆", () => {
		const history = new CommandHistory(["pwd", "ls"]);
		history.up();
		history.up();
		history.push("cat a");
		expect(history.up()).toBe("cat a");
	});

	it("超過上限時丟掉最舊的一筆", () => {
		const history = new CommandHistory([], 2);
		history.push("a");
		history.push("b");
		history.push("c");
		expect(history.entries()).toEqual(["b", "c"]);
	});

	it("entries 回傳的是拷貝，改它不影響內部", () => {
		const history = new CommandHistory(["pwd"]);
		const list = history.entries();
		list.push("hack");
		expect(history.entries()).toEqual(["pwd"]);
	});
});
