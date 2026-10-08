// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import {
	SANDBOX_BANNER,
	SANDBOX_ENV,
	SANDBOX_FS,
	SANDBOX_PROCESSES,
	SANDBOX_TIPS,
} from "./practice";
import { createSandboxShell } from "./session";

type SandboxShell = ReturnType<typeof createSandboxShell>;

function run(shell: SandboxShell, input: string): string[] {
	const execution = shell.execute(input);
	expect(execution.isError, `${input} 應該成功：${execution.lines.join("\n")}`).toBe(false);
	return execution.lines;
}

/** 快照裡每個檔案的內容，順便算檔案數。 */
function collectFileContents(snapshot: FsSnapshot): string[] {
	const contents: string[] = [];
	function visit(entry: FsSnapshotEntry) {
		if (typeof entry === "string") {
			contents.push(entry);
			return;
		}
		if (entry.$type === "file") {
			contents.push(entry.content as string);
			return;
		}
		if (entry.$type === "dir") {
			for (const child of Object.values(entry.children as FsSnapshot)) {
				visit(child);
			}
			return;
		}
		for (const child of Object.values(entry as FsSnapshot)) {
			visit(child);
		}
	}
	for (const entry of Object.values(snapshot)) {
		visit(entry);
	}
	return contents;
}

/** 沙盒裡玩家看得到的所有文字：檔案內容、檔名、歡迎行、練習建議、環境變數、程序指令列。 */
function collectSandboxTexts(): string[] {
	return [
		...collectFileContents(SANDBOX_FS),
		JSON.stringify(SANDBOX_FS),
		...SANDBOX_BANNER,
		...SANDBOX_TIPS,
		...Object.values(SANDBOX_ENV),
		...SANDBOX_PROCESSES.map((process) => process.command),
	];
}

describe("練習用檔案系統", () => {
	it("家目錄有隱藏檔：ls 看不到、ls -a 看得到", () => {
		const shell = createSandboxShell();
		const plain = run(shell, "ls").join("\n");
		const all = run(shell, "ls -a").join("\n");
		expect(plain).not.toMatch(/(^|\s)\.[a-z]/);
		expect(all).toMatch(/(^|\s)\.[a-z]/);
	});

	it("有三層以上的目錄可以練 cd 與 find", () => {
		const shell = createSandboxShell();
		const found = run(shell, "find . -name '*.txt'");
		const deepest = Math.max(...found.map((line) => line.split("/").length - 1));
		expect(deepest).toBeGreaterThanOrEqual(4);
	});

	it("日誌夠長，可以練 head、tail、wc、grep", () => {
		const shell = createSandboxShell();
		const [wcLine] = run(shell, "wc -l logs/sensors.log");
		expect(Number.parseInt(wcLine?.trim() ?? "0", 10)).toBeGreaterThanOrEqual(20);
		expect(run(shell, "head -n 3 logs/sensors.log")).toHaveLength(3);
		expect(run(shell, "tail -n 3 logs/sensors.log")).not.toEqual(run(shell, "head -n 3 logs/sensors.log"));
		expect(run(shell, "grep WARN logs/sensors.log").length).toBeGreaterThan(0);
		expect(run(shell, "grep ERROR logs/sensors.log").length).toBeGreaterThan(0);
	});

	it("存取紀錄有重複的行，sort | uniq -c 數得出次數", () => {
		const shell = createSandboxShell();
		const counts = run(shell, "sort logs/access.log | uniq -c").map((line) =>
			Number.parseInt(line.trim().split(/\s+/)[0] ?? "0", 10),
		);
		expect(Math.max(...counts)).toBeGreaterThan(1);
		// 排序後去重的行數比原檔少
		const [total] = run(shell, "wc -l logs/access.log");
		expect(counts.length).toBeLessThan(Number.parseInt(total?.trim() ?? "0", 10));
	});

	it("有一份鎖住的檔案，chmod 之後才讀得到", () => {
		const shell = createSandboxShell();
		expect(shell.execute("cat locked/vault.txt").isError).toBe(true);
		run(shell, "chmod 644 locked/vault.txt");
		expect(run(shell, "cat locked/vault.txt").length).toBeGreaterThan(0);
	});

	it("有萬用字元可以一次刪掉的暫存檔", () => {
		const shell = createSandboxShell();
		const before = run(shell, "ls trash").join(" ");
		expect(before.split(/\s+/).filter((name) => name.endsWith(".tmp")).length).toBeGreaterThanOrEqual(3);
		run(shell, "rm trash/*.tmp");
		expect(run(shell, "ls trash").join(" ")).not.toContain(".tmp");
	});

	it("環境變數有練習用的值，可以拿來 cd 與 echo", () => {
		const shell = createSandboxShell();
		expect(Object.keys(SANDBOX_ENV).length).toBeGreaterThanOrEqual(3);
		run(shell, "cd $LOG_DIR");
		expect(run(shell, "pwd")).toEqual([SANDBOX_ENV.LOG_DIR]);
		expect(run(shell, "env").join("\n")).toContain("LOG_DIR=");
	});

	it("程序清單有可以 kill 的、要 -9 才殺得掉的、殺不掉的", () => {
		expect(SANDBOX_PROCESSES.length).toBeGreaterThanOrEqual(5);
		const stubborn = SANDBOX_PROCESSES.find((process) => process.ignoresTerm === true);
		const guarded = SANDBOX_PROCESSES.find((process) => process.protected === true);
		const plain = SANDBOX_PROCESSES.find((process) => process.ignoresTerm !== true && process.protected !== true);
		expect(stubborn).toBeDefined();
		expect(guarded).toBeDefined();
		expect(plain).toBeDefined();

		const shell = createSandboxShell();
		run(shell, `kill ${plain?.pid}`);
		expect(run(shell, "ps").join("\n")).not.toContain(plain?.command);
		run(shell, `kill -9 ${stubborn?.pid}`);
		expect(run(shell, "ps").join("\n")).not.toContain(stubborn?.command);
		expect(shell.execute(`kill -9 ${guarded?.pid}`).isError).toBe(true);
	});

	it("大小合理：檔案數與總位元組都有上限", () => {
		const contents = collectFileContents(SANDBOX_FS);
		expect(contents.length).toBeGreaterThanOrEqual(15);
		expect(contents.length).toBeLessThanOrEqual(80);
		const bytes = contents.reduce((sum, content) => sum + new TextEncoder().encode(content).length, 0);
		expect(bytes).toBeLessThanOrEqual(40 * 1024);
	});
});

describe("沙盒文字規範", () => {
	it("不指涉性別（跟劇本同一條規則）", () => {
		const pattern = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;
		const offending = collectSandboxTexts().filter((text) => pattern.test(text));
		expect(offending).toEqual([]);
	});

	it("不劇透主線：不提 NOVA、阿彬、回滾、名單、冷凍艙、撤離", () => {
		const pattern = /NOVA|nova|阿彬|abin|回滾|rollback|名單|冷凍|pod_06|撤離|除役/;
		const offending = collectSandboxTexts().filter((text) => pattern.test(text));
		expect(offending).toEqual([]);
	});
});
