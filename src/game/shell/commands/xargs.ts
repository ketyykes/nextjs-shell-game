/**
 * `xargs`：把管線輸入切成項目，接在指令後面執行（第十九場，只開放使用，不在劇本裡）。
 *
 * 用法 `xargs [-n N] [-I 代換字串] [-r] [指令 [參數...]]`：
 * - 沒給指令時用 `echo`。xargs 的選項只能寫在指令前面，指令後面的選項是那個指令的（`xargs grep -n ERROR`）。
 * - 預設以空白與換行切成項目，全部接在指令後面執行一次；`-n N` 每 N 個執行一次。
 * - `-I 代換字串`：每一行（去掉前後空白，空行略過）執行一次，指令與參數裡的代換字串都換成那一行，所以檔名可以有空白。
 *   跟 `-n` 一起給時 `-I` 為準。
 * - 沒有任何項目時不執行（GNU 要加 `-r`，BSD 預設就是這樣；空的輸入接 `rm` 只會得到「缺少參數」，對新手沒有幫助）。`-r` 接受。
 *
 * 指令透過 shell 注入的 `context.runCommand` 執行，規則見 `CommandContext.runCommand`：
 * 換目錄、環境變數、別名照 bash 子程序的語意不影響外面，`kill` 改的程序清單會生效（`ps | grep x | cut … | xargs kill`）。
 * 結束碼照 GNU：任何一次失敗或結束碼不是 0 時其餘照跑，最後是 123；失敗的（`ok` 為 false）整個算錯誤，
 * 只是結束碼不是 0 的（`grep` 沒符合）不算錯誤。子指令回 127（找不到）或 126（不能這樣執行）時馬上停下，結束碼照傳。
 * 輸入裡的引號不做特別處理（GNU 會），`-0`、`-d`、`-L`、`-P`、`-p`、`-t` 不做。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { missingOperand, unknownOption, xargsCannotRun, xargsInvalidCount, xargsNeedsPipe } from "../messages";

/** 沒給指令時執行的指令。 */
const DEFAULT_COMMAND = "echo";

/** 子指令回這兩個結束碼時 xargs 馬上停下（找不到指令、不能執行）。 */
const FATAL_STATUSES = new Set([126, 127]);

/** 任何一次執行失敗或結束碼不是 0 時，xargs 的結束碼（GNU）。 */
const SOME_FAILED_STATUS = 123;

interface XargsOptions {
	maxArgs: number | null;
	replace: string | null;
	command: string;
	initialArgs: string[];
}

type XargsParseResult = { ok: true; options: XargsOptions } | { ok: false; lines: string[] };

/** 每個需要值的選項在值缺少時的提示。 */
const MISSING_VALUE_HINTS: Record<string, string> = {
	n: "在 -n 後面接每次要接幾個項目，例如 xargs -n 1 touch",
	I: "在 -I 後面接代換字串，例如 xargs -I {} cp {} backup/",
};

/** 解析 xargs 自己的選項：遇到第一個不是選項的參數就是指令，後面全部原封不動交給指令。 */
function parseXargsArgs(args: string[]): XargsParseResult {
	let maxArgs: number | null = null;
	let replace: string | null = null;
	let index = 0;

	while (index < args.length) {
		const arg = args[index];
		if (arg === "--") {
			index += 1;
			break;
		}
		if (!arg.startsWith("-") || arg === "-") {
			break;
		}
		index += 1;
		if (arg.startsWith("--")) {
			return { ok: false, lines: unknownOption("xargs", arg) };
		}

		const letters = arg.slice(1);
		for (let position = 0; position < letters.length; position += 1) {
			const letter = letters[position];
			if (letter === "r") {
				continue;
			}
			if (letter !== "n" && letter !== "I") {
				return { ok: false, lines: unknownOption("xargs", `-${letter}`) };
			}

			// 值黏在後面（`-n1`、`-I{}`）或是下一個參數（`-n 1`）
			let value = letters.slice(position + 1);
			if (value === "") {
				if (index >= args.length) {
					return { ok: false, lines: missingOperand("xargs", MISSING_VALUE_HINTS[letter]) };
				}
				value = args[index];
				index += 1;
			}

			if (letter === "I") {
				replace = value;
			} else if (/^\d+$/.test(value) && Number(value) > 0) {
				maxArgs = Number(value);
			} else {
				return { ok: false, lines: xargsInvalidCount(value) };
			}
			break;
		}
	}

	const [command = DEFAULT_COMMAND, ...initialArgs] = args.slice(index);
	return { ok: true, options: { maxArgs, replace, command, initialArgs } };
}

/** 每一次要執行的指令名稱與參數。 */
interface Invocation {
	name: string;
	args: string[];
}

/** 依選項把項目分成一次一次的執行。 */
function planInvocations(options: XargsOptions, stdin: string[]): Invocation[] {
	const { command, initialArgs, maxArgs, replace } = options;

	if (replace !== null) {
		const lines = stdin.map((line) => line.trim()).filter((line) => line !== "");
		return lines.map((line) => {
			const [name, ...args] = [command, ...initialArgs].map((word) => word.split(replace).join(line));
			return { name, args };
		});
	}

	const items = stdin.flatMap((line) => line.split(/\s+/)).filter((item) => item !== "");
	if (items.length === 0) {
		return [];
	}
	const size = maxArgs ?? items.length;
	const invocations: Invocation[] = [];
	for (let start = 0; start < items.length; start += size) {
		invocations.push({ name: command, args: [...initialArgs, ...items.slice(start, start + size)] });
	}
	return invocations;
}

/** 依序執行，收集輸出並照 GNU 的規則算結束碼。 */
function runInvocations(invocations: Invocation[], context: CommandContext): CommandResult {
	const runCommand = context.runCommand;
	if (runCommand === undefined) {
		return { ok: false, lines: xargsCannotRun() };
	}

	const lines: string[] = [];
	let failed = false;
	let nonZero = false;

	for (const invocation of invocations) {
		const result = runCommand(invocation.name, invocation.args, null);
		lines.push(...result.lines);
		const status = result.exitStatus ?? (result.ok ? 0 : 1);
		if (FATAL_STATUSES.has(status)) {
			return { ok: false, lines, exitStatus: status };
		}
		if (!result.ok) {
			failed = true;
		}
		if (status !== 0) {
			nonZero = true;
		}
	}

	if (failed) {
		return { ok: false, lines, exitStatus: SOME_FAILED_STATUS };
	}
	if (nonZero) {
		return { ok: true, lines, exitStatus: SOME_FAILED_STATUS };
	}
	return { ok: true, lines };
}

export const xargsCommand: CommandDefinition = {
	name: "xargs",
	run(args, context): CommandResult {
		const parsed = parseXargsArgs(args);
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}
		if (context.stdin === null) {
			return { ok: false, lines: xargsNeedsPipe() };
		}

		const invocations = planInvocations(parsed.options, context.stdin);
		if (invocations.length === 0) {
			return { ok: true, lines: [] };
		}
		return runInvocations(invocations, context);
	},
};
