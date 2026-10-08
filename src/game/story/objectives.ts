/**
 * 目標判定的組合函式（設計文件 3.4）。
 *
 * 劇本用這些小函式拼出每台終端機的 `objective.check`，例如
 * `all(commandIs("cat"), catFile("/home/abin/day_900.txt"))`。
 * 所有路徑比對都先用 `fs.resolvePath` 換成絕對路徑，玩家用相對路徑、`..`、`~` 都算數。
 *
 * 這個檔案不 import React、Phaser 或 zustand。
 */

import { splitOptionsAndOperands } from "@/game/shell/commands/options";
import { parseCommandLine } from "@/game/shell/parser";
import { FsError, type ParsedCommand, type Redirect, type ShellExecution, type VirtualFs } from "@/game/shell/types";
import type { ObjectiveCheck, ObjectiveContext, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 參數拆解
// ---------------------------------------------------------------------------

/** 任一參數解析成絕對路徑後等於目標。 */
function anyArgResolvesTo(context: ObjectiveContext, args: string[], absolutePath: string): boolean {
	return args.some((arg) => context.fs.resolvePath(context.execution.cwd, arg) === absolutePath);
}

// ---------------------------------------------------------------------------
// 基本判定
// ---------------------------------------------------------------------------

/** 指令名稱等於 `name`。 */
export function commandIs(name: string): ObjectiveCheck {
	return (context) => context.command?.name === name;
}

/**
 * 用 `cat` 讀了指定的檔案。
 * `cat` 不會改工作目錄，所以 `execution.cwd` 就是執行當下的 cwd，可以直接拿來解析相對路徑。
 */
export function catFile(absolutePath: string): ObjectiveCheck {
	return (context) => {
		if (context.command?.name !== "cat") {
			return false;
		}

		return anyArgResolvesTo(context, context.command.args, absolutePath);
	};
}

/** 用 `cd` 走進指定目錄；`execution.cwd` 是 `cd` 之後的工作目錄。 */
export function cdInto(absolutePath: string): ObjectiveCheck {
	return (context) => context.command?.name === "cd" && context.execution.cwd === absolutePath;
}

/**
 * 用帶指定旗標的 `ls` 看了某個目錄。
 * 旗標支援合併寫法（`-la`、`-al`）；沒給 `absoluteDirPath` 時只檢查旗標，
 * 有給時任一路徑參數解析後等於它即可，沒有路徑參數就看 `execution.cwd`。
 */
export function lsWithFlag(flag: "-a" | "-l", absoluteDirPath?: string): ObjectiveCheck {
	const letter = flag.slice(1);

	return (context) => {
		if (context.command?.name !== "ls") {
			return false;
		}

		const { options, operands: paths } = splitOptionsAndOperands(context.command.args);
		const hasFlag = options.some((option) => !option.startsWith("--") && option.slice(1).includes(letter));
		if (!hasFlag) {
			return false;
		}

		if (absoluteDirPath === undefined) {
			return true;
		}

		if (paths.length === 0) {
			return context.execution.cwd === absoluteDirPath;
		}

		return anyArgResolvesTo(context, paths, absoluteDirPath);
	};
}

/** 輸出的任一行含有 `text`。 */
export function outputContains(text: string): ObjectiveCheck {
	return (context) => context.execution.lines.some((line) => line.includes(text));
}

// ---------------------------------------------------------------------------
// 管線與重導向（第四章起）
// ---------------------------------------------------------------------------

/** 管線裡所有叫 `name` 的指令。 */
function commandsNamed(context: ObjectiveContext, name: string): ParsedCommand[] {
	const commands = context.pipeline?.commands ?? [];
	return commands.filter((command) => command.name === name);
}

/** 管線裡任一個指令叫 `name`（`cat a | grep x` 的 `grep` 也算）。 */
export function anyCommandIs(name: string): ObjectiveCheck {
	return (context) => commandsNamed(context, name).length > 0;
}

/**
 * 管線裡任一個叫 `name` 的指令，其路徑參數解析後等於目標。
 * 選項（`-` 開頭）會先去掉，所以 `grep -r 聲音 /home/abin` 也抓得到目錄。
 */
export function commandTouches(name: string, absolutePath: string): ObjectiveCheck {
	return (context) =>
		commandsNamed(context, name).some((command) => {
			const { operands: paths } = splitOptionsAndOperands(command.args);
			return anyArgResolvesTo(context, paths, absolutePath);
		});
}

/** 管線裡任一個叫 `name` 的指令帶了 `-x` 這個短選項，支援合併寫法（`-rf` 含 `-r`）。 */
export function commandHasOption(name: string, option: string): ObjectiveCheck {
	const letter = option.replace(/^-/, "");
	return (context) =>
		commandsNamed(context, name).some((command) => {
			const { options } = splitOptionsAndOperands(command.args);
			return options.some((item) => !item.startsWith("--") && item.slice(1).includes(letter));
		});
}

/** 這一行有把輸出重導向到目標檔案；給 `kind` 時還要種類相符（`>` 是 overwrite、`>>` 是 append）。 */
export function redirectsTo(absolutePath: string, kind?: Redirect["kind"]): ObjectiveCheck {
	return (context) => {
		const redirect = context.pipeline?.redirect ?? null;
		if (redirect === null) {
			return false;
		}
		if (kind !== undefined && redirect.kind !== kind) {
			return false;
		}
		return context.fs.resolvePath(context.execution.cwd, redirect.target) === absolutePath;
	};
}

// ---------------------------------------------------------------------------
// 執行後的狀態（檔案、變數、程序）
// ---------------------------------------------------------------------------

/** 執行後目標路徑存在（`mkdir`、`touch`、`cp`、`mv`、`>` 的結果）。 */
export function fileExists(absolutePath: string): ObjectiveCheck {
	return (context) => context.fs.exists("/", absolutePath);
}

/** 執行後目標路徑不存在（`rm`、`mv` 走之後）。 */
export function fileAbsent(absolutePath: string): ObjectiveCheck {
	return (context) => !context.fs.exists("/", absolutePath);
}

/** 執行後目標檔案存在而且內容含有 `text`；不存在、是目錄或沒權限都算不成立。 */
export function fileContains(absolutePath: string, text: string): ObjectiveCheck {
	return (context) => {
		try {
			return context.fs.readFile("/", absolutePath).includes(text);
		} catch (error) {
			if (error instanceof FsError) {
				return false;
			}
			throw error;
		}
	};
}

/** 執行後環境變數 `name` 等於 `value`。 */
export function envEquals(name: string, value: string): ObjectiveCheck {
	return (context) => context.execution.env[name] === value;
}

/** 執行後程序清單裡沒有任何 `command` 含有 `commandText` 的程序（`kill` 的結果）。 */
export function noProcessMatching(commandText: string): ObjectiveCheck {
	return (context) => !context.execution.processes.some((process) => process.command.includes(commandText));
}

// ---------------------------------------------------------------------------
// 組合
// ---------------------------------------------------------------------------

/** 全部成立才成立；沒有任何條件時為 true。 */
export function all(...checks: ObjectiveCheck[]): ObjectiveCheck {
	return (context) => checks.every((check) => check(context));
}

/** 任一成立就成立；沒有任何條件時為 false。 */
export function any(...checks: ObjectiveCheck[]): ObjectiveCheck {
	return (context) => checks.some((check) => check(context));
}

// ---------------------------------------------------------------------------
// 給 PlayScreen 用的入口
// ---------------------------------------------------------------------------

/**
 * 判定這次執行是否讓終端機過關。
 * 執行失敗（`isError`）一律不算，`objective.check` 不會被呼叫；用 `;`、`&&` 串起來的一行只要有一段失敗，
 * 整行就是 `isError`，也不算（跟 PlayScreen 一樣：錯誤的那一行只扣氧氣，不判定過關）。
 *
 * 一行串了好幾段（`execution.segments`）時逐段判定，任一段成立就過關。每一段用自己的原文、輸出、
 * 執行完當下的 cwd、env 與程序清單組 context，所以 `cat a.txt ; cd ..` 的相對路徑照 cat 當時的位置解析、
 * `outputContains` 不會被別段的輸出湊成。檔案系統只有整行跑完的狀態，`fileExists` 這類看的是最後結果。
 */
export function evaluateObjective(definition: TerminalDefinition, context: ObjectiveContext): boolean {
	if (context.execution.isError) {
		return false;
	}

	const segments = context.execution.segments;
	if (segments === undefined) {
		return definition.objective.check(context);
	}

	return segments.some((segment) =>
		definition.objective.check(createObjectiveContext(context.terminalId, segment, context.fs, context.home)),
	);
}

/**
 * 從一次 shell 執行組出判定用的 context。
 * 輸入再解析一次填 `command`；解析失敗或空輸入時為 null。用 `;`、`&&` 串了好幾段時填的是第一段，
 * 逐段判定由 `evaluateObjective` 用 `execution.segments` 各自組 context。
 */
export function createObjectiveContext(
	terminalId: string,
	execution: ShellExecution,
	fs: VirtualFs,
	home: string,
): ObjectiveContext {
	// 用執行後的環境變數重新解析，`cat $NOVA_DIR/log` 這種寫法判定時才看得到真正的路徑；`~` 也跟 shell 一樣展開
	const parsed = parseCommandLine(execution.input, { env: execution.env, home });
	let command: ObjectiveContext["command"] = null;
	let pipeline: ObjectiveContext["pipeline"] = null;
	if (parsed.ok) {
		command = parsed.command;
		pipeline = parsed.pipeline;
	}

	return { terminalId, command, pipeline, execution, fs, home };
}
