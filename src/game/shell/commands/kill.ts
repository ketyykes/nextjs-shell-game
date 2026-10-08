/**
 * `kill`：終止程序。
 *
 * `kill PID` 送一般的終止訊號（TERM），等於「請它自己結束」，
 * 程序的 `ignoresTerm` 為 true 時它會不理；`kill -9 PID`（KILL）是強制結束。
 * `protected` 的程序（例如 init）連 `-9` 都殺不掉。
 *
 * 支援的訊號：`-9`、`-KILL`、`-15`、`-TERM`，可以放在任何位置，對所有 PID 都有效。
 * 多個 PID 逐一處理，失敗不中斷，整體 `ok` 為 false；成功的仍然移除。
 * 指令不直接改 `context.processes`，有程序被移除時回傳整份新的 `nextProcesses`。
 */

import type { CommandDefinition, CommandResult, ProcessInfo } from "../types";
import {
	invalidPid,
	missingOperand,
	noSuchProcess,
	processIgnoredSignal,
	processProtected,
	unknownOption,
} from "../messages";
import { splitOptionsAndOperands } from "./options";

/** 強制結束的訊號寫法。 */
const KILL_SIGNALS = new Set(["-9", "-KILL"]);

/** 一般終止的訊號寫法（不帶訊號時的預設）。 */
const TERM_SIGNALS = new Set(["-15", "-TERM"]);

/** PID 只接受全是數字的字串，再另外檢查大於 0。 */
const DIGITS = /^\d+$/;

/** 參數解析結果。 */
type KillParseResult =
	| { ok: true; force: boolean; pids: string[] }
	| { ok: false; lines: string[] };

/** 分出訊號與 PID；不認得的訊號直接回錯誤。多個訊號以最後一個為準。 */
function parseKillArgs(args: string[]): KillParseResult {
	let force = false;
	// kill 沒有 `--` 的語意，單獨的 `-` 也不是 PID，兩者都留在 options 被當成不認得的訊號
	const { options: signals, operands: pids } = splitOptionsAndOperands(args, {
		endOfOptions: false,
		loneDashIsOperand: false,
	});

	for (const arg of signals) {
		if (KILL_SIGNALS.has(arg)) {
			force = true;
		} else if (TERM_SIGNALS.has(arg)) {
			force = false;
		} else {
			return { ok: false, lines: unknownOption("kill", arg) };
		}
	}

	// `kill 9 1207` 是本章最典型的手滑：9 不是 PID，是忘了 dash 的訊號
	if (pids.length > 1 && (pids[0] === "9" || pids[0] === "15")) {
		return {
			ok: false,
			lines: [`訊號要加 dash。你是不是要打 kill -${pids[0]} ${pids.slice(1).join(" ")}？`],
		};
	}

	return { ok: true, force, pids };
}

/** 終止成功時印的訊息。 */
function killedLine(process: ProcessInfo): string {
	return `已終止程序 ${process.pid}（${process.command}）`;
}

export const killCommand: CommandDefinition = {
	name: "kill",
	run(args, context): CommandResult {
		const parsed = parseKillArgs(args);

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		if (parsed.pids.length === 0) {
			return { ok: false, lines: missingOperand("kill", "一個程序編號，例如 kill 42；編號用 ps 查") };
		}

		let remaining = [...context.processes];
		const lines: string[] = [];
		let ok = true;
		let changed = false;

		for (const value of parsed.pids) {
			const pid = Number(value);

			if (!DIGITS.test(value) || pid <= 0) {
				ok = false;
				lines.push(...invalidPid(value));
				continue;
			}

			const target = remaining.find((process) => process.pid === pid);

			if (target === undefined) {
				ok = false;
				lines.push(...noSuchProcess(pid));
				continue;
			}

			if (target.protected === true) {
				ok = false;
				lines.push(...processProtected(pid, target.command));
				continue;
			}

			if (target.ignoresTerm === true && !parsed.force) {
				ok = false;
				lines.push(...processIgnoredSignal(pid, target.command));
				continue;
			}

			remaining = remaining.filter((process) => process.pid !== pid);
			changed = true;
			lines.push(killedLine(target));
		}

		const result: CommandResult = { ok, lines };

		if (changed) {
			result.nextProcesses = remaining;
		}

		return result;
	},
};
