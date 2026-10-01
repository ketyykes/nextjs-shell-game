/**
 * 目標判定的組合函式（設計文件 3.4）。
 *
 * 劇本用這些小函式拼出每台終端機的 `objective.check`，例如
 * `all(commandIs("cat"), catFile("/home/abin/day_900.txt"))`。
 * 所有路徑比對都先用 `fs.resolvePath` 換成絕對路徑，玩家用相對路徑、`..`、`~` 都算數。
 *
 * 這個檔案不 import React、Phaser 或 zustand。
 */

import { parseCommandLine } from "@/game/shell/parser";
import type { ShellExecution, VirtualFs } from "@/game/shell/types";
import type { ObjectiveCheck, ObjectiveContext, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 參數拆解
// ---------------------------------------------------------------------------

/**
 * 把參數拆成「選項」與「路徑」，規則跟 `ls` 一樣：
 * `-` 開頭（但不是單獨的 `-`）是選項，`--` 之後全部當路徑。
 */
function splitOptionsAndPaths(args: string[]): { options: string[]; paths: string[] } {
	const options: string[] = [];
	const paths: string[] = [];
	let optionsEnded = false;

	for (const arg of args) {
		if (optionsEnded || !arg.startsWith("-") || arg === "-") {
			paths.push(arg);
			continue;
		}

		if (arg === "--") {
			optionsEnded = true;
			continue;
		}

		options.push(arg);
	}

	return { options, paths };
}

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

		const { options, paths } = splitOptionsAndPaths(context.command.args);
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
 * 執行失敗（`isError`）一律不算，`objective.check` 不會被呼叫。
 */
export function evaluateObjective(definition: TerminalDefinition, context: ObjectiveContext): boolean {
	if (context.execution.isError) {
		return false;
	}

	return definition.objective.check(context);
}

/**
 * 從一次 shell 執行組出判定用的 context。
 * 輸入再解析一次填 `command`；解析失敗或空輸入時為 null。
 */
export function createObjectiveContext(
	terminalId: string,
	execution: ShellExecution,
	fs: VirtualFs,
	home: string,
): ObjectiveContext {
	const parsed = parseCommandLine(execution.input);
	let command: ObjectiveContext["command"] = null;
	if (parsed.ok) {
		command = parsed.command;
	}

	return { terminalId, command, execution, fs, home };
}
