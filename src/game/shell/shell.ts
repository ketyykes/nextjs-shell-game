/**
 * Shell 執行入口。
 *
 * 一個 `Shell` 實例代表玩家在某一台終端機上的 session：
 * 它持有工作目錄、指令歷史、hint 計數，並把輸入串起解析器、指令註冊表與訊息模組。
 * UI 只需要呼叫 `execute`、`complete`、`historyUp`、`historyDown`，
 * 存檔時呼叫 `toState`，還原時用 `Shell.fromState`。
 *
 * 這個檔案不可以 import React 或 Phaser。
 */

import { ALL_COMMANDS } from "./commands";
import { complete as completeInput } from "./completion";
import { CommandHistory } from "./history";
import { commandNotFound, fsError, missingSpace, parseError } from "./messages";
import { parseCommandLine, suggestMissingSpace } from "./parser";
import type {
	CommandContext,
	CommandDefinition,
	CommandResult,
	CompletionResult,
	SerializedFs,
	ShellExecution,
	ShellOptions,
} from "./types";
import { FsError, HOME_DIR } from "./types";

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
}

export class Shell {
	private readonly options: ShellOptions;
	private readonly commands: Map<string, CommandDefinition>;
	private readonly history: CommandHistory;
	private currentCwd: string;
	private currentHintCount: number;
	private learned: string[];

	constructor(options: ShellOptions, commands: CommandDefinition[] = ALL_COMMANDS) {
		this.options = options;
		this.commands = new Map(commands.map((command) => [command.name, command]));
		this.history = new CommandHistory(options.history ?? []);
		this.currentCwd = options.cwd ?? options.home ?? HOME_DIR;
		this.currentHintCount = options.hintCount ?? 0;
		this.learned = [...options.learnedCommands];
	}

	get cwd(): string {
		return this.currentCwd;
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
	 */
	execute(input: string): ShellExecution {
		const context = this.buildContext();
		this.history.push(input);

		const parsed = parseCommandLine(input);
		if (!parsed.ok) {
			return this.finish(input, { ok: false, lines: parseError(parsed.error) });
		}
		if (parsed.command === null) {
			return this.finish(input, { ok: true, lines: [] });
		}

		const { name, args } = parsed.command;
		const command = this.commands.get(name);
		if (command === undefined) {
			return this.finish(input, { ok: false, lines: this.describeUnknownCommand(name) });
		}

		let result: CommandResult;
		try {
			result = command.run(args, context);
		} catch (error) {
			// 指令自己應該接住 FsError，這裡是最後一道防線，避免漏接讓 UI 整個掛掉。
			if (error instanceof FsError) {
				result = { ok: false, lines: fsError(error.code, error.path) };
			} else {
				throw error;
			}
		}
		return this.finish(input, result);
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
		};
	}

	/**
	 * 從存檔還原。`fs` 由呼叫端先用 `VirtualFileSystem.fromSerialized(state.fs)` 建好再傳入，
	 * 這裡不直接依賴 fs 的實作類別，保持 shell 只認 `VirtualFs` 介面。
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
		});
	}

	private buildContext(): CommandContext {
		return {
			cwd: this.currentCwd,
			home: this.home,
			fs: this.options.fs,
			terminalId: this.options.terminalId,
			learnedCommands: [...this.learned],
			hints: [...this.options.hints],
			hintCount: this.currentHintCount,
			history: this.history.entries(),
			availableCommands: this.commandNames,
		};
	}

	/** 指令不存在時，先試「忘記空格」，例如 `cdpod_06` 建議 `cd pod_06`。 */
	private describeUnknownCommand(name: string): string[] {
		const suggestion = suggestMissingSpace(name, this.commandNames);
		if (suggestion !== null) {
			return missingSpace(suggestion.command, suggestion.rest);
		}
		return commandNotFound(name);
	}

	/** 套用指令結果的副作用（換目錄、hint 計數、清畫面），並組成給 UI 的執行結果。 */
	private finish(input: string, result: CommandResult): ShellExecution {
		if (result.nextCwd !== undefined) {
			this.currentCwd = result.nextCwd;
		}
		if (result.hintUsed === true) {
			this.currentHintCount += 1;
		}
		return {
			input,
			lines: result.lines,
			isError: !result.ok,
			clearScreen: result.clearScreen === true,
			cwd: this.currentCwd,
		};
	}
}
