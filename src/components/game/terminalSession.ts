/**
 * 開終端機時建立或還原 Shell（從 PlayScreen 抽出來，方便單元測試），以及終端機輸出區用的小工具。純函式，不碰 store。
 *
 * - 存檔沒有這台：用劇本的初始快照建 Shell，回傳第一筆 session（帶 banner 與劇本雜湊）給呼叫端寫進 store。
 * - 存檔有這台而且完好：從存檔還原（含修改過的檔案系統），不用另存。
 * - 存檔有這台但壞掉（M12-5、審計 A16）：console.warn 後丟掉，跟第一次開一樣用劇本初始狀態重建，
 *   環境反應階梯的計數也歸零。只動這一台，其他終端機與進度不受影響。
 *   以前這種情況會在 `terminal:open` 的 handler 裡丟例外，按 E 沒反應、Phaser 迴圈也跟著卡死。
 * - 劇本改版（M12-4、審計 G1）：存檔的 `scriptHash` 跟最新劇本對不上（v2 以前的紀錄沒有雜湊也算），
 *   而且這台**還沒過關**時，用新版劇本重建檔案系統、工作目錄、env 與程序清單，
 *   保留指令歷史、hint 計數、錯誤計數與輸出紀錄，輸出區再補一行系統說明與新版 banner。
 *   已過關的終端機不動：玩家的成果都在那份檔案系統裡，而且過關後劇本內容對進度沒有影響。
 */

import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { TerminalDefinition } from "@/game/story";
import { terminalScriptHash } from "@/game/story/scriptHash";
import { isTerminalSessionRecord } from "@/game/store/sessionRecord";
import { TRANSCRIPT_LIMIT } from "@/game/store/types";
import type { OutputEntry, TerminalSessionRecord } from "@/game/store/types";

/** 劇本改版後重建時插在輸出區的系統行。 */
export const SCRIPT_UPDATED_LINES: string[] = [
	"［系統］這台終端機的資料已更新到新版本：檔案、工作目錄與環境變數回到初始狀態，指令歷史與提示次數保留。",
];

export interface ResolvedTerminalSession {
	shell: Shell;
	/** 不是 null 時呼叫端要把它寫進 store：第一次開這台、存檔壞掉被丟掉重建，或劇本改版重建。 */
	freshRecord: TerminalSessionRecord | null;
}

export interface TerminalSessionOptions {
	/** 這台是否已經過關；過關的不因劇本改版重建。 */
	solved: boolean;
}

/** `teaches` 可能是 `ls -a` 這種帶參數的字串，shell 的已學清單只認指令名。 */
export function toCommandName(teach: string): string {
	return teach.split(/\s+/)[0] ?? teach;
}

/** 把 NOVA 的一串台詞變成終端機內嵌的對話區塊。id 前綴跟 Terminal 自己產的 `entry-` 區隔。 */
export function createDialogueEntries(prefix: string, lines: string[]): OutputEntry[] {
	return lines.map((text, index) => ({ kind: "dialogue", id: `${prefix}-${index}`, speaker: "NOVA", text }));
}

/** 開啟終端機時的歡迎行，來自劇本的 `banner`；`idSuffix` 讓改版後補印的那份不跟舊的撞 key。 */
function createBannerEntries(definition: TerminalDefinition, idSuffix = ""): OutputEntry[] {
	if (definition.banner === undefined || definition.banner.length === 0) {
		return [];
	}
	return [{ kind: "system", id: `banner-${definition.id}${idSuffix}`, lines: definition.banner }];
}

/** 改版重建時從舊 session 帶過來的狀態。 */
interface CarriedShellState {
	history?: string[];
	hintCount?: number;
}

/** 用劇本的初始快照建一個全新的 Shell；改版重建時帶入舊的歷史與 hint 計數。 */
function createInitialShell(
	definition: TerminalDefinition,
	commandNames: string[],
	carried: CarriedShellState = {},
): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(definition.fs),
		terminalId: definition.id,
		hints: definition.hints,
		learnedCommands: commandNames,
		cwd: definition.initialCwd,
		env: definition.env,
		processes: definition.processes,
		history: carried.history,
		hintCount: carried.hintCount,
	});
}

/** 從存檔還原 Shell；序列化版本不支援這類只有還原時才知道的問題用 try/catch 接，壞掉回傳 null。 */
function restoreShell(
	definition: TerminalDefinition,
	commandNames: string[],
	record: TerminalSessionRecord,
): Shell | null {
	try {
		const shell = Shell.fromState(record.shell, VirtualFileSystem.fromSerialized(record.shell.fs), definition.hints);
		for (const name of commandNames) {
			shell.learn(name);
		}
		return shell;
	} catch {
		return null;
	}
}

/** 劇本改版：用新版劇本重建，保留歷史、hint 計數、錯誤計數與輸出紀錄，輸出區補一行說明與新 banner。 */
function rebuildForRevisedScript(
	definition: TerminalDefinition,
	commandNames: string[],
	record: TerminalSessionRecord,
	scriptHash: string,
): ResolvedTerminalSession {
	const shell = createInitialShell(definition, commandNames, {
		history: record.shell.history,
		hintCount: record.shell.hintCount,
	});
	const notice: OutputEntry = {
		kind: "system",
		id: `script-updated-${definition.id}-${scriptHash}`,
		lines: SCRIPT_UPDATED_LINES,
	};
	let transcript = [...record.transcript, notice, ...createBannerEntries(definition, `-${scriptHash}`)];
	if (transcript.length > TRANSCRIPT_LIMIT) {
		transcript = transcript.slice(transcript.length - TRANSCRIPT_LIMIT);
	}
	const freshRecord: TerminalSessionRecord = {
		shell: shell.toState(),
		transcript,
		errorCount: record.errorCount ?? 0,
		scriptHash,
	};
	return { shell, freshRecord };
}

/**
 * 依存檔建立或還原某台終端機的 Shell。
 *
 * @param commandNames 已學指令的指令名（不帶參數），新 Shell 用它當已學清單，還原的 Shell 也補學一次。
 * @param record 存檔裡這台的 session，沒有就是 undefined；型別是 unknown，因為存檔內容不可信。
 */
export function createTerminalSession(
	definition: TerminalDefinition,
	commandNames: string[],
	record: unknown,
	options: TerminalSessionOptions,
): ResolvedTerminalSession {
	const scriptHash = terminalScriptHash(definition);

	if (record !== undefined) {
		// 形狀先用 schema 擋，對得上才看雜湊或還原
		if (isTerminalSessionRecord(record)) {
			const revised = record.scriptHash !== scriptHash;
			if (revised && !options.solved) {
				return rebuildForRevisedScript(definition, commandNames, record, scriptHash);
			}
			const restored = restoreShell(definition, commandNames, record);
			if (restored !== null) {
				return { shell: restored, freshRecord: null };
			}
		}
		console.warn(`[terminalSession] 終端機 ${definition.id} 的存檔壞掉了，丟掉這台的紀錄並用劇本初始狀態重建。`);
	}

	const shell = createInitialShell(definition, commandNames);
	const freshRecord: TerminalSessionRecord = {
		shell: shell.toState(),
		transcript: createBannerEntries(definition),
		scriptHash,
	};
	if (record !== undefined) {
		// 壞掉的那筆可能帶著亂掉的階梯計數，saveTerminalSession 沒收到 errorCount 會沿用舊值，所以明確歸零
		freshRecord.errorCount = 0;
	}
	return { shell, freshRecord };
}
