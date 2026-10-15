// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTestFs, WAKE_UP_CONTENT } from "./commands/testFixtures";
import { editorWrote, editorWroteFile, editorReadLines, commandIsLowercase, fsError, nanoOneEditorPerLine } from "./messages";
import { Shell } from "./shell";
import { HOME_DIR } from "./types";

/** nano（4.22）在 Shell 這一層：什麼時候開編輯器、存檔、離開時的執行結果。 */

function createShell(): Shell {
	return new Shell({
		fs: createTestFs(),
		terminalId: "ch1-t1",
		hints: ["第一段", "第二段", "第三段"],
		learnedCommands: ["pwd", "ls"],
	});
}

describe("Shell 的 nano 編輯請求", () => {
	it("nano 檔名：執行結果帶編輯請求，輸出區沒有內容、不算錯誤", () => {
		const execution = createShell().execute("nano wake_up.txt");

		expect(execution).toMatchObject({ input: "nano wake_up.txt", lines: [], isError: false });
		expect(execution.editor).toEqual({
			fileName: "wake_up.txt",
			content: WAKE_UP_CONTENT,
			notice: editorReadLines(3).join(""),
			cwd: HOME_DIR,
		});
	});

	it("放在管線中間或接重導向時不開編輯器，內容照 cat 輸出", () => {
		const shell = createShell();
		const piped = shell.execute("nano wake_up.txt | wc -l");
		const redirected = shell.execute("nano wake_up.txt > copy.txt");

		expect(piped.editor).toBeUndefined();
		expect(piped.lines).toEqual(createShell().execute("cat wake_up.txt | wc -l").lines);
		expect(redirected.editor).toBeUndefined();
		expect(redirected.lines).toEqual([]);
		expect(shell.fs.readFile(HOME_DIR, "copy.txt")).toBe(WAKE_UP_CONTENT);
	});

	it("接在管線最後：左邊的輸出放進沒有檔名的緩衝區", () => {
		const execution = createShell().execute("cat wake_up.txt | nano");

		expect(execution.editor).toMatchObject({ fileName: null, content: WAKE_UP_CONTENT });
	});

	it("開不了（目錄）算錯誤，沒有編輯請求", () => {
		const execution = createShell().execute("nano pod_01");

		expect(execution).toMatchObject({ isError: true, lines: fsError("EISDIR", "pod_01") });
		expect(execution.editor).toBeUndefined();
	});

	it("一行有兩個 nano：只開第一個，輸出區多一行說明，不算錯誤", () => {
		const execution = createShell().execute("nano a.txt ; nano b.txt");

		expect(execution.editor?.fileName).toBe("a.txt");
		expect(execution.lines).toEqual(nanoOneEditorPerLine());
		expect(execution.isError).toBe(false);
		expect(execution.segments?.map((segment) => segment.editor?.fileName)).toEqual(["a.txt", "b.txt"]);
	});

	it("同一行的其他段落照常執行；編輯請求記住開啟當下的工作目錄", () => {
		const shell = createShell();
		const execution = shell.execute("nano todo.txt ; cd /deck1");

		expect(shell.cwd).toBe("/deck1");
		expect(execution.editor?.cwd).toBe(HOME_DIR);
	});
});

describe("Shell.writeEditorFile", () => {
	it("相對路徑照開啟編輯器當下的工作目錄解析，不受同一行後面的 cd 影響", () => {
		const shell = createShell();
		const request = shell.execute("nano todo.txt ; cd /deck1").editor;
		if (request === undefined) {
			throw new Error("應該要有編輯請求");
		}

		const result = shell.writeEditorFile(request, "todo.txt", "換濾網");

		expect(result).toEqual({
			ok: true,
			write: { fileName: "todo.txt", path: "/home/tech/todo.txt", lineCount: 1 },
			status: editorWrote(1).join(""),
		});
		expect(shell.fs.readFile("/", "/home/tech/todo.txt")).toBe("換濾網\n");
	});
});

describe("Shell.finishEditor", () => {
	it("離開時的執行結果：input 是開編輯器那一行，lines 是寫入摘要，狀態是現況", () => {
		const shell = createShell();
		shell.execute("hint ; nano todo.txt ; cd /deck1");
		const write = { fileName: "todo.txt", path: "/home/tech/todo.txt", lineCount: 2 };

		const execution = shell.finishEditor("hint ; nano todo.txt ; cd /deck1", [write]);

		expect(execution).toEqual({
			input: "hint ; nano todo.txt ; cd /deck1",
			lines: editorWroteFile("todo.txt", 2),
			isError: false,
			clearScreen: false,
			cwd: "/deck1",
			env: shell.env,
			processes: shell.processes,
			// 這一行的 hint 已經在開編輯器那次算過了，離開時不再算
			hintUsed: false,
		});
	});

	it("不進指令歷史", () => {
		const shell = createShell();
		shell.execute("nano todo.txt");
		shell.finishEditor("nano todo.txt", [{ fileName: "todo.txt", path: "/home/tech/todo.txt", lineCount: 1 }]);

		expect(shell.historyEntries).toEqual(["nano todo.txt"]);
	});
});

describe("nano 是一般指令", () => {
	it("which 找得到 /usr/bin/nano", () => {
		expect(createShell().execute("which nano").lines).toEqual(["/usr/bin/nano"]);
	});

	it("打成大寫時提示指令名稱要小寫", () => {
		expect(createShell().execute("NANO notes.txt").lines).toEqual(commandIsLowercase("NANO", "nano"));
	});

	it("Tab 補得到 nano", () => {
		expect(createShell().complete("nan").completed).toBe("nano ");
	});
});
