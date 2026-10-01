/**
 * Shell 執行入口。
 *
 * 一個 `Shell` 實例代表玩家在某一台終端機上的 session：
 * 它持有工作目錄、指令歷史、hint 計數、環境變數與程序清單，並把輸入串起解析器、指令註冊表與訊息模組。
 * 一行輸入可以是用 `|` 串起來的管線，結尾可接 `>`／`>>` 重導向；參數裡的 `$NAME` 由解析器展開，
 * 沒被引號包住的 `*`、`?` 由這裡呼叫 `fs.glob` 展開。
 * UI 只需要呼叫 `execute`、`complete`、`historyUp`、`historyDown`，
 * 存檔時呼叫 `toState`，還原時用 `Shell.fromState`。
 *
 * 這個檔案不可以 import React 或 Phaser。
 */

import { ALL_COMMANDS } from "./commands";
import { complete as completeInput } from "./completion";
import { CommandHistory } from "./history";
import { commandNotFound, fsError, missingSpace, parseError } from "./messages";
import { parseCommandLineDetailed, suggestMissingSpace } from "./parser";
import type { ParsedWord } from "./parser";
import type {
	CommandContext,
	CommandDefinition,
	CommandResult,
	CompletionResult,
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
	private learned: string[];
	private currentEnv: Record<string, string>;
	private currentProcesses: ProcessInfo[];

	constructor(options: ShellOptions, commands: CommandDefinition[] = ALL_COMMANDS) {
		this.options = options;
		this.commands = new Map(commands.map((command) => [command.name, command]));
		this.history = new CommandHistory(options.history ?? []);
		this.currentCwd = options.cwd ?? options.home ?? HOME_DIR;
		this.currentHintCount = options.hintCount ?? 0;
		this.learned = [...options.learnedCommands];
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
	 * 不管成功或失敗都會記進歷史（跟 bash 一樣，打錯的也能用 ↑ 叫回來修）。
	 *
	 * 管線依序執行，前一個指令的 `lines` 是下一個的 `stdin`；任何一個失敗（或不存在）就停下，
	 * 回傳那個指令的錯誤。每個指令的副作用（換目錄、hint、環境變數、程序清單）都會套用。
	 * 最後一個指令成功而且有重導向時，輸出寫進檔案，畫面上不印。
	 */
	execute(input: string): ShellExecution {
		// 指令看到的歷史不含目前這一筆，所以先取再 push
		const previousHistory = this.history.entries();
		this.history.push(input);

		const parsed = parseCommandLineDetailed(input, { env: this.currentEnv });
		if (!parsed.ok) {
			return this.finish(input, false, parseError(parsed.error), false);
		}
		if (parsed.pipeline === null) {
			return this.finish(input, true, [], false);
		}

		let stdin: string[] | null = null;
		let clearScreen = false;

		for (const parsedCommand of parsed.pipeline.commands) {
			const name = parsedCommand.name.value;
			const command = this.commands.get(name);
			if (command === undefined) {
				return this.finish(input, false, this.describeUnknownCommand(name), clearScreen);
			}

			const args = this.expandGlobs(parsedCommand.args);
			const result = this.runCommand(command, args, this.buildContext(previousHistory, stdin));
			this.applySideEffects(result);
			if (result.clearScreen === true) {
				clearScreen = true;
			}
			if (!result.ok) {
				return this.finish(input, false, result.lines, clearScreen);
			}
			stdin = result.lines;
		}

		const output = stdin ?? [];
		if (parsed.pipeline.redirect === null) {
			return this.finish(input, true, output, clearScreen);
		}

		const redirectError = this.writeRedirect(parsed.pipeline.redirect, output);
		if (redirectError !== null) {
			return this.finish(input, false, redirectError, clearScreen);
		}
		return this.finish(input, true, [], clearScreen);
	}

	/** Tab 補全，游標視為在輸入結尾。 */
	complete(input: string): CompletionResult {
		return completeInput(input, {
			cwd: this.currentCwd,
			home: this.home,
			fs: this.options.fs,
			commandNames: this.commandNames,
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
	 */
	private expandGlobs(args: ParsedWord[]): string[] {
		const expanded: string[] = [];
		for (const arg of args) {
			if (arg.quoted || !GLOB_CHAR_PATTERN.test(arg.value)) {
				expanded.push(arg.value);
				continue;
			}
			const matches = this.options.fs.glob(this.currentCwd, arg.value);
			if (matches.length === 0) {
				expanded.push(arg.value);
			} else {
				expanded.push(...matches);
			}
		}
		return expanded;
	}

	/**
	 * 把輸出寫進重導向的目標檔案，每行結尾都補換行；沒有輸出時寫入空字串。
	 * 成功回傳 null，失敗回傳要印的錯誤訊息。
	 */
	private writeRedirect(redirect: Redirect, lines: string[]): string[] | null {
		let content = "";
		if (lines.length > 0) {
			content = `${lines.join("\n")}\n`;
		}

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

	/** 指令不存在時，先試「忘記空格」，例如 `cdpod_06` 建議 `cd pod_06`。 */
	private describeUnknownCommand(name: string): string[] {
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
		}
		if (result.nextProcesses !== undefined) {
			this.currentProcesses = copyProcesses(result.nextProcesses);
		}
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
		};
	}
}
