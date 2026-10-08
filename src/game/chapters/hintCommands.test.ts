// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { createObjectiveContext, evaluateObjective } from "@/game/story/objectives";
import { extractHintSteps, type HintStep } from "./hintCommands";
import { CHAPTERS } from "./index";
import type { TerminalDefinition } from "./types";

/** 只關心要打的字、不按 Tab 的步驟簡寫。 */
function typed(...inputs: string[]): HintStep[] {
	return inputs.map((input) => ({ input, pressTab: false }));
}

describe("extractHintSteps", () => {
	it("依序抽出每個「輸入」後面的指令，到全形標點為止", () => {
		expect(extractHintSteps("輸入 ls，然後輸入 cat wake_up.txt。喚醒排程寫在那個檔案裡。")).toEqual(
			typed("ls", "cat wake_up.txt"),
		);
	});

	it("指令後面空一格接的中文說明不算進指令", () => {
		expect(extractHintSteps("輸入 head access.log 看最早的紀錄，再輸入 tail access.log 看最近是誰進出。")).toEqual(
			typed("head access.log", "tail access.log"),
		);
		expect(extractHintSteps("輸入 ls -l /home/abin 比對日期，找出最新的檔案。")).toEqual(typed("ls -l /home/abin"));
	});

	it("夾在指令中間的中文參數照樣保留", () => {
		expect(extractHintSteps("輸入 grep 回應 ping.log | tail -n 1。")).toEqual(typed("grep 回應 ping.log | tail -n 1"));
	});

	it("中文說明裡夾著英文時，從第一個中文字斷開", () => {
		expect(extractHintSteps("輸入 ps 找出 /opt/nova/nova --core 的 PID，再輸入 kill -9 1207。")).toEqual(
			typed("ps", "kill -9 1207"),
		);
		expect(extractHintSteps("輸入 ps | grep scheduler 找出 PID，再輸入 kill -9 1208。")).toEqual(
			typed("ps | grep scheduler", "kill -9 1208"),
		);
	});

	it("頓號隔開的多道指令拆成多步", () => {
		expect(
			extractHintSteps("依序輸入 rm startup.lock、rm -r config.corrupt、mkdir config，最後輸入 cp ~/repair/core.cfg config/。"),
		).toEqual(typed("rm startup.lock", "rm -r config.corrupt", "mkdir config", "cp ~/repair/core.cfg config/"));
	});

	it("「例如」後面的指令也算可照抄", () => {
		expect(
			extractHintSteps("再輸入 wc -l evac_*.log 比對行數，找到不是 3 行的那段，例如 head -n 5 evac_011.log。"),
		).toEqual(typed("wc -l evac_*.log", "head -n 5 evac_011.log"));
	});

	it("一行一道的指令清單逐行抽出，說明行本身沒有「輸入 X」就不產生步驟", () => {
		expect(extractHintSteps("依序輸入下面兩道指令，一行一道：\ncd /deck6/escape\nexport PASSENGERS=1")).toEqual(
			typed("cd /deck6/escape", "export PASSENGERS=1"),
		);
	});

	it("指令後面寫「再按 Tab」時標記成要先補全", () => {
		expect(
			extractHintSteps("輸入 cat index.txt，然後輸入 cat records/PT-2028-06 再按 Tab 補完檔名，按 Enter 讀它。"),
		).toEqual([
			{ input: "cat index.txt", pressTab: false },
			{ input: "cat records/PT-2028-06", pressTab: true },
		]);
	});

	it("「輸入」後面沒有空格或接的不是指令就不抽", () => {
		expect(extractHintSteps("輸入下面的指令。")).toEqual([]);
		expect(extractHintSteps("試著輸入 「ls」。")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 36 台第三段提示照抄
// ---------------------------------------------------------------------------

/** 用劇本的 FS、起始目錄、環境變數與程序清單開一個真的 shell，跟遊戲裡開終端機一樣。 */
function openTerminal(terminal: TerminalDefinition): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(terminal.fs),
		terminalId: terminal.id,
		hints: terminal.hints,
		learnedCommands: [],
		cwd: terminal.initialCwd,
		env: terminal.env,
		processes: terminal.processes,
	});
}

/** 照提示一步步打（要按 Tab 的先補全），回傳每一步實際送出的字、是否出錯與是否過關。 */
function copyHint(terminal: TerminalDefinition, steps: HintStep[]) {
	const shell = openTerminal(terminal);
	return steps.map((step) => {
		let input = step.input;
		if (step.pressTab) {
			input = shell.complete(input).completed;
		}
		const execution = shell.execute(input);
		const context = createObjectiveContext(terminal.id, execution, shell.fs, shell.home);
		return {
			input,
			isError: execution.isError,
			output: execution.lines.join(" / "),
			solved: evaluateObjective(terminal, context),
		};
	});
}

/**
 * 決策「提示永遠可信」的守門：每台第三段提示抽出的指令，從起始目錄照順序打，不能出錯，而且一定要過關。
 * 目前 36 台全部過得了，所以沒有例外清單；之後若有刻意不能照抄的台，要加明確的例外清單逐台寫理由，
 * 並斷言它真的過不了（修好後忘了拿掉會紅）。
 */
describe("第三段提示照抄就能過關", () => {
	const terminals = CHAPTERS.flatMap((chapter) => chapter.terminals);

	for (const terminal of terminals) {
		const finalHint = terminal.hints[2] ?? "";

		it(`${terminal.id} ${terminal.title}：照抄不出錯且會過關`, () => {
			const steps = extractHintSteps(finalHint);
			expect(steps.length, `第三段提示抽不到指令：${finalHint}`).toBeGreaterThan(0);

			const results = copyHint(terminal, steps);
			for (const result of results) {
				expect(result.isError, `「${result.input}」不該失敗：${result.output}`).toBe(false);
			}
			const inputs = results.map((result) => result.input).join(" → ");
			expect(results.some((result) => result.solved), `照抄 ${inputs} 沒有過關`).toBe(true);
		});
	}
});
