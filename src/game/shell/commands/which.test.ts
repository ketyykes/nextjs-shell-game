// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "../fs";
import { missingOperand, unknownOption, whichBuiltin, whichNotFound } from "../messages";
import type { CommandContext } from "../types";
import { HOME_DIR } from "../types";
import { DEFAULT_PATH, whichCommand } from "./which";
import { createContext as createBaseContext } from "./testFixtures";

const COMMANDS = ["ls", "cat", "cd", "export", "help", "history", "hint", "which", "grep"];

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return createBaseContext({
		availableCommands: COMMANDS,
		fs: VirtualFileSystem.fromSnapshot({
			home: {
				tech: {
					"run.sh": { $type: "file", content: "echo hi\n", mode: "rwxr-xr-x" },
					"notes.txt": "x\n",
				},
			},
		}),
		...overrides,
	});
}

describe("which 找指令的路徑", () => {
	it("指令名稱是 which", () => {
		expect(whichCommand.name).toBe("which");
	});

	it("一般指令在 /usr/bin", () => {
		expect(whichCommand.run(["ls"], createContext())).toEqual({ ok: true, lines: ["/usr/bin/ls"] });
	});

	it("可以一次查好幾個", () => {
		expect(whichCommand.run(["cat", "grep"], createContext()).lines).toEqual(["/usr/bin/cat", "/usr/bin/grep"]);
	});

	it("遊戲的 hint 裝在 /usr/local/bin", () => {
		expect(whichCommand.run(["hint"], createContext()).lines).toEqual(["/usr/local/bin/hint"]);
	});

	it("環境變數沒有 PATH 時用預設的 PATH", () => {
		expect(DEFAULT_PATH).toBe("/usr/local/bin:/usr/bin:/bin");
	});

	it("-a 列出 PATH 裡每一個找得到的位置（/bin 跟 /usr/bin 是同一個目錄）", () => {
		expect(whichCommand.run(["-a", "ls"], createContext()).lines).toEqual(["/usr/bin/ls", "/bin/ls"]);
	});

	it("照環境變數 PATH 的順序找，PATH 裡沒有的目錄就找不到", () => {
		const onlyBin = createContext({ env: { HOME: HOME_DIR, PATH: "/bin:/usr/local/bin" } });
		const onlyOpt = createContext({ env: { HOME: HOME_DIR, PATH: "/opt/nova/bin" } });

		expect(whichCommand.run(["ls"], onlyBin).lines).toEqual(["/bin/ls"]);
		expect(whichCommand.run(["ls"], onlyOpt)).toEqual({ ok: true, lines: whichNotFound("ls", "/opt/nova/bin", true) });
	});

	it("PATH 目錄結尾多一個 / 也認得", () => {
		const context = createContext({ env: { HOME: HOME_DIR, PATH: "/usr/bin/" } });

		expect(whichCommand.run(["cat"], context).lines).toEqual(["/usr/bin/cat"]);
	});
});

describe("which 找不到", () => {
	it("沒有這個指令時說明找不到，不算錯誤（跟 grep 沒符合一樣）", () => {
		expect(whichCommand.run(["vim"], createContext())).toEqual({
			ok: true,
			lines: whichNotFound("vim", DEFAULT_PATH, false),
		});
	});

	it("shell 內建指令沒有程式檔，說明它照樣能用", () => {
		for (const name of ["cd", "export", "help", "history"]) {
			expect(whichCommand.run([name], createContext())).toEqual({ ok: true, lines: whichBuiltin(name) });
		}
	});

	it("找得到與找不到混在一起時照順序印", () => {
		expect(whichCommand.run(["ls", "vim", "cat"], createContext()).lines).toEqual([
			"/usr/bin/ls",
			...whichNotFound("vim", DEFAULT_PATH, false),
			"/usr/bin/cat",
		]);
	});
});

describe("which 帶路徑的名稱", () => {
	it("含 / 時直接看那個檔案能不能執行", () => {
		expect(whichCommand.run(["./run.sh"], createContext()).lines).toEqual(["./run.sh"]);
		expect(whichCommand.run(["~/run.sh".replace("~", HOME_DIR)], createContext()).lines).toEqual([
			`${HOME_DIR}/run.sh`,
		]);
	});

	it("檔案不能執行或不存在時找不到", () => {
		expect(whichCommand.run(["./notes.txt"], createContext()).lines).toEqual(
			whichNotFound("./notes.txt", DEFAULT_PATH, false),
		);
		expect(whichCommand.run(["./nope"], createContext()).lines).toEqual(whichNotFound("./nope", DEFAULT_PATH, false));
	});
});

describe("which 用法錯誤", () => {
	it("沒給名稱", () => {
		expect(whichCommand.run([], createContext())).toEqual({
			ok: false,
			lines: missingOperand("which", "一個指令名稱，例如 which ls"),
		});
	});

	it("不認得的選項", () => {
		expect(whichCommand.run(["-s", "ls"], createContext())).toEqual({ ok: false, lines: unknownOption("which", "-s") });
	});
});
