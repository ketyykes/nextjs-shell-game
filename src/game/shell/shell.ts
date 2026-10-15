/**
 * Shell 執行入口。
 *
 * 一個 `Shell` 實例代表玩家在某一台終端機上的 session：
 * 它持有工作目錄、指令歷史、hint 計數、環境變數與程序清單，並把輸入串起解析器、指令註冊表與訊息模組。
 * 一行輸入可以用 `;`、`&&`、`||` 串成好幾段，每一段是用 `|` 串起來的管線，可以帶 `>`／`>>`、`<`、`2>` 這類重導向；
 * 參數裡的 `$NAME` 與 `$( )` 由解析器在執行到那一段時展開（`$( )` 交給這裡開一個子 shell 執行），
 * 沒被引號包住的 `*`、`?` 由這裡呼叫 `fs.glob` 展開。
 * UI 只需要呼叫 `execute`、`complete`、`historyUp`、`historyDown`，
 * 存檔時呼叫 `toState`，還原時用 `Shell.fromState`。
 *
 * 這個檔案不可以 import React 或 Phaser。
 */

import { ALL_COMMANDS } from "./commands";
import { joinContentLines, splitContentLines } from "./commands/cat";
import { commandAtInstallPath } from "./commands/which";
import { complete as completeInput } from "./completion";
import { CommandHistory } from "./history";
import {
	commandIsLowercase,
	commandNotFound,
	fsError,
	fullPathCommand,
	missingSpace,
	parseError,
	programNotInstalled,
	similarCommand,
} from "./messages";
import {
	findUnavailableProgram,
	parseCommandLineDetailed,
	parseCommandList,
	suggestLowercaseCommand,
	suggestMissingSpace,
	suggestSimilarCommand,
} from "./parser";
import type { DetailedPipeline, ParsedWord } from "./parser";
import type {
	CommandContext,
	CommandDefinition,
	CommandResult,
	CompletionResult,
	ErrorRedirect,
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

/** 開好一條管線所有輸出檔的結果：成功時帶這次新建的目標檔絕對路徑。 */
type OutputTargetsResult = { ok: true; createdPaths: string[] } | { ok: false; lines: string[] };

/** `<` 讀檔的結果：成功時是檔案內容切成的行，失敗時是錯誤訊息。 */
type InputReadResult = { ok: true; lines: string[] } | { ok: false; lines: string[] };

/** `/dev/null` 不在虛擬檔案系統裡，重導向時特判：寫進去的丟掉、讀出來是空的（第十九場）。 */
const DEV_NULL = "/dev/null";

/**
 * 一條管線本身（不含指令替換）跑完的結果。
 * 遊戲的指令不分 stdout 與 stderr：失敗的指令印的全部算錯誤輸出，成功的全部算標準輸出。
 * `stdout`、`stderr` 是最後留在畫面上的部分（導進檔案、丟掉的不在裡面），兩者不會同時有內容。
 */
interface PipelineOutcome {
	ok: boolean;
	exitStatus: number;
	stdout: string[];
	stderr: string[];
	clearScreen: boolean;
	pagers?: PagerRequest[];
}

/**
 * 一段管線的執行結果加上結束碼。結束碼只給 `&&`、`||` 決定要不要跳過右邊，不放進 `ShellExecution`：
 * UI 與目標判定只看 `isError`（`grep` 沒符合這類「不算錯誤的失敗」結束碼是 1，但 `isError` 仍是 false）。
 * `stdout` 是印在畫面上的行裡屬於標準輸出的部分，在 `$( )` 裡執行時被收進替換結果；
 * `stderr` 是其餘的錯誤訊息（含裡層指令替換的），照樣印出來。
 */
interface PipelineRun {
	execution: ShellExecution;
	exitStatus: number;
	stdout: string[];
	stderr: string[];
}

/** 一整行（可能串了好幾段）的執行結果；`stdout`、`stderr` 是每一段的依序接起來，`exitStatus` 是最後執行的那一段的。 */
interface LineRun {
	execution: ShellExecution;
	exitStatus: number;
	stdout: string[];
	stderr: string[];
}

/** 指令替換的結果：去掉結尾換行之前的標準輸出、要印出來的錯誤訊息、結束碼。 */
interface SubstitutionRun {
	output: string;
	stderr: string[];
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
	/** 唯讀變數的名稱，來自劇本、不存檔，見 `CommandContext.readonlyEnv`。 */
	private readonly readonlyEnv: string[];
	/** 這是 `$( )` 開的子 shell：輸出會被收集、不是畫面，所以 `less` 不開分頁器（第十九場）。 */
	private capturingOutput = false;

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
		this.readonlyEnv = [...(options.readonlyEnv ?? [])];
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
	 * 執行規則見 `runLine`。
	 */
	execute(input: string): ShellExecution {
		this.hintUsedInExecution = false;
		// 指令看到的歷史不含目前這一筆，所以先取再 push
		const previousHistory = this.history.entries();
		this.history.push(input);
		return this.runLine(input, previousHistory).execution;
	}

	/**
	 * 執行一行（`execute` 與 `$( )` 的子 shell 共用），不碰歷史。
	 *
	 * 一行可以用 `;`、`&&`、`||` 串成好幾段（M13-2、第十九場）。跟 bash 一樣先解析整行，任一段有語法錯誤
	 * （含 `$( )` 裡面的）就一段都不執行；接著依序執行每一段：`;` 後面的段落一定執行，`&&` 後面的段落只在前一段的
	 * 結束碼是 0 時執行，`||` 後面的段落只在前一段的結束碼不是 0 時執行；被跳過的段落不改結束碼，所以
	 * `&&` 與 `||` 同優先權、由左往右結合（`fail && a || b` 會跑 b）。結束碼跟「算不算錯誤」分開：`grep` 沒符合
	 * 不算錯誤，但 `&&` 照樣跳過右邊、`||` 照樣執行右邊。每一段執行到時才展開變數、指令替換與萬用字元，
	 * 看得到前面段落的副作用。
	 *
	 * 整行算不算錯誤：有一段失敗（`isError`），而且下一個實際執行的段落不是用 `||` 接的（失敗沒被接住）。
	 * `cat 不存在 || echo 沒有` 是玩家刻意處理失敗，不扣氧；`cat 不存在 ; ls` 照樣算一次錯誤。
	 * 輸出依序接起來；每一段的結果放在 `segments` 給目標判定逐段看。
	 */
	private runLine(input: string, previousHistory: string[]): LineRun {
		// 這一步不給 env：只檢查整行語法並切段，變數與指令替換等執行到那一段才用當下的狀態展開
		const list = parseCommandList(input);
		if (!list.ok) {
			const lines = parseError(list.error);
			return { execution: this.finish(input, false, lines, false), exitStatus: 1, stdout: [], stderr: lines };
		}

		const runs: PipelineRun[] = [];
		/** 每一個實際執行的段落前面的連接符號，跟 `runs` 一一對應。 */
		const connectors: (string | null)[] = [];
		let previousStatus = 0;
		for (const item of list.items) {
			if (item.connector === "&&" && previousStatus !== 0) {
				continue;
			}
			if (item.connector === "||" && previousStatus === 0) {
				continue;
			}
			const run = this.executePipeline(item.source, previousHistory);
			runs.push(run);
			connectors.push(item.connector);
			previousStatus = run.exitStatus;
		}

		const stdout = runs.flatMap((run) => run.stdout);
		const stderr = runs.flatMap((run) => run.stderr);

		if (list.items.length <= 1) {
			const only = runs[0];
			if (only === undefined) {
				return { execution: this.finish(input, true, [], false), exitStatus: 0, stdout, stderr };
			}
			return { execution: { ...only.execution, input }, exitStatus: previousStatus, stdout, stderr };
		}

		// 下一個實際執行的段落是用 || 接的，代表這一段的失敗被接住了
		const hasUncaughtError = runs.some((run, index) => run.execution.isError && connectors[index + 1] !== "||");
		const execution = this.combineSegments(
			input,
			runs.map((run) => run.execution),
			!hasUncaughtError,
		);
		return { execution, exitStatus: previousStatus, stdout, stderr };
	}

	/**
	 * 執行一段管線（`;`、`&&`、`||` 切開後的其中一段），`input` 是那一段的原文，用當下的環境變數解析。
	 *
	 * 解析的同時執行指令替換（`$( )`、反引號，第十九場）：每一個都開一個子 shell 跑（見 `runSubstitution`），
	 * 標準輸出代入參數，裡面的錯誤訊息印在這一段輸出的最前面；裡面失敗不影響這一段的成敗與結束碼（bash 行為）。
	 * 執行過的替換輸出記在 `execution.substitutions`，目標判定重新解析時照順序代入。
	 *
	 * 回傳時附上這一段的結束碼（最後一個指令的），`&&`、`||` 用它決定要不要跳過下一段。
	 */
	private executePipeline(input: string, previousHistory: string[]): PipelineRun {
		const substitutionErrors: string[] = [];
		const substitutions: string[] = [];
		let substitutionStatus = 0;
		const substitute = (source: string): string => {
			const result = this.runSubstitution(source, previousHistory);
			substitutionErrors.push(...result.stderr);
			substitutions.push(result.output);
			substitutionStatus = result.exitStatus;
			return result.output;
		};

		const parsed = parseCommandLineDetailed(input, { env: this.currentEnv, home: this.home, substitute });
		let outcome: PipelineOutcome;
		if (!parsed.ok) {
			outcome = { ok: false, exitStatus: 1, stdout: [], stderr: parseError(parsed.error), clearScreen: false };
		} else if (parsed.pipeline === null) {
			// 展開完沒有指令（`$(cat x)` 展開成空的）：結束碼是最後一個指令替換的（bash 行為），不算錯誤
			outcome = { ok: true, exitStatus: substitutionStatus, stdout: [], stderr: [], clearScreen: false };
		} else {
			outcome = this.runPipeline(parsed.pipeline, previousHistory);
		}

		const stderr = [...substitutionErrors, ...outcome.stderr];
		const execution = this.finish(input, outcome.ok, [...stderr, ...outcome.stdout], outcome.clearScreen);
		if (outcome.pagers !== undefined) {
			execution.pagers = outcome.pagers;
		}
		if (substitutions.length > 0) {
			execution.substitutions = substitutions;
		}
		return { execution, exitStatus: outcome.exitStatus, stdout: outcome.stdout, stderr };
	}

	/**
	 * 跑一條已經解析好（變數與指令替換都展開了）的管線。
	 *
	 * 管線依序執行，前一個指令的 `lines` 是下一個的 `stdin`（指令有 `<` 時改讀那個檔案）；任何一個失敗（或不存在）
	 * 就停下，失敗的訊息照那個指令的錯誤輸出設定處理（見 `routeFailure`）。每個指令的副作用（換目錄、hint、
	 * 環境變數、程序清單）都會套用。
	 *
	 * 有輸出重導向時跟 bash 一樣**先開檔再執行**：最後一個指令的 `>` 先建立或清空目標檔、`>>` 在目標不存在時先建空檔，
	 * 每個指令的 `2>`、`2>>` 也一樣，所以指令失敗（例如 `cat missing.txt > out.txt`）也會留下空的目標檔；
	 * 目標本身不合法（父目錄不存在、是目錄）時只回報目標的錯誤，管線一個指令都不執行。
	 * `<` 的檔案在輪到那個指令時才讀，讀不到（不存在、是目錄、沒權限）就停下、那個指令不執行。
	 * 重導向本身的錯誤（開不了、讀不到）一律印在畫面上，不受 `2>` 影響。
	 * 不管哪一種失敗，這一段都只算一次錯誤。`/dev/null` 寫進去的丟掉、讀出來是空的。
	 */
	private runPipeline(pipeline: DetailedPipeline, previousHistory: string[]): PipelineOutcome {
		const redirect = pipeline.redirect;
		const opened = this.openOutputTargets(pipeline);
		if (!opened.ok) {
			return { ok: false, exitStatus: 1, stdout: [], stderr: opened.lines, clearScreen: false };
		}

		let stdin: string[] | null = null;
		let clearScreen = false;
		// 管線的結束碼是最後一個指令的（bash 沒開 pipefail 時的行為），中間的 grep 沒符合不影響
		let exitStatus = 0;
		const commands = pipeline.commands;

		for (const [index, parsedCommand] of commands.entries()) {
			if (parsedCommand.input !== undefined) {
				const read = this.readInputFile(parsedCommand.input);
				if (!read.ok) {
					return { ok: false, exitStatus: 1, stdout: [], stderr: read.lines, clearScreen };
				}
				stdin = read.lines;
			}

			const name = parsedCommand.name.value;
			const command = this.commands.get(name);
			if (command === undefined) {
				return this.routeFailure(parsedCommand.stderr, this.describeUnknownCommand(name), clearScreen);
			}

			const args = this.expandGlobs(parsedCommand.args, opened.createdPaths);
			const result = this.runCommand(command, args, this.buildContext(previousHistory, stdin));
			this.applySideEffects(result);
			if (result.clearScreen === true) {
				clearScreen = true;
			}
			// less 只有在管線最後、輸出直接到畫面時才分頁；其他位置（含 $( ) 裡面）照真的 less 把內容當一般輸出
			const isLast = index === commands.length - 1;
			if (isLast && redirect === null && !this.capturingOutput && result.pager !== undefined) {
				const routed = this.routeFailure(parsedCommand.stderr, result.pager.lines, clearScreen);
				return { ...routed, ok: result.ok, exitStatus: exitStatusOf(result), pagers: [result.pager.request] };
			}
			if (!result.ok) {
				return this.routeFailure(parsedCommand.stderr, result.lines, clearScreen);
			}
			stdin = result.lines;
			exitStatus = exitStatusOf(result);
		}

		const output = stdin ?? [];
		if (redirect === null) {
			return { ok: true, exitStatus, stdout: output, stderr: [], clearScreen };
		}

		const redirectError = this.writeRedirect(redirect, output);
		if (redirectError !== null) {
			return { ok: false, exitStatus: 1, stdout: [], stderr: redirectError, clearScreen };
		}
		return { ok: true, exitStatus, stdout: [], stderr: [], clearScreen };
	}

	/**
	 * 指令失敗：它印的訊息算錯誤輸出，照這個指令的錯誤輸出設定處理，結束碼 1、仍然算錯誤（扣氧照舊）。
	 * 沒有設定時印在畫面上；`2>`、`2>>`（含換算過的 `> 檔案 2>&1`、`&>`）寫進檔案，`/dev/null` 丟掉；
	 * `2>&1` 寫在 `>` 前面或沒有 `>` 時走標準輸出原本的去處（畫面，在 `$( )` 裡就被收進結果）。
	 */
	private routeFailure(target: ErrorRedirect | undefined, lines: string[], clearScreen: boolean): PipelineOutcome {
		if (target === undefined) {
			return { ok: false, exitStatus: 1, stdout: [], stderr: lines, clearScreen };
		}
		if (target.kind === "toStdout") {
			return { ok: false, exitStatus: 1, stdout: lines, stderr: [], clearScreen };
		}
		const writeError = this.writeRedirect(target, lines);
		return { ok: false, exitStatus: 1, stdout: [], stderr: writeError ?? [], clearScreen };
	}

	/**
	 * 執行一個指令替換：開一個子 shell 跑 `source`（可以有管線、`;`、`&&`、`||` 與巢狀的 `$( )`）。
	 *
	 * 子 shell 拿到目前的工作目錄、環境變數、程序清單、hint 計數與歷史的拷貝，跑完就丟：裡面的 `cd`、`export`、`kill`
	 * 不影響外面，`hint` 不算用過，`clear` 不清畫面，`less` 不開分頁器。檔案系統是同一個，所以裡面寫的檔案會留下來。
	 * 標準輸出（含 `2>&1` 收進來的錯誤訊息）是替換的結果；其餘錯誤訊息回給外層印出來。
	 */
	private runSubstitution(source: string, previousHistory: string[]): SubstitutionRun {
		const child = new Shell(
			{
				...this.options,
				cwd: this.currentCwd,
				history: previousHistory,
				hintCount: this.currentHintCount,
				learnedCommands: this.learned,
				env: this.currentEnv,
				processes: this.currentProcesses,
				readonlyEnv: this.readonlyEnv,
			},
			[...this.commands.values()],
		);
		child.capturingOutput = true;
		const run = child.runLine(source, previousHistory);
		return { output: run.stdout.join("\n"), stderr: run.stderr, exitStatus: run.exitStatus };
	}

	/**
	 * 把好幾段的結果合成整行的結果：輸出依序接起來，遇到清畫面的段落就丟掉它之前的輸出
	 * （`ls ; clear ; pwd` 畫面上只剩 pwd 的輸出）；`ok` 由呼叫端依「失敗有沒有被 `||` 接住」決定。
	 */
	private combineSegments(input: string, segments: ShellExecution[], ok: boolean): ShellExecution {
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
	 * `readonlyEnv` 來自劇本、不在存檔裡，由呼叫端從終端機定義帶入。
	 */
	static fromState(
		state: ShellSessionState,
		fs: ShellOptions["fs"],
		hints: string[],
		home?: string,
		readonlyEnv?: string[],
	): Shell {
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
			readonlyEnv,
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
			readonlyEnv: [...this.readonlyEnv],
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
	 * `excludedPaths` 是這一行的重導向剛建立的目標檔（絕對路徑）：bash 先展開萬用字元才開檔，
	 * 所以 `cat *.log > all.log` 配不到新建的 `all.log`。
	 */
	private expandGlobs(args: ParsedWord[], excludedPaths: string[]): string[] {
		const fs = this.options.fs;
		const expanded: string[] = [];
		for (const arg of args) {
			if (arg.quoted || !GLOB_CHAR_PATTERN.test(arg.value)) {
				expanded.push(arg.value);
				continue;
			}
			const matches = fs
				.glob(this.currentCwd, arg.value)
				.filter((match) => !excludedPaths.includes(fs.resolvePath(this.currentCwd, match)));
			if (matches.length === 0) {
				expanded.push(arg.value);
			} else {
				expanded.push(...matches);
			}
		}
		return expanded;
	}

	/** 這個重導向目標是不是 `/dev/null`（相對路徑寫到那裡也算）。 */
	private isDevNull(target: string): boolean {
		return this.options.fs.resolvePath(this.currentCwd, target) === DEV_NULL;
	}

	/**
	 * 執行前先開好這條管線所有要寫的檔案（bash 行為）：最後一個指令的 `>`、`>>`，再來是每個指令的 `2>`、`2>>`。
	 * 任何一個開不了就停下，回傳那個目標的錯誤。
	 */
	private openOutputTargets(pipeline: DetailedPipeline): OutputTargetsResult {
		const targets: Redirect[] = [];
		if (pipeline.redirect !== null) {
			targets.push(pipeline.redirect);
		}
		for (const command of pipeline.commands) {
			if (command.stderr !== undefined && command.stderr.kind !== "toStdout") {
				targets.push(command.stderr);
			}
		}

		const createdPaths: string[] = [];
		for (const target of targets) {
			const opened = this.openRedirect(target);
			if (!opened.ok) {
				return opened;
			}
			if (opened.createdPath !== null) {
				createdPaths.push(opened.createdPath);
			}
		}
		return { ok: true, createdPaths };
	}

	/** 讀 `<` 的檔案，內容照 `cat` 的規則切成行；`/dev/null` 讀到空的。 */
	private readInputFile(target: string): InputReadResult {
		if (this.isDevNull(target)) {
			return { ok: true, lines: [] };
		}
		try {
			return { ok: true, lines: splitContentLines(this.options.fs.readFile(this.currentCwd, target)) };
		} catch (error) {
			if (error instanceof FsError) {
				return { ok: false, lines: fsError(error.code, error.path) };
			}
			throw error;
		}
	}

	/**
	 * 執行指令前先開重導向的目標檔（bash 行為）：覆寫的建立或清空，追加的不存在時建立空檔、存在時不動。
	 * 成功時帶「這次新建的目標檔」絕對路徑（原本就存在則為 null），失敗（父目錄不存在、目標是目錄等）帶要印的錯誤訊息。
	 * `/dev/null` 不建檔。
	 */
	private openRedirect(redirect: Redirect): RedirectOpenResult {
		if (this.isDevNull(redirect.target)) {
			return { ok: true, createdPath: null };
		}
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
	 * 目標檔在執行前已經由 `openRedirect` 開好，這裡只是把內容寫進去；`/dev/null` 直接丟掉。
	 * 成功回傳 null，失敗回傳要印的錯誤訊息。
	 */
	private writeRedirect(redirect: Redirect, lines: string[]): string[] | null {
		if (this.isDevNull(redirect.target)) {
			return null;
		}
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
	 * 指令不存在時依序找最可能的原因，都不中才說找不到：
	 * 1. 用完整路徑打指令（照抄 `which ls` 印的 `/usr/bin/ls`）
	 * 2. 忘記空格，例如 `cdpod_06` 建議 `cd pod_06`
	 * 3. 常見但這台站沒有的程式，例如 `vim`、`apt`、Windows 的 `dir`
	 * 4. 大小寫打錯，例如 `LS`、`Cd`
	 * 5. 打錯字，例如 `gerp` 建議 `grep`（同分時已學的優先）
	 * 不管哪一種都仍然算錯誤。
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
		const program = findUnavailableProgram(name);
		if (program !== null) {
			return programNotInstalled(name, program);
		}
		const lower = suggestLowercaseCommand(name, this.commandNames);
		if (lower !== null) {
			return commandIsLowercase(name, lower);
		}
		const similar = suggestSimilarCommand(name, this.commandNames, this.learned);
		if (similar !== null) {
			return similarCommand(name, similar);
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
