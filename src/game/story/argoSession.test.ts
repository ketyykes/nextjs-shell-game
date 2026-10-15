// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_COMMANDS } from "@/game/shell/commands";
import { argoCannotExit, argoNoSuchUser, argoProcessProtected, argoSudoDenied } from "@/game/shell/messages";
import { ABIN_NOTES } from "./abinNotes";
import { ARGO_TIPS, ARGO_TOP_TITLE, type ArgoProgress } from "./argo";
import { ARGO_TERMINAL_ID, createArgoShell } from "./argoSession";

const NO_PROGRESS: ArgoProgress = { found: [], reply: null };
const NOVA_COMMAND = "nova --restore /mnt/upload/kepler9/core.part";

/** 執行一行並回傳輸出，順便確認沒有失敗。 */
function run(shell: ReturnType<typeof createArgoShell>, input: string): string[] {
	const execution = shell.execute(input);
	expect(execution.isError, `${input} 應該成功：${execution.lines.join("\n")}`).toBe(false);
	return execution.lines;
}

/** 找到 nova 程序的 PID。 */
function novaPid(shell: ReturnType<typeof createArgoShell>): number {
	const nova = shell.processes.find((process) => process.command === NOVA_COMMAND);
	expect(nova).toBeDefined();
	return nova?.pid ?? 0;
}

describe("createArgoShell", () => {
	it("救援船專用的終端機 id，起點在家目錄，提示符是 tech@argo", () => {
		const shell = createArgoShell(NO_PROGRESS);
		expect(shell.terminalId).toBe(ARGO_TERMINAL_ID);
		expect(shell.cwd).toBe("/home/tech");
		expect(shell.prompt()).toBe("tech@argo:~$");
	});

	it("所有已註冊的指令都可以用，help 全部列出", () => {
		const shell = createArgoShell(NO_PROGRESS);
		const output = run(shell, "help").join("\n");
		for (const command of ALL_COMMANDS) {
			expect(output).toContain(command.name);
		}
	});

	it("上傳的 abin/ 依進度列出找到的留言與回信", () => {
		const empty = createArgoShell(NO_PROGRESS);
		expect(run(empty, "ls /mnt/upload/kepler9")).toEqual(expect.arrayContaining([expect.stringContaining("abin")]));
		expect(run(empty, "ls /mnt/upload/kepler9/abin").join("").trim()).toBe("");

		const full = createArgoShell({ found: ABIN_NOTES.map((note) => note.id), reply: "我是真的。" });
		const listing = run(full, "ls /mnt/upload/kepler9/abin").join(" ");
		expect(listing.split(/\s+/).filter((name) => name !== "")).toHaveLength(ABIN_NOTES.length + 1);
		expect(run(full, "cat /mnt/upload/kepler9/abin/reply.txt")).toEqual(["我是真的。"]);
	});

	it("每次呼叫都是全新的環境，刪掉的檔案下次還在", () => {
		const first = createArgoShell(NO_PROGRESS);
		run(first, "rm /var/log/argo/rescue.log");
		const second = createArgoShell(NO_PROGRESS);
		expect(run(second, "ls /var/log/argo")).toEqual(["rescue.log"]);
	});
});

describe("nova 程序", () => {
	it("ps 看得到 nova 在還原 core.part，執行者是 unknown", () => {
		const shell = createArgoShell(NO_PROGRESS);
		const row = run(shell, "ps").find((line) => line.includes(NOVA_COMMAND));
		expect(row).toMatch(/unknown/);
	});

	it("top 的標題是 ARGO，nova 排在最上面", () => {
		const shell = createArgoShell(NO_PROGRESS);
		const lines = run(shell, "top");
		expect(lines[0]).toBe(ARGO_TOP_TITLE);
		expect(lines[4]).toContain(NOVA_COMMAND);
	});

	it("kill 與 kill -9 都沒有權限，nova 還在", () => {
		const shell = createArgoShell(NO_PROGRESS);
		const pid = novaPid(shell);
		for (const input of [`kill ${pid}`, `kill -9 ${pid}`, `sudo kill -9 ${pid}`]) {
			shell.execute(input);
		}
		expect(shell.execute(`kill -9 ${pid}`).lines).toEqual(argoProcessProtected(pid, NOVA_COMMAND));
		expect(argoProcessProtected(pid, NOVA_COMMAND).join("")).toContain("沒有權限");
		expect(run(shell, "ps").join("\n")).toContain(NOVA_COMMAND);
	});
});

describe("帳號、登入與彩蛋指令", () => {
	it("whoami 是 tech，id 只認得 root、tech、medic；medic 是救援船的帳號，不是站上那個", () => {
		const shell = createArgoShell(NO_PROGRESS);
		expect(run(shell, "whoami")).toEqual(["tech"]);
		expect(run(shell, "id")[0]).toMatch(/^uid=\d+\(tech\)/);
		expect(run(shell, "id root")).toEqual(["uid=0(root) gid=0(root) groups=0(root)"]);
		const medic = run(shell, "id medic")[0] ?? "";
		expect(medic).toMatch(/^uid=\d+\(medic\)/);
		expect(medic).not.toContain("1003");
		expect(medic).not.toContain("crew");
		for (const name of ["nova", "abin", "captain", "unknown"]) {
			expect(shell.execute(`id ${name}`)).toMatchObject({ isError: true, lines: argoNoSuchUser(name) });
		}
	});

	it("last 第一行是 tech 從 pts/0 登入、還在線上", () => {
		const shell = createArgoShell(NO_PROGRESS);
		const [first] = run(shell, "last");
		expect(first).toMatch(/^tech\s+pts\/0\s/);
		expect(first).toContain("still logged in");
	});

	it("exit、logout 說明要按 Esc 斷線，sudo 被拒絕但不提「這座站」", () => {
		const shell = createArgoShell(NO_PROGRESS);
		for (const name of ["exit", "logout"]) {
			expect(shell.execute(name)).toMatchObject({ isError: false, lines: argoCannotExit(name) });
		}
		expect(shell.execute("sudo ls")).toMatchObject({ isError: false, lines: argoSudoDenied("tech") });
		expect(argoSudoDenied("tech").join("")).not.toContain("站");
		expect(argoNoSuchUser("x").join("")).not.toContain("站");
	});
});

describe("hint", () => {
	it("輪流給五則「可以看看什麼」，用完繞回第一則", () => {
		const shell = createArgoShell(NO_PROGRESS);
		const seen: string[] = [];
		for (let index = 0; index < ARGO_TIPS.length + 1; index += 1) {
			const text = run(shell, "hint").join("\n");
			expect(text).not.toContain("全部給過了");
			seen.push(text);
		}
		expect(new Set(seen).size).toBe(ARGO_TIPS.length);
		expect(seen[ARGO_TIPS.length]).toBe(seen[0]);
		expect(seen[0]).toContain(ARGO_TIPS[0]);
	});
});
