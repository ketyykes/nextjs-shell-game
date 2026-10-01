// @vitest-environment node
import { describe, expect, it } from "vitest";
import { echoCommand } from "./echo";
import { createSystemContext } from "./systemFixtures";

describe("echo", () => {
	it("指令名稱是 echo", () => {
		expect(echoCommand.name).toBe("echo");
	});

	it("參數用一個空格接起來印成一行", () => {
		const result = echoCommand.run(["MAYDAY", "KEPLER-9"], createSystemContext());

		expect(result).toEqual({ ok: true, lines: ["MAYDAY KEPLER-9"] });
	});

	it("沒有參數時印一個空行", () => {
		expect(echoCommand.run([], createSystemContext())).toEqual({ ok: true, lines: [""] });
	});

	it("參數本身含空白（引號包住的字串）原樣保留", () => {
		const result = echoCommand.run(["MAYDAY  MAYDAY", "end"], createSystemContext());

		expect(result.lines).toEqual(["MAYDAY  MAYDAY end"]);
	});

	it("-n 會被吃掉，行為與不加相同", () => {
		expect(echoCommand.run(["-n", "hello"], createSystemContext())).toEqual({ ok: true, lines: ["hello"] });
	});

	it("只有 -n 時印一個空行", () => {
		expect(echoCommand.run(["-n"], createSystemContext())).toEqual({ ok: true, lines: [""] });
	});

	it("其他 -x 選項當成一般文字印出，不報錯", () => {
		expect(echoCommand.run(["-x", "test"], createSystemContext())).toEqual({ ok: true, lines: ["-x test"] });
	});

	it("-n 只在最前面才算旗標，後面的 -n 當一般文字", () => {
		expect(echoCommand.run(["a", "-n"], createSystemContext()).lines).toEqual(["a -n"]);
	});

	it("忽略 stdin", () => {
		const result = echoCommand.run(["hi"], createSystemContext({ stdin: ["from pipe"] }));

		expect(result).toEqual({ ok: true, lines: ["hi"] });
	});
});
