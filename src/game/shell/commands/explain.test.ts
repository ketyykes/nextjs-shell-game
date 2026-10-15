// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "@/game/chapters";
import { SOLUTIONS } from "@/game/chapters/solutions";
import { createSandboxShell } from "@/game/sandbox/session";
import { anyCommandIs, createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import type { TerminalDefinition } from "@/game/story/types";
import { ALL_COMMANDS } from ".";
import { VirtualFileSystem } from "../fs";
import { parseError } from "../messages";
import { Shell } from "../shell";
import type { CommandContext, CommandDefinition, ProcessInfo } from "../types";
import { COMMAND_DOCS } from "./docs";
import { CONCEPT_DOCS } from "./docsConcepts";
import { COMMAND_ARGS } from "./docsOptions";
import { explainCommand, explainTargetOf } from "./explain";
import { createContext, createTestFs } from "./testFixtures";

const COMMAND_NAMES = ALL_COMMANDS.map((command) => command.name);

const PROCESSES: ProcessInfo[] = [
	{ pid: 42, user: "tech", cpu: 0.1, mem: 0.1, started: "2031-03-12T08:15:00Z", command: "-sh" },
];

const ENV = { HOME: "/home/tech", USER: "tech", PWD: "/home/tech", NOVA_DIR: "/opt/nova" };

function context(overrides: Partial<CommandContext> = {}): CommandContext {
	return createContext({ availableCommands: COMMAND_NAMES, env: ENV, processes: PROCESSES, ...overrides });
}

/** 說明一行指令，順便確認 explain 永遠成功。 */
function explain(line: string, overrides: Partial<CommandContext> = {}): string[] {
	const result = explainCommand.run([line], context(overrides));
	expect(result.ok).toBe(true);
	return result.lines;
}

/** 指令那一行：名稱加兩個空白加 man 的一句話說明。 */
function commandLine(name: string, indent = ""): string {
	return `${indent}${name}  ${COMMAND_DOCS[name].summary}`;
}

/** 某個指令某個選項的一句話說明。 */
function optionSummary(command: string, option: string): string {
	const found = COMMAND_ARGS[command].options.find((item) => item.short === option);
	if (found === undefined) {
		throw new Error(`${command} 沒有 ${option}`);
	}
	return found.summary;
}

describe("explainTargetOf：一行開頭是 explain 時取出後面的原文", () => {
	it("取出 explain 後面整段原文，|、>、; 都不拆", () => {
		expect(explainTargetOf("explain ls -la | grep x > out ; pwd")).toBe("ls -la | grep x > out ; pwd");
	});

	it("前面的空白與 explain 後面多的空白都略過，Tab 也算空白", () => {
		expect(explainTargetOf("  explain   ls")).toBe("ls");
		expect(explainTargetOf("explain\tls")).toBe("ls");
	});

	it("只有 explain 時是空字串", () => {
		expect(explainTargetOf("explain")).toBe("");
		expect(explainTargetOf("explain   ")).toBe("");
	});

	it("explain 不在開頭、或只是名稱的一部分時不算", () => {
		expect(explainTargetOf("ls explain")).toBeNull();
		expect(explainTargetOf("explainer ls")).toBeNull();
		expect(explainTargetOf("explain;ls")).toBeNull();
	});

	it("explain 後面接全形空白不算（交給 shell 照常報全形字元）", () => {
		expect(explainTargetOf("explain　ls")).toBeNull();
	});
});

describe("explain 的基本形式", () => {
	it("名稱是 explain", () => {
		expect(explainCommand.name).toBe("explain");
	});

	it("不帶參數印用法", () => {
		const lines = explain("");
		expect(lines[0]).toBe("用法：explain <一整行指令>");
		expect(explainCommand.run([], context()).lines).toEqual(lines);
		expect(explain("   ")).toEqual(lines);
	});

	it("指令一行、選項與參數往內縮一層，-la 拆成兩個選項", () => {
		expect(explain("ls -la /home")).toEqual([
			commandLine("ls"),
			`  -l  ${optionSummary("ls", "-l")}`,
			`  -a  ${optionSummary("ls", "-a")}`,
			"  目錄 /home",
		]);
	});

	it("管線與重導向各自一行，符號說明用概念字典的一句話", () => {
		expect(explain("ls -la /home | grep abin > out.txt")).toEqual([
			commandLine("ls"),
			`  -l  ${optionSummary("ls", "-l")}`,
			`  -a  ${optionSummary("ls", "-a")}`,
			"  目錄 /home",
			`|  ${CONCEPT_DOCS["|"].summary}`,
			commandLine("grep"),
			"  樣式 abin",
			`>  ${CONCEPT_DOCS[">"].summary}`,
			"  檔案 out.txt（目前不存在，會建立）",
		]);
	});

	it("用 ; 與 && 串的好幾段：每段先印原文，連接符號自己一行", () => {
		expect(explain("cd /deck1 && ls -a ; pwd")).toEqual([
			"cd /deck1",
			commandLine("cd", "  "),
			"    目錄 /deck1",
			"&&  前一段成功了才執行下一段",
			"ls -a",
			commandLine("ls", "  "),
			`    -a  ${optionSummary("ls", "-a")}`,
			";  不管前一段成功還是失敗，都接著執行下一段",
			"pwd",
			commandLine("pwd", "  "),
		]);
	});

	it("explain 只說明不執行：檔案系統、工作目錄、變數都不變", () => {
		const ctx = context();
		const before = JSON.stringify(ctx.fs.serialize());
		const result = explainCommand.run(["rm -rf /home ; cd /deck1 ; export HOME=/x ; kill -9 42"], ctx);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(ctx.fs.serialize())).toBe(before);
		expect(result.nextCwd).toBeUndefined();
		expect(result.nextEnv).toBeUndefined();
		expect(result.nextProcesses).toBeUndefined();
	});

	it("語法錯誤或不支援的寫法印既有的解析錯誤說明，但仍然成功", () => {
		expect(explain("ls || pwd")).toEqual(parseError({ code: "UNSUPPORTED_SYNTAX", detail: "||" }));
		expect(explain('cat "wake')).toEqual(parseError({ code: "UNCLOSED_QUOTE", detail: '"' }));
		expect(explain("ls |")).toEqual(parseError({ code: "EMPTY_COMMAND", detail: "|" }));
	});
});

describe("explain 的選項", () => {
	it("接值的選項把值一起說：分開寫、黏在一起寫都認得", () => {
		const summary = optionSummary("head", "-n");
		expect(explain("head -n 3 wake_up.txt")).toEqual([
			commandLine("head"),
			`  -n 3  ${summary}（行數：3）`,
			"  檔案 wake_up.txt",
		]);
		expect(explain("head -n3 wake_up.txt")[1]).toBe(`  -n3  ${summary}（行數：3）`);
	});

	it("head 的 -5 是 -n 5 的簡寫", () => {
		expect(explain("tail -5 wake_up.txt")[1]).toBe(`  -5  ${optionSummary("tail", "-n")}（等於 -n 5）`);
	});

	it("合併寫法裡接值的字母放最後時吃下一個參數（tree -dL 2、cut -sf 2）", () => {
		expect(explain("tree -dL 2")).toEqual([
			commandLine("tree"),
			`  -d  ${optionSummary("tree", "-d")}`,
			`  -L 2  ${optionSummary("tree", "-L")}（層數：2）`,
		]);
		expect(explain("cut -d , -sf2 crew.csv")).toEqual([
			commandLine("cut"),
			`  -d ,  ${optionSummary("cut", "-d")}（分隔字元：,）`,
			`  -s  ${optionSummary("cut", "-s")}`,
			`  -f2  ${optionSummary("cut", "-f")}（欄位：2）`,
			"  參數 crew.csv（目前不存在）",
		]);
	});

	it("一個 dash 的多字母選項（find -name、-type）整個認，值只有固定幾種時說那一種的意思", () => {
		expect(explain('find . -name "*.txt" -type d')).toEqual([
			commandLine("find"),
			"  目錄 .",
			`  -name *.txt  ${optionSummary("find", "-name")}（樣式：*.txt）`,
			"    （有引號或 \\ 擋住，* 和 ? 不會被 shell 展開，原樣交給指令）",
			"  -type d  只找目錄",
		]);
		expect(explain("find . -type x")[2]).toBe(`  -type x  ${optionSummary("find", "-type")}（x 不能用，只能是 f 或 d）`);
	});

	it("不認得的選項說這個指令沒有，不當成參數", () => {
		expect(explain("ls -z")).toEqual([commandLine("ls"), "  -z  （這個指令沒有這個選項）"]);
		expect(explain("ls -lz")).toEqual([
			commandLine("ls"),
			`  -l  ${optionSummary("ls", "-l")}`,
			"  -z  （這個指令沒有這個選項）",
		]);
		expect(explain("cat -n wake_up.txt")[1]).toBe("  -n  （這個指令沒有這個選項）");
		expect(explain("ls --all")[1]).toBe("  --all  （這個指令沒有這個選項）");
	});

	it("接值的選項後面沒有值時說少了什麼", () => {
		expect(explain("head -n")[1]).toBe(`  -n  ${optionSummary("head", "-n")}（後面少了行數）`);
	});

	it("-- 之後的都是參數", () => {
		expect(explain("ls -- -a")).toEqual([
			commandLine("ls"),
			"  --  選項到這裡為止，後面的都當成參數，就算是 - 開頭",
			"  參數 -a（目前不存在）",
		]);
	});

	it("echo 只認開頭的 -n，後面的 -n 與不認得的 -x 都是要印的文字", () => {
		expect(explain("echo -n hi -n")).toEqual([
			commandLine("echo"),
			`  -n  ${optionSummary("echo", "-n")}`,
			"  文字 hi",
			"  文字 -n",
		]);
		expect(explain("echo -e x")).toEqual([commandLine("echo"), "  文字 -e", "  文字 x"]);
	});

	it("kill 的訊號是選項，後面的數字是程序編號，查得到時附上是哪個程序", () => {
		expect(explain("kill -9 42 7")).toEqual([
			commandLine("kill"),
			`  -9  ${optionSummary("kill", "-9")}`,
			"  程序編號 42（-sh）",
			"  程序編號 7（目前沒有這個程序）",
		]);
	});
});

describe("explain 的參數", () => {
	it("存在的檔案、目錄與不存在的參數", () => {
		expect(explain("cat wake_up.txt pod_01 nope.txt")).toEqual([
			commandLine("cat"),
			"  檔案 wake_up.txt",
			"  目錄 pod_01",
			"  參數 nope.txt（目前不存在）",
		]);
	});

	it("路徑相對目前的工作目錄查", () => {
		expect(explain("cat status.txt", { cwd: "/deck1/systems/power" })[1]).toBe("  檔案 status.txt");
	});

	it("不是路徑的參數照它的角色說：樣式、文字、權限、帳號、指令", () => {
		expect(explain("grep -i abin wake_up.txt")).toEqual([
			commandLine("grep"),
			`  -i  ${optionSummary("grep", "-i")}`,
			"  樣式 abin",
			"  檔案 wake_up.txt",
		]);
		expect(explain("echo hi")[1]).toBe("  文字 hi");
		expect(explain("chmod -r wake_up.txt")).toEqual([commandLine("chmod"), "  權限 -r", "  檔案 wake_up.txt"]);
		expect(explain("id abin")[1]).toBe("  帳號 abin");
		expect(explain("man ls")[1]).toBe(`  指令 ls：${COMMAND_DOCS.ls.summary}`);
		expect(explain("which nope")[1]).toBe("  指令 nope（找不到這個指令）");
	});

	it("export 與 unset 說變數，附上目前的值", () => {
		expect(explain("export A=1 B= HOME")).toEqual([
			commandLine("export"),
			"  設定變數 A，值是 1",
			"  設定變數 B，值是空的",
			"  變數 HOME（目前的值是 /home/tech）",
		]);
		expect(explain("unset -v NOPE")).toEqual([
			commandLine("unset"),
			`  -v  ${optionSummary("unset", "-v")}`,
			"  變數 NOPE（目前沒有這個變數）",
		]);
	});

	it("不看參數的指令說加了也一樣，不接參數的指令說不接", () => {
		expect(explain("ps aux")[1]).toBe("  aux  （ps 不看參數，加了結果也一樣）");
		expect(explain("whoami x")[1]).toBe("  x  （whoami 不接參數）");
	});

	it("$變數 不展開，說它是變數並印目前的值", () => {
		const summary = CONCEPT_DOCS.$變數.summary;
		expect(explain('echo "$NOVA_DIR/"')).toEqual([
			commandLine("echo"),
			"  文字 $NOVA_DIR/",
			`    $NOVA_DIR  ${summary}；目前的值是 /opt/nova`,
		]);
		expect(explain("cd ${NOVA_DIR}")).toEqual([
			commandLine("cd"),
			"  參數 ${NOVA_DIR}",
			`    \${NOVA_DIR}  ${summary}；目前的值是 /opt/nova`,
		]);
		expect(explain("echo $NOPE")[2]).toBe(`    $NOPE  ${summary}；目前沒有這個變數，會換成空字串`);
	});

	it("單引號裡的 $ 不是變數", () => {
		expect(explain("echo '$HOME'")).toEqual([
			commandLine("echo"),
			"  文字 $HOME",
			"    （$ 被單引號或 \\ 擋住，不會換成變數的值）",
		]);
	});

	it("開頭的 ~ 說是家目錄；引號裡的 ~ 不是", () => {
		expect(explain("cat ~/wake_up.txt")).toEqual([
			commandLine("cat"),
			"  檔案 ~/wake_up.txt",
			`    ~  ${CONCEPT_DOCS["~"].summary}，也就是 /home/tech`,
		]);
		expect(explain('echo "~"')).toEqual([commandLine("echo"), "  文字 ~"]);
	});

	it("路徑裡的 .. 說是上一層", () => {
		expect(explain("cd ..")).toEqual([commandLine("cd"), "  目錄 ..", `    ..  ${CONCEPT_DOCS[".."].summary}`]);
	});

	it("沒有引號的 * 與 ? 說是萬用字元，並列出目前對得上的檔名", () => {
		expect(explain("ls pod_0*")).toEqual([
			commandLine("ls"),
			"  參數 pod_0*",
			`    *  ${CONCEPT_DOCS["*"].summary}`,
			"    目前對得上 6 個：pod_01、pod_02、pod_03、pod_04、pod_05……",
		]);
		expect(explain("cat wake_up.tx?")).toEqual([
			commandLine("cat"),
			"  參數 wake_up.tx?",
			"    ?  萬用字元，代表任意一個字",
			"    目前對得上 1 個：wake_up.txt",
		]);
		expect(explain("cat *.nope")[3]).toBe("    目前沒有對得上的檔名，會原樣交給指令");
	});

	it("重導向的目標：已存在的檔案、接在結尾、目錄、含變數", () => {
		expect(explain("echo hi > wake_up.txt").slice(-1)).toEqual(["  檔案 wake_up.txt（原本的內容會被蓋掉）"]);
		expect(explain("echo hi >> wake_up.txt").slice(-2)).toEqual([
			`>>  ${CONCEPT_DOCS[">>"].summary}`,
			"  檔案 wake_up.txt（新的內容接在結尾）",
		]);
		expect(explain("echo hi > pod_01").slice(-1)).toEqual(["  目錄 pod_01（不能把輸出寫進目錄）"]);
		expect(explain("echo hi > $NOVA_DIR/x").slice(-2)).toEqual([
			"  檔案 $NOVA_DIR/x",
			`    $NOVA_DIR  ${CONCEPT_DOCS.$變數.summary}；目前的值是 /opt/nova`,
		]);
	});
});

describe("explain 的指令", () => {
	it("找不到的指令：打錯字或大小寫時建議最接近的指令", () => {
		expect(explain("gerp abin")).toEqual(["gerp  找不到這個指令，你是不是想打 grep？"]);
		expect(explain("LS")).toEqual(["LS  找不到這個指令，你是不是想打 ls？"]);
		expect(explain("xyzzy")).toEqual(["xyzzy  找不到這個指令，輸入 help 看看目前會的指令。"]);
	});

	it("sudo 與 explain 後面接的是另一個指令，往下一層說明它", () => {
		expect(explain("sudo rm -rf /")).toEqual([
			commandLine("sudo"),
			commandLine("rm", "  "),
			`    -r  ${optionSummary("rm", "-r")}`,
			`    -f  ${optionSummary("rm", "-f")}`,
			"    目錄 /",
		]);
		expect(explain("explain ls")).toEqual([commandLine("explain"), commandLine("ls", "  ")]);
	});
});

/** 站在第一章測試檔案系統家目錄的 shell。 */
function createShell(commands: CommandDefinition[] = ALL_COMMANDS): Shell {
	return new Shell(
		{ fs: createTestFs(), terminalId: "ch1-t1", hints: ["提示一"], learnedCommands: [], env: { NOVA_DIR: "/opt/nova" } },
		commands,
	);
}

describe("explain 在 shell 裡（一行的開頭是 explain）", () => {
	it("整行原文交給 explain：| 後面的指令只被說明，不會執行", () => {
		const shell = createShell();
		const execution = shell.execute("explain ls | wc -l");

		expect(execution.isError).toBe(false);
		expect(execution.lines).toEqual(explainCommand.run(["ls | wc -l"], context()).lines);
		expect(execution.lines).toContain(`|  ${CONCEPT_DOCS["|"].summary}`);
		expect(shell.historyEntries).toEqual(["explain ls | wc -l"]);
	});

	it("被說明的那一行什麼都不做：不刪檔、不換目錄、不改變數、不寫重導向的檔案", () => {
		const shell = createShell();
		const before = JSON.stringify(shell.fs.serialize());
		const execution = shell.execute("explain rm -rf /home ; cd /deck1 && export NOVA_DIR= ; echo x > made.txt");

		expect(execution.isError).toBe(false);
		expect(JSON.stringify(shell.fs.serialize())).toBe(before);
		expect(shell.cwd).toBe("/home/tech");
		expect(shell.env.NOVA_DIR).toBe("/opt/nova");
	});

	it("segments 是空陣列：被說明的那一行一段都沒有執行", () => {
		expect(createShell().execute("explain cd /deck1 && pwd").segments).toEqual([]);
	});

	it("$變數 與 ~ 交給 explain 說明，不會先被 shell 展開", () => {
		const lines = createShell().execute("explain cat $NOVA_DIR/x ~/y").lines;

		expect(lines).toContain("  參數 $NOVA_DIR/x");
		expect(lines).toContain("  參數 ~/y（目前不存在）");
	});

	it("語法錯誤印解析錯誤的說明，但不算錯誤", () => {
		const execution = createShell().execute("explain ls || pwd");

		expect(execution.isError).toBe(false);
		expect(execution.lines).toEqual(parseError({ code: "UNSUPPORTED_SYNTAX", detail: "||" }));
	});

	it("只打 explain 印用法；前面有空白也認得", () => {
		const usage = explainCommand.run([], context()).lines;
		expect(createShell().execute("explain").lines).toEqual(usage);
		expect(createShell().execute("   explain   ").lines).toEqual(usage);
		expect(createShell().execute("  explain ls")).toMatchObject({ isError: false, lines: [commandLine("ls")] });
	});

	it("說明 hint 不會用掉提示", () => {
		const shell = createShell();
		const execution = shell.execute("explain hint");

		expect(execution.hintUsed).toBe(false);
		expect(shell.hintCount).toBe(0);
	});

	it("explain 不在一行開頭時照一般指令執行，說明它拿到的參數", () => {
		const execution = createShell().execute("pwd ; explain ls -a");

		expect(execution.segments).toHaveLength(2);
		expect(execution.lines).toEqual(["/home/tech", commandLine("ls"), `  -a  ${optionSummary("ls", "-a")}`]);
	});

	it("這台終端機沒有 explain 時照一般流程，找不到指令", () => {
		const withoutExplain = ALL_COMMANDS.filter((command) => command.name !== "explain");
		expect(createShell(withoutExplain).execute("explain ls").isError).toBe(true);
	});

	it("沙盒練習模式也能用", () => {
		const execution = createSandboxShell().execute("explain ls -a");

		expect(execution.isError).toBe(false);
		expect(execution.lines).toEqual([commandLine("ls"), `  -a  ${optionSummary("ls", "-a")}`]);
	});

	it("目標判定不會把被說明的那一行當成跑過（不能拿 explain 湊過關）", () => {
		const terminal: TerminalDefinition = {
			id: "ch1-t1",
			title: "測試",
			roomId: "cryo",
			teaches: [],
			fs: {},
			hints: ["提示"],
			// 判定會把整行重新解析：不擋的話 `explain ls | wc -l` 解析出來的管線裡也有 wc
			objective: { title: "目標", check: anyCommandIs("wc") },
		};
		const shell = createShell();
		const judge = (input: string): boolean => {
			const execution = shell.execute(input);
			return evaluateObjective(terminal, createObjectiveContext(terminal.id, execution, shell.fs, shell.home));
		};

		expect(judge("explain ls | wc -l")).toBe(false);
		expect(judge("ls | wc -l")).toBe(true);
	});
});

describe("explain 說明六章的每一行正解", () => {
	const terminals = CHAPTERS.flatMap((chapter) => chapter.terminals);

	it.each(terminals.map((terminal) => [terminal.id, terminal] as const))("%s", (_id, terminal) => {
		const shell = new Shell({
			fs: VirtualFileSystem.fromSnapshot(terminal.fs),
			terminalId: terminal.id,
			hints: terminal.hints,
			learnedCommands: [],
			cwd: terminal.initialCwd,
			env: terminal.env,
			processes: terminal.processes,
			readonlyEnv: terminal.readonlyEnv,
		});

		for (const line of SOLUTIONS[terminal.id]) {
			const before = JSON.stringify(shell.toState());
			const execution = shell.execute(`explain ${line}`);
			const output = execution.lines.join("\n");

			expect(execution.isError, line).toBe(false);
			expect(execution.lines.length, line).toBeGreaterThan(0);
			expect(output, line).not.toContain("這個指令沒有這個選項");
			expect(output, line).not.toContain("找不到這個指令");
			// explain 那一行會進歷史，其餘狀態都不能變
			const after = shell.toState();
			expect(JSON.stringify({ ...after, history: after.history.slice(0, -1) }), line).toBe(before);

			// 真的執行一次，下一行才看得到這一行的結果（例如 mkdir 之後 cd 進去）
			shell.execute(line);
		}
	});
});
