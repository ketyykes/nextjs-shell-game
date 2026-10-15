// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createSandboxShell } from "@/game/sandbox/session";
import { createTestFs } from "@/game/shell/commands/testFixtures";
import { Shell } from "@/game/shell/shell";
import type { OutputEntry } from "@/game/store/types";
import {
	buildOutputFieldLegend,
	claimLegendAutoExpand,
	detectOutputFields,
	resetLegendAutoExpand,
	type OutputFieldLegend,
} from "./outputFields";

type CommandEntry = Extract<OutputEntry, { kind: "command" }>;

function commandEntry(input: string, lines: string[], isError = false): CommandEntry {
	return { kind: "command", id: "e-1", prompt: "crew@kepler9:~$", input, lines, isError };
}

/** 用真的 shell 執行，輸出格式就跟 ls.ts、ps.ts、top.ts、last.ts 一模一樣。 */
function run(shell: Shell, input: string): CommandEntry {
	const execution = shell.execute(input);
	return commandEntry(input, execution.lines, execution.isError);
}

/** 練習模式的檔案系統、程序清單與登入紀錄（每次都是新的 session）。 */
function sandboxRun(input: string): CommandEntry {
	return run(createSandboxShell(), input);
}

/** 主線的預設指令：沒有程序、`last` 是站上的登入紀錄（tech 還在線上）。 */
function stationRun(input: string): CommandEntry {
	const shell = new Shell({ fs: createTestFs(), terminalId: "ch1-t1", hints: [], learnedCommands: [] });
	return run(shell, input);
}

/** 欄位名稱對例子，方便一次比對整張表。 */
function examples(legend: OutputFieldLegend | null): Array<[string, string | null]> {
	if (legend === null) {
		return [];
	}
	return legend.rows.map((row) => [row.field, row.example]);
}

function descriptionOf(legend: OutputFieldLegend | null, field: string): string {
	const row = legend?.rows.find((candidate) => candidate.field === field);
	return row?.description ?? "";
}

describe("detectOutputFields", () => {
	it.each([
		["ls -l"],
		["ls -la"],
		["ls -al"],
		["ls -l -a"],
		["ls logs -l"],
		["ls -l logs archive"],
		["ls -l README.txt"],
	])("%s 是 ls -l 的詳細格式", (input) => {
		expect(detectOutputFields(sandboxRun(input))).toBe("ls-long");
	});

	it("合併寫法只要有 l 就算（-lt 這類以後才支援的旗標也一樣）", () => {
		const entry = commandEntry("ls -lt", ["total 1", "-rw-r--r--  tech  822  2027-08-14 05:30  README.txt"]);
		expect(detectOutputFields(entry)).toBe("ls-long");
	});

	it.each([["ls"], ["ls -a"], ["ls logs"]])("%s 沒有 -l，不標", (input) => {
		expect(detectOutputFields(sandboxRun(input))).toBeNull();
	});

	it("-- 之後的 -l 是路徑不是選項", () => {
		expect(detectOutputFields(commandEntry("ls -- -l", ["-l"]))).toBeNull();
	});

	it.each([
		["ps", "ps"],
		["ps aux", "ps"],
		["ps -ef", "ps"],
		["top", "top"],
		["last", "last"],
		["last tech", "last"],
	])("%s 是 %s 的表格", (input, expected) => {
		expect(detectOutputFields(sandboxRun(input))).toBe(expected);
	});

	it.each([["ps | grep drill"], ["ls -l | head -3"], ["top | sort"]])("管線最後是別的指令（%s）不標", (input) => {
		expect(detectOutputFields(sandboxRun(input))).toBeNull();
	});

	it("管線最後一個是 ls -l 就標", () => {
		expect(detectOutputFields(sandboxRun("echo hi | ls -l"))).toBe("ls-long");
	});

	it.each([
		["pwd ; ls -l", "ls-long"],
		["cd logs && ls -l", "ls-long"],
		["ls -l ;", "ls-long"],
		["pwd ; ps", "ps"],
	])("; 與 && 串起來時看最後一段（%s）", (input, expected) => {
		expect(detectOutputFields(sandboxRun(input))).toBe(expected);
	});

	it.each([["ls -l ; pwd"], ["ls -l && pwd"], ["ps ; pwd"]])("最後一段是別的指令（%s）不標", (input) => {
		expect(detectOutputFields(sandboxRun(input))).toBeNull();
	});

	it.each([["ls -l /nonexist"], ["top -b"], ["nosuch ; ps"], ["last -n 1"]])("錯誤輸出（%s）不標", (input) => {
		const entry = sandboxRun(input);
		expect(entry.isError).toBe(true);
		expect(detectOutputFields(entry)).toBeNull();
	});

	it("輸出被導向檔案、畫面上什麼都沒印時不標", () => {
		const entry = sandboxRun("ls -l > out.txt");
		expect(entry.lines).toEqual([]);
		expect(detectOutputFields(entry)).toBeNull();
	});

	it("最後一段導向檔案時，畫面上是前面幾段的輸出，不標", () => {
		const entry = sandboxRun("pwd ; ps > procs.txt");
		expect(entry.lines).toEqual(["/home/tech"]);
		expect(detectOutputFields(entry)).toBeNull();
	});

	it("解析不了的輸入（引號沒關、全形字元、空白）不標", () => {
		expect(detectOutputFields(commandEntry('ls -l "', ["x"]))).toBeNull();
		expect(detectOutputFields(commandEntry("ls　-l", ["x"]))).toBeNull();
		expect(detectOutputFields(commandEntry("   ", ["x"]))).toBeNull();
	});

	it("系統訊息與 NOVA 對話不標", () => {
		expect(detectOutputFields({ kind: "system", id: "s-1", lines: ["ls -l"] })).toBeNull();
		expect(detectOutputFields({ kind: "dialogue", id: "d-1", speaker: "NOVA", text: "ps" })).toBeNull();
	});
});

describe("buildOutputFieldLegend：ls -l", () => {
	it("例子取第一個一般檔案那一行，權限欄再拆成類型與三組 rwx", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -l"));

		expect(legend?.id).toBe("ls-long");
		expect(legend?.label).toBe("ls -l 欄位說明");
		expect(legend?.sampleLine).toBe("-rw-r--r--  tech   822  2027-08-14 05:30  README.txt");
		expect(examples(legend)).toEqual([
			["權限", "-rw-r--r--"],
			["第 1 碼", "-"],
			["第 2-4 碼", "rw-"],
			["第 5-7 碼", "r--"],
			["第 8-10 碼", "r--"],
			["擁有者", "tech"],
			["大小", "822"],
			["修改時間", "2027-08-14 05:30"],
			["名稱", "README.txt"],
		]);
		const details = legend?.rows.filter((row) => row.detail === true).map((row) => row.field);
		expect(details).toEqual(["第 1 碼", "第 2-4 碼", "第 5-7 碼", "第 8-10 碼"]);
	});

	it("拆開的四段分別說明類型、擁有者、群組、其他人，並連到 chmod", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -l"));

		expect(descriptionOf(legend, "第 1 碼")).toContain("d 是目錄");
		expect(descriptionOf(legend, "第 2-4 碼")).toContain("擁有者");
		expect(descriptionOf(legend, "第 5-7 碼")).toContain("群組");
		expect(descriptionOf(legend, "第 8-10 碼")).toContain("其他人");
		expect(legend?.notes.join("\n")).toContain("chmod");
	});

	it("total 那一行寫進補充說明，用這次輸出的數字", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -l"));
		expect(legend?.notes.some((note) => note.includes("total 7"))).toBe(true);
	});

	it("-la 跳過 ./ 與 ../，例子是第一個一般檔案（隱藏檔也算）", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -la"));
		expect(legend?.sampleLine).toBe("-rw-r--r--  tech   102  2027-08-14 05:30  .welcome");
	});

	it("全是目錄時用第一個目錄，類型是 d", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -l archive"));

		expect(legend?.sampleLine).toBe("drwxr-xr-x  tech  4096  2031-03-10 00:00  2027/");
		expect(examples(legend).slice(0, 5)).toEqual([
			["權限", "drwxr-xr-x"],
			["第 1 碼", "d"],
			["第 2-4 碼", "rwx"],
			["第 5-7 碼", "r-x"],
			["第 8-10 碼", "r-x"],
		]);
		expect(examples(legend).at(-1)).toEqual(["名稱", "2027/"]);
	});

	it("只剩 ./ 與 ../ 時才拿它們當例子", () => {
		const shell = createSandboxShell();
		shell.execute("mkdir empty_dir");
		const legend = buildOutputFieldLegend(run(shell, "ls -la empty_dir"));
		expect(legend?.sampleLine).toMatch(/ \.\/$/);
	});

	it("多個目錄：跳過「目錄名:」標題行與 total，補充說明提到標題行", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -l archive logs"));

		expect(legend?.sampleLine).toBe("-rw-r--r--  tech   774  2027-08-14 07:30  access.log");
		expect(legend?.notes.some((note) => note.includes("archive:"))).toBe(true);
		expect(legend?.notes.some((note) => note.includes("total 1"))).toBe(true);
	});

	it("列單一檔案沒有 total 行，補充說明也不提 total", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ls -l README.txt"));

		expect(legend?.sampleLine).toBe("-rw-r--r--  tech  822  2027-08-14 05:30  README.txt");
		expect(legend?.notes.some((note) => note.includes("total"))).toBe(false);
	});

	it("前面還有別段的輸出也找得到 ls -l 的那幾行", () => {
		const legend = buildOutputFieldLegend(sandboxRun("pwd ; ls -l"));
		expect(legend?.sampleLine).toBe("-rw-r--r--  tech   822  2027-08-14 05:30  README.txt");
	});

	it("空目錄只有 total 0，沒有欄位可以說明", () => {
		const shell = createSandboxShell();
		shell.execute("mkdir empty_dir");
		const entry = run(shell, "ls -l empty_dir");

		expect(entry.lines).toEqual(["total 0"]);
		expect(detectOutputFields(entry)).toBe("ls-long");
		expect(buildOutputFieldLegend(entry)).toBeNull();
	});
});

describe("buildOutputFieldLegend：ps 與 top", () => {
	it("ps 的例子是表頭下第一列", () => {
		const legend = buildOutputFieldLegend(sandboxRun("ps aux"));

		expect(legend?.id).toBe("ps");
		expect(legend?.label).toBe("ps 欄位說明");
		expect(legend?.sampleLine).toBe("  1  root   0.0   0.1  2027-08-14 05:29  /sbin/init");
		expect(examples(legend)).toEqual([
			["PID", "1"],
			["USER", "root"],
			["%CPU", "0.0"],
			["%MEM", "0.1"],
			["STARTED", "2027-08-14 05:29"],
			["COMMAND", "/sbin/init"],
		]);
		expect(descriptionOf(legend, "PID")).toContain("kill");
	});

	it("top 跳過標題與程序數，例子是最吃 CPU 的那一列（COMMAND 含參數）", () => {
		const legend = buildOutputFieldLegend(sandboxRun("top"));

		expect(legend?.id).toBe("top");
		expect(legend?.label).toBe("top 欄位說明");
		expect(legend?.sampleLine).toBe("880  tech  63.5   1.2  2027-08-14 05:31  /opt/drill/fan_test --loop");
		expect(examples(legend)).toEqual([
			["PID", "880"],
			["USER", "tech"],
			["%CPU", "63.5"],
			["%MEM", "1.2"],
			["STARTED", "2027-08-14 05:31"],
			["COMMAND", "/opt/drill/fan_test --loop"],
		]);
		expect(descriptionOf(legend, "%CPU")).toContain("由大到小");
	});

	it("前面還有別段的輸出也從表頭下面開始找", () => {
		const legend = buildOutputFieldLegend(sandboxRun("echo 1 2 3 ; ps"));
		expect(legend?.sampleLine).toBe("  1  root   0.0   0.1  2027-08-14 05:29  /sbin/init");
	});

	it("沒有任何程序、只有表頭時沒有例子可切，不給說明", () => {
		const entry = stationRun("ps");
		expect(entry.lines).toHaveLength(1);
		expect(buildOutputFieldLegend(entry)).toBeNull();
	});
});

describe("buildOutputFieldLegend：last", () => {
	it("例子優先取已經登出的那一列，看得到登出時間與時長", () => {
		const legend = buildOutputFieldLegend(sandboxRun("last"));

		expect(legend?.id).toBe("last");
		expect(legend?.label).toBe("last 欄位說明");
		expect(legend?.sampleLine).toMatch(/^tech {5}tty1 +Fri Aug 13 21:00 - 22:10 {2}\(01:10\)$/);
		expect(examples(legend)).toEqual([
			["帳號", "tech"],
			["終端機", "tty1"],
			["登入時間", "Fri Aug 13 21:00"],
			["登出時間", "- 22:10"],
			["時長", "(01:10)"],
		]);
		expect(legend?.notes.join("\n")).toContain("wtmp begins");
	});

	it("只有還在線上的紀錄時，登出時間是 still logged in、時長沒有例子", () => {
		const legend = buildOutputFieldLegend(stationRun("last tech"));

		expect(examples(legend)).toEqual([
			["帳號", "tech"],
			["終端機", "tty1"],
			["登入時間", "Wed Mar 12 08:15"],
			["登出時間", "still logged in"],
			["時長", null],
		]);
	});

	it("查無紀錄的帳號只印結尾兩行，不給說明", () => {
		const entry = sandboxRun("last nobody");
		expect(entry.isError).toBe(false);
		expect(buildOutputFieldLegend(entry)).toBeNull();
	});
});

describe("buildOutputFieldLegend：不標的情況", () => {
	it("偵測不到就是 null", () => {
		expect(buildOutputFieldLegend(sandboxRun("ps | grep drill"))).toBeNull();
		expect(buildOutputFieldLegend(sandboxRun("ls -l /nonexist"))).toBeNull();
		expect(buildOutputFieldLegend({ kind: "system", id: "s-1", lines: ["total 1"] })).toBeNull();
	});
});

describe("claimLegendAutoExpand", () => {
	afterEach(resetLegendAutoExpand);

	it("每種說明只有第一次回 true，種類之間互不影響", () => {
		expect(claimLegendAutoExpand("ls-long")).toBe(true);
		expect(claimLegendAutoExpand("ls-long")).toBe(false);
		expect(claimLegendAutoExpand("ps")).toBe(true);
		expect(claimLegendAutoExpand("top")).toBe(true);
		expect(claimLegendAutoExpand("ps")).toBe(false);
	});

	it("reset 之後重新算", () => {
		expect(claimLegendAutoExpand("last")).toBe(true);
		resetLegendAutoExpand();
		expect(claimLegendAutoExpand("last")).toBe(true);
	});
});
