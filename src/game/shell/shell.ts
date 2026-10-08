/**
 * Shell 執行入口。
 *
 * 一個 `Shell` 實例代表玩家在某一台終端機上的 session：
 * 它持有工作目錄、指令歷史、hint 計數、環境變數與程序清單，並把輸入串起解析器、指令註冊表與訊息模組。
 * 一行輸入可以用 `;`、`&&` 串成好幾段，每一段是用 `|` 串起來的管線，結尾可接 `>`／`>>` 重導向；
 * 參數裡的 `$NAME` 由解析器在執行到那一段時展開，沒被引號包住的 `*`、`?` 由這裡呼叫 `fs.glob` 展開。
 * UI 只需要呼叫 `execute`、`complete`、`historyUp`、`historyDown`，
 * 存檔時呼叫 `toState`，還原時用 `Shell.fromState`。
 *
 * 這個檔案不可以 import React 或 Phaser。
 */

import { ALL_COMMANDS } from "./commands";
import { joinContentLines } from "./commands/cat";
import { commandAtInstallPath } from "./commands/which";
import { complete as completeInput } from "./completion";
import { CommandHistory } from "./history";
import { commandNotFound, fsError, fullPathCommand, missingSpace, parseError } from "./messages";
import { parseCommandLineDetailed, parseCommandList, suggestMissingSpace } from "./parser";
import type { ParsedWord } from "./parser";
import type {
	CommandContext,
	CommandDefinition,
	CommandResult,
	CompletionResult,
	PagerRequest,
	ProcessInfo,
	Redirect,
	SerializedFs,
	ShellExecution,
	ShellOptions,
} from "./types";
import { FsError, HOME_DIR, PLAYER_USER } from "./types";

/** 提示符前綴，設計文件 4.9 定的是 `crew@kepler9:~$`。 */
export const PROMPT_USER_HOST = "crew@kepler9";

/** 存進 store 的 shell session 狀態，欄位都是純資料。 */
export interface ShellSessionState {
	terminalId: string;
	cwd: string;
	history: string[];
	hintCount: number;
	learnedCommands: string[];
	fs: SerializedFs;
	/** 環境變數（第五章）。舊存檔沒有這個欄位，還原時用預設值。 */
	env?: Record<string, string>;
	/** 程序清單（第六章）。舊存檔沒有這個欄位，還原時用預設值。 */
	processes?: ProcessInfo[];
}

/** 重導向開檔的結果：成功時帶這次新建的目標檔絕對路徑（原本就存在為 null），失敗時帶錯誤訊息。 */
type RedirectOpenResult = { ok: true; createdPath: string | null } | { ok: false; lines: string[] };

/**
 * 一段管線的執行結果加上結束碼。結束碼只給 `&&` 決定要不要跳過右邊，不放進 `ShellExecution`：
 * UI 與目標判定只看 `isError`（`grep` 沒符合這類「不算錯誤的失敗」結束碼是 1，但 `isError` 仍是 false）。
 */
interface PipelineRun {
	execution: ShellExecution;
	exitStatus: number;
}

/** 指令的結束碼：有給 `exitStatus` 就用它，否則 ok 是 0、失敗是 1。 */
function exitStatusOf(result: CommandResult): number {
	if (result.exitStatus !== undefined) {
		return result.exitStatus;
	}
	return result.ok ? 0 : 1;
}

/** 萬用字元：沒被引號包住而且含這兩個字元的參數才展開。 */
const GLOB_CHAR_PATTERN = /[*?]/;

/** 複製程序清單，每個程序也淺拷貝一份，避免外部改到 shell 內部的狀態。 */
function copyProcesses(processes: ProcessInfo[]): ProcessInfo[] {
	return processes.map((process) => ({ ...process }));
}

export class Shell {
	private readonly options: ShellOptions;
	private readonly commands: Map<string, CommandDefinition>;
	private readonly history: CommandHistory;
	private currentCwd: string;
	private currentHintCount: number;
	/** 目前這次 `execute` 有沒有跑到 hint，每次 `execute` 開頭歸零。 */
	private hintUsedInExecution = false;
	private learned: string[];
	private currentEnv: Record<string, string>;
	private currentProcesses: ProcessInfo[];

	constructor(options: ShellOptions, commands: CommandDefinition[] = ALL_COMMANDS) {
		this.options = options;
		this.commands = new Map(commands.map((command) => [command.name, command]));
		this.history = new CommandHistory(options.history ?? []);
		this.currentCwd = options.cwd ?? options.home ?? HOME_DIR;
		this.currentHintCount = options.hintCount ?? 0;
		// UI 可能把「ls、ls -l、ls -a」轉成指令名後整串傳進來，這裡去重，順序照第一次出現
		this.learned = [];
		for (const name of options.learnedCommands) {
			this.learn(name);
		}
		// 基本的三個變數先補上，劇本或存檔給的 env 可以覆蓋或追加
		this.currentEnv = {
			HOME: options.home ?? HOME_DIR,
			USER: PLAYER_USER,
			PWD: this.currentCwd,
			...options.env,
		};
		this.currentProcesses = copyProcesses(options.processes ?? []);
	}

	get cwd(): string {
		return this.currentCwd;
	}

	/** 這個 session 的檔案系統，目標判定用它解析路徑；指令仍透過 context 拿。 */
	get fs(): ShellOptions["fs"] {
		return this.options.fs;
	}

	get home(): string {
		return this.options.home ?? HOME_DIR;
	}

	get terminalId(): string {
		return this.options.terminalId;
	}

	get hintCount(): number {
		return this.currentHintCount;
	}

	get learnedCommands(): string[] {
		return [...this.learned];
	}

	/** 目前的環境變數（拷貝）。 */
	get env(): Record<string, string> {
		return { ...this.currentEnv };
	}

	/** 目前的程序清單（拷貝）。 */
	get processes(): ProcessInfo[] {
		return copyProcesses(this.currentProcesses);
	}

	get commandNames(): string[] {
		return [...this.commands.keys()];
	}

	/** 指令歷史，最舊在前。 */
	get historyEntries(): string[] {
		return this.history.entries();
	}

	/** 目前的提示符，家目錄底下顯示成 `~`。 */
	prompt(): string {
		return `${PROMPT_USER_HOST}:${this.displayPath()}$`;
	}

	/** 把絕對路徑換成提示符用的顯示形式：家目錄本身是 `~`，家目錄底下是 `~/xxx`。 */
	displayPath(): string {
		const home = this.home;
		if (this.currentCwd === home) {
			return "~";
		}
		if (this.currentCwd.startsWith(`${home}/`)) {
			return `~${this.currentCwd.slice(home.length)}`;
		}
		return this.currentCwd;
	}

	/** 讓玩家學會一個指令，`help` 之後會列出它。重複學不會重複加。 */
	learn(commandName: string): void {
		if (!this.learned.includes(commandName)) {
			this.learned.push(commandName);
		}
	}

	/**
	 * 執行一行輸入。
	 * 不管成功或失敗都會記進歷史（跟 bash 一樣，打錯的也能用 ↑ 叫回來修），整行只記一筆。
	 *
	 * 一行可以用 `;`、`&&` 串成好幾段（M13-2）。跟 bash 一樣先解析整行，任一段有語法錯誤就一段都不執行；
	 * 接著依序執行每一段：`;` 後面的段落一定執行，`&&` 後面的段落只在前一段的結束碼是 0 時執行（被跳過時維持失敗，
	 * 所以 `fail && a && b` 的 `b` 也跳過）。結束碼跟「算不算錯誤」分開：`grep` 沒符合不算錯誤，但 `&&` 照樣跳過右邊。每一段執行到時才展開變數與萬用字元，看得到前面段落的副作用。
	 * 任一段失敗整行就算一次錯誤，輸出依序接起來；每一段的結果放在 `segments` 給目標判定逐段看。
	 */
	execute(input: string): ShellExecution {
		this.hintUsedInExecution = false;
		// 指令看到的歷史不含目前這一筆，所以先取再 push
		const previousHistory = this.history.entries();
		this.history.push(input);

		// 這一步不給 env：只檢查整行語法並切段，變數等執行到那一段才用當下的值展開
		const list = parseCommandList(input);
		if (!list.ok) {
			return this.finish(input, false, parseError(list.error), false);
		}

		const segments: ShellExecution[] = [];
		let previousStatus = 0;
		for (const item of list.items) {
			if (item.connector === "&&" && previousStatus !== 0) {
				continue;
			}
			const run = this.executePipeline(item.source, previousHistory);
			segments.push(run.execution);
			previousStatus = run.exitStatus;
		}

		if (list.items.length <= 1) {
			const only = segments[0];
			if (only === undefined) {
				return this.finish(input, true, [], false);
			}
			return { ...only, input };
		}

		return this.combineSegments(input, segments);
	}

	/**
	 * 執行一段管線（`;`、`&&` 切開後的其中一段），`input` 是那一段的原文，用當下的環境變數解析。
	 *
	 * 管線依序執行，前一個指令的 `lines` 是下一個的 `stdin`；任何一個失敗（或不存在）就停下，
	 * 回傳那個指令的錯誤。每個指令的副作用（換目錄、hint、環境變數、程序清單）都會套用。
	 *
	 * 有重導向時跟 bash 一樣**先開檔再執行**：`>` 先建立或清空目標檔，`>>` 在目標不存在時先建空檔，
	 * 所以指令失敗（例如 `cat missing.txt > out.txt`）也會留下空的目標檔；目標本身不合法（父目錄不存在、是目錄）
	 * 時只回報目標的錯誤，管線一個指令都不執行。最後一個指令成功時輸出寫進檔案，畫面上不印。
	 * 不管哪一種失敗，這一段都只算一次錯誤。
	 * 回傳時附上這一段的結束碼（最後一個指令的），`&&` 用它決定要不要跳過下一段。
	 */
	private executePipeline(input: string, previousHistory: string[]): PipelineRun {
		const parsed = parseCommandLineDetailed(input, { env: this.currentEnv, home: this.home });
		if (!parsed.ok) {
			return this.failRun(input, parseError(parsed.error), false);
		}
		if (parsed.pipeline === null) {
			return { execution: this.finish(input, true, [], false), exitStatus: 0 };
		}

		const redirect = parsed.pipeline.redirect;
		let createdTarget: string | null = null;

		if (redirect !== null) {
			const opened = this.openRedirect(redirect);

			if (!opened.ok) {
				return this.failRun(input, opened.lines, false);
			}

			createdTarget = opened.createdPath;
		}

		let stdin: string[] | null = null;
		let clearScreen = false;
		// 管線的結束碼是最後一個指令的（bash 沒開 pipefail 時的行為），中間的 grep 沒符合不影響
		let exitStatus = 0;
		const commands = parsed.pipeline.commands;

		for (const [index, parsedCommand] of commands.entries()) {
			const name = parsedCommand.name.value;
			const command = this.commands.get(name);
			if (command === undefined) {
				return this.failRun(input, this.describeUnknownCommand(name), clearScreen);
			}

			const args = this.expandGlobs(parsedCommand.args, createdTarget);
			const result = this.runCommand(command, args, this.buildContext(previousHistory, stdin));
			this.applySideEffects(result);
			if (result.clearScreen === true) {
				clearScreen = true;
			}
			// less 只有在管線最後、輸出直接到畫面時才分頁；其他位置照真的 less 把內容當一般輸出
			const isLast = index === commands.length - 1;
			if (isLast && redirect === null && result.pager !== undefined) {
				const execution = this.finish(input, result.ok, result.pager.lines, clearScreen);
				return { execution: { ...execution, pagers: [result.pager.request] }, exitStatus: exitStatusOf(result) };
			}
			if (!result.ok) {
				return this.failRun(input, result.lines, clearScreen);
			}
			stdin = result.lines;
			exitStatus = exitStatusOf(result);
		}

		const output = stdin ?? [];
		if (redirect === null) {
			return { execution: this.finish(input, true, output, clearScreen), exitStatus };
		}

		const redirectError = this.writeRedirect(redirect, output);
		if (redirectError !== null) {
			return this.failRun(input, redirectError, clearScreen);
		}
		return { execution: this.finish(input, true, [], clearScreen), exitStatus };
	}

	/**
	 * 把好幾段的結果合成整行的結果：輸出依序接起來，遇到清畫面的段落就丟掉它之前的輸出
	 * （`ls ; clear ; pwd` 畫面上只剩 pwd 的輸出）；任一段失敗整行就算錯誤。
	 */
	private combineSegments(input: string, segments: ShellExecution[]): ShellExecution {
		let lines: string[] = [];
		let clearScreen = false;
		const pagers: PagerRequest[] = [];
		for (const segment of segments) {
			if (segment.clearScreen) {
				clearScreen = true;
				lines = [];
			}
			lines = [...lines, ...segment.lines];
			pagers.push(...(segment.pagers ?? []));
		}

		const ok = segments.every((segment) => !segment.isError);
		const combined: ShellExecution = { ...this.finish(input, ok, lines, clearScreen), segments };
		if (pagers.length > 0) {
			combined.pagers = pagers;
		}
		return combined;
	}

	/** Tab 補全，游標視為在輸入結尾。 */
	complete(input: string): CompletionResult {
		return completeInput(input, {
			cwd: this.currentCwd,
			home: this.home,
			fs: this.options.fs,
			commandNames: this.commandNames,
			env: this.currentEnv,
		});
	}

	/** 按 ↑。沒有歷史時回傳 null。 */
	historyUp(): string | null {
		return this.history.up();
	}

	/** 按 ↓。走過最新一筆會回到空白輸入列。 */
	historyDown(): string {
		return this.history.down();
	}

	/** 匯出成可存進 store 的純資料。 */
	toState(): ShellSessionState {
		return {
			terminalId: this.options.terminalId,
			cwd: this.currentCwd,
			history: this.history.entries(),
			hintCount: this.currentHintCount,
			learnedCommands: [...this.learned],
			fs: this.options.fs.serialize(),
			env: { ...this.currentEnv },
			processes: copyProcesses(this.currentProcesses),
		};
	}

	/**
	 * 從存檔還原。`fs` 由呼叫端先用 `VirtualFileSystem.fromSerialized(state.fs)` 建好再傳入，
	 * 這裡不直接依賴 fs 的實作類別，保持 shell 只認 `VirtualFs` 介面。
	 * 舊存檔沒有 `env`、`processes` 時，建構子會補預設值（`PWD` 跟著存檔的 cwd）。
	 */
	static fromState(state: ShellSessionState, fs: ShellOptions["fs"], hints: string[], home?: string): Shell {
		return new Shell({
			fs,
			terminalId: state.terminalId,
			hints,
			learnedCommands: state.learnedCommands,
			home,
			cwd: state.cwd,
			history: state.history,
			hintCount: state.hintCount,
			env: state.env,
			processes: state.processes,
		});
	}

	/** 組出指令執行的 context。每個管線環節都重新組一次，才會看到前一個指令的副作用。 */
	private buildContext(history: string[], stdin: string[] | null): CommandContext {
		return {
			cwd: this.currentCwd,
			home: this.home,
			fs: this.options.fs,
			terminalId: this.options.terminalId,
			learnedCommands: [...this.learned],
			hints: [...this.options.hints],
			hintCount: this.currentHintCount,
			history: [...history],
			availableCommands: this.commandNames,
			stdin,
			env: { ...this.currentEnv },
			processes: copyProcesses(this.currentProcesses),
		};
	}

	/** 執行單一指令。 */
	private runCommand(command: CommandDefinition, args: string[], context: CommandContext): CommandResult {
		try {
			return command.run(args, context);
		} catch (error) {
			// 指令自己應該接住 FsError，這裡是最後一道防線，避免漏接讓 UI 整個掛掉。
			if (error instanceof FsError) {
				return { ok: false, lines: fsError(error.code, error.path) };
			}
			throw error;
		}
	}

	/**
	 * 萬用字元展開：沒被引號包住而且含 `*` 或 `?` 的參數用 `fs.glob` 展開，
	 * 沒有任何相符時保留原字串（bash 行為），讓指令自己回報找不到。
	 * `excludedPath` 是這一行的重導向剛建立的目標檔（絕對路徑）：bash 先展開萬用字元才開檔，
	 * 所以 `cat *.log > all.log` 配不到新建的 `all.log`。
	 */
	private expandGlobs(args: ParsedWord[], excludedPath: string | null): string[] {
		const fs = this.options.fs;
		const expanded: string[] = [];
		for (const arg of args) {
			if (arg.quoted || !GLOB_CHAR_PATTERN.test(arg.value)) {
				expanded.push(arg.value);
				continue;
			}
			const matches = fs
				.glob(this.currentCwd, arg.value)
				.filter((match) => fs.resolvePath(this.currentCwd, match) !== excludedPath);
			if (matches.length === 0) {
				expanded.push(arg.value);
			} else {
				expanded.push(...matches);
			}
		}
		return expanded;
	}

	/**
	 * 執行指令前先開重導向的目標檔（bash 行為）：`>` 建立或清空，`>>` 不存在時建立空檔、存在時不動。
	 * 成功時帶「這次新建的目標檔」絕對路徑（原本就存在則為 null），失敗（父目錄不存在、目標是目錄等）帶要印的錯誤訊息。
	 */
	private openRedirect(redirect: Redirect): RedirectOpenResult {
		const fs = this.options.fs;
		const { target } = redirect;
		const existed = fs.exists(this.currentCwd, target);

		try {
			if (redirect.kind === "overwrite" || !existed) {
				fs.writeFile(this.currentCwd, target, "");
			} else if (fs.getNode(this.currentCwd, target).type === "dir") {
				throw new FsError("EISDIR", target);
			}
		} catch (error) {
			if (error instanceof FsError) {
				return { ok: false, lines: fsError(error.code, error.path) };
			}
			throw error;
		}

		const createdPath = existed ? null : fs.resolvePath(this.currentCwd, target);
		return { ok: true, createdPath };
	}

	/**
	 * 把輸出寫進重導向的目標檔案，每行結尾都補換行；沒有輸出時寫入空字串。
	 * 目標檔在執行前已經由 `openRedirect` 開好，這裡只是把內容寫進去。
	 * 成功回傳 null，失敗回傳要印的錯誤訊息。
	 */
	private writeRedirect(redirect: Redirect, lines: string[]): string[] | null {
		const content = joinContentLines(lines);

		try {
			if (redirect.kind === "append") {
				this.options.fs.appendFile(this.currentCwd, redirect.target, content);
			} else {
				this.options.fs.writeFile(this.currentCwd, redirect.target, content);
			}
		} catch (error) {
			if (error instanceof FsError) {
				return fsError(error.code, error.path);
			}
			throw error;
		}
		return null;
	}

	/**
	 * 指令不存在時，先看是不是用完整路徑打指令（照抄 `which ls` 印的 `/usr/bin/ls`），
	 * 再試「忘記空格」，例如 `cdpod_06` 建議 `cd pod_06`。
	 */
	private describeUnknownCommand(name: string): string[] {
		if (name.includes("/")) {
			const commandName = commandAtInstallPath(this.options.fs.resolvePath(this.currentCwd, name), this.commandNames);
			if (commandName !== null) {
				return fullPathCommand(name, commandName);
			}
		}
		const suggestion = suggestMissingSpace(name, this.commandNames);
		if (suggestion !== null) {
			return missingSpace(suggestion.command, suggestion.rest);
		}
		return commandNotFound(name);
	}

	/** 套用單一指令結果的副作用：換目錄（同時更新 `PWD`）、hint 計數、環境變數、程序清單。 */
	private applySideEffects(result: CommandResult): void {
		if (result.nextEnv !== undefined) {
			this.currentEnv = { ...result.nextEnv };
		}
		if (result.nextCwd !== undefined) {
			this.currentCwd = result.nextCwd;
			this.currentEnv.PWD = result.nextCwd;
		}
		if (result.hintUsed === true) {
			this.currentHintCount += 1;
			this.hintUsedInExecution = true;
		}
		if (result.nextProcesses !== undefined) {
			this.currentProcesses = copyProcesses(result.nextProcesses);
		}
	}

	/** 這一段失敗（算錯誤）：印錯誤訊息，結束碼 1。 */
	private failRun(input: string, lines: string[], clearScreen: boolean): PipelineRun {
		return { execution: this.finish(input, false, lines, clearScreen), exitStatus: 1 };
	}

	/** 組成給 UI 的執行結果，env 與程序清單都給拷貝。 */
	private finish(input: string, ok: boolean, lines: string[], clearScreen: boolean): ShellExecution {
		return {
			input,
			lines,
			isError: !ok,
			clearScreen,
			cwd: this.currentCwd,
			env: { ...this.currentEnv },
			processes: copyProcesses(this.currentProcesses),
			hintUsed: this.hintUsedInExecution,
		};
	}
}
