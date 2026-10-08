/**
 * 開終端機時建立或還原 Shell（從 PlayScreen 抽出來，方便單元測試），以及終端機輸出區用的小工具。純函式，不碰 store。
 *
 * - 存檔沒有這台：用劇本的初始快照建 Shell，回傳第一筆 session（帶 banner）給呼叫端寫進 store。
 * - 存檔有這台而且完好：從存檔還原（含修改過的檔案系統），不用另存。
 * - 存檔有這台但壞掉（M12-5、審計 A16）：console.warn 後丟掉，跟第一次開一樣用劇本初始狀態重建，
 *   環境反應階梯的計數也歸零。只動這一台，其他終端機與進度不受影響。
 *   以前這種情況會在 `terminal:open` 的 handler 裡丟例外，按 E 沒反應、Phaser 迴圈也跟著卡死。
 */

import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { TerminalDefinition } from "@/game/story";
import { isTerminalSessionRecord } from "@/game/store/sessionRecord";
import type { OutputEntry, TerminalSessionRecord } from "@/game/store/types";

export interface ResolvedTerminalSession {
	shell: Shell;
	/** 不是 null 時呼叫端要把它寫進 store：第一次開這台，或存檔壞掉被丟掉重建。 */
	freshRecord: TerminalSessionRecord | null;
}

/** `teaches` 可能是 `ls -a` 這種帶參數的字串，shell 的已學清單只認指令名。 */
export function toCommandName(teach: string): string {
	return teach.split(/\s+/)[0] ?? teach;
}

/** 把 NOVA 的一串台詞變成終端機內嵌的對話區塊。id 前綴跟 Terminal 自己產的 `entry-` 區隔。 */
export function createDialogueEntries(prefix: string, lines: string[]): OutputEntry[] {
	return lines.map((text, index) => ({ kind: "dialogue", id: `${prefix}-${index}`, speaker: "NOVA", text }));
}

/** 開啟終端機時的歡迎行，來自劇本的 `banner`。 */
function createBannerEntries(definition: TerminalDefinition): OutputEntry[] {
	if (definition.banner === undefined || definition.banner.length === 0) {
		return [];
	}
	return [{ kind: "system", id: `banner-${definition.id}`, lines: definition.banner }];
}

/** 用劇本的初始快照建一個全新的 Shell。 */
function createInitialShell(definition: TerminalDefinition, commandNames: string[]): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(definition.fs),
		terminalId: definition.id,
		hints: definition.hints,
		learnedCommands: commandNames,
		cwd: definition.initialCwd,
		env: definition.env,
		processes: definition.processes,
	});
}

/**
 * 從存檔還原 Shell，存檔壞掉時回傳 null。
 * 形狀先用 schema 擋，序列化版本不支援這類只有還原時才知道的問題用 try/catch 接。
 */
function restoreShell(definition: TerminalDefinition, commandNames: string[], record: unknown): Shell | null {
	if (!isTerminalSessionRecord(record)) {
		return null;
	}
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
): ResolvedTerminalSession {
	if (record !== undefined) {
		const restored = restoreShell(definition, commandNames, record);
		if (restored !== null) {
			return { shell: restored, freshRecord: null };
		}
		console.warn(`[terminalSession] 終端機 ${definition.id} 的存檔壞掉了，丟掉這台的紀錄並用劇本初始狀態重建。`);
	}

	const shell = createInitialShell(definition, commandNames);
	const freshRecord: TerminalSessionRecord = { shell: shell.toState(), transcript: createBannerEntries(definition) };
	if (record !== undefined) {
		// 壞掉的那筆可能帶著亂掉的階梯計數，saveTerminalSession 沒收到 errorCount 會沿用舊值，所以明確歸零
		freshRecord.errorCount = 0;
	}
	return { shell, freshRecord };
}
