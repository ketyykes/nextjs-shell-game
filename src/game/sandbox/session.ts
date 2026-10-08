/**
 * 沙盒練習模式的 shell session（M14-3）。
 *
 * 跟遊戲裡的終端機用同一個 `Shell`，差別只有三個：
 * - 檔案系統、環境變數、程序清單來自 `practice.ts`，每次呼叫都重新建一份，重置就是再呼叫一次。
 * - 所有已註冊的指令都算學過，`help` 全部列出。
 * - `hint` 換成沙盒版，輪流給練習建議，不會說「提示已經全部給過了」。
 *
 * 這個檔案跟 shell 引擎一樣不 import React 或 Phaser。
 */

import { ALL_COMMANDS } from "@/game/shell/commands";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { CommandDefinition, CommandResult } from "@/game/shell/types";
import { SANDBOX_ENV, SANDBOX_FS, SANDBOX_PROCESSES, SANDBOX_TIPS } from "./practice";

/** 沙盒的終端機 id，不帶章節前綴，跟劇本的 `chN-tM` 不會撞。 */
export const SANDBOX_TERMINAL_ID = "sandbox";

/** 沙盒版 `hint`：第 n 次給第 n 則建議，用完繞回第一則。 */
export const sandboxHintCommand: CommandDefinition = {
	name: "hint",
	run(_args, context): CommandResult {
		const index = context.hintCount % SANDBOX_TIPS.length;
		const tip = SANDBOX_TIPS[index] ?? "";
		return { ok: true, lines: [`練習建議 ${index + 1}/${SANDBOX_TIPS.length}：${tip}`], hintUsed: true };
	},
};

/** 全部指令，只把 `hint` 換成沙盒版。 */
const SANDBOX_COMMANDS: CommandDefinition[] = ALL_COMMANDS.map((command) => {
	if (command.name === sandboxHintCommand.name) {
		return sandboxHintCommand;
	}
	return command;
});

/** 建立一個全新的練習 session；重置時再呼叫一次即可。 */
export function createSandboxShell(): Shell {
	return new Shell(
		{
			fs: VirtualFileSystem.fromSnapshot(SANDBOX_FS),
			terminalId: SANDBOX_TERMINAL_ID,
			hints: [],
			learnedCommands: SANDBOX_COMMANDS.map((command) => command.name),
			env: SANDBOX_ENV,
			processes: SANDBOX_PROCESSES,
		},
		SANDBOX_COMMANDS,
	);
}
