/**
 * 救援船 ARGO 醫療終端機的 shell session（設計文件 4.23），比照沙盒的 `src/game/sandbox/session.ts`。
 *
 * 跟遊戲裡的終端機用同一個 `Shell`，差別：
 * - 檔案系統依存檔的阿彬留言進度組裝（`buildArgoSnapshot`），環境變數、程序清單來自 `argo.ts`；每次呼叫都重新建一份。
 * - 提示符是 `tech@argo`。
 * - 所有已註冊的指令都算學過，`help` 全部列出。
 * - `hint` 輪流給「可以看看什麼」，不會說「提示已經全部給過了」。
 * - `id`、`last`、`top`、`kill`、`sudo`、`exit`、`logout` 換成救援船版：帳號表、登入紀錄、標題與訊息都不說「這座站」。
 *
 * 這個檔案跟 shell 引擎一樣不 import React 或 Phaser。
 */

import { ALL_COMMANDS } from "@/game/shell/commands";
import { createExitLikeCommand } from "@/game/shell/commands/exit";
import { createIdCommand } from "@/game/shell/commands/id";
import { createKillCommand } from "@/game/shell/commands/kill";
import { createLastCommand } from "@/game/shell/commands/last";
import { createSudoCommand } from "@/game/shell/commands/sudo";
import { createTopCommand } from "@/game/shell/commands/top";
import { VirtualFileSystem } from "@/game/shell/fs";
import { argoCannotExit, argoNoSuchUser, argoProcessProtected, argoSudoDenied } from "@/game/shell/messages";
import { Shell } from "@/game/shell/shell";
import type { CommandDefinition, CommandResult } from "@/game/shell/types";
import {
	ARGO_ACCOUNTS,
	ARGO_ENV,
	ARGO_LOGIN_LOG,
	ARGO_PROCESSES,
	ARGO_TIPS,
	ARGO_TOP_TITLE,
	buildArgoSnapshot,
	type ArgoProgress,
} from "./argo";

/** 救援船終端機的 id，不帶章節前綴，跟劇本的 `chN-tM`、沙盒的 `sandbox` 都不會撞。 */
export const ARGO_TERMINAL_ID = "argo";

/** 提示符的帳號與主機。 */
export const ARGO_PROMPT_USER_HOST = "tech@argo";

/** 救援船版 `hint`：第 n 次給第 n 則，用完繞回第一則。 */
const argoHintCommand: CommandDefinition = {
	name: "hint",
	run(_args, context): CommandResult {
		const index = context.hintCount % ARGO_TIPS.length;
		const tip = ARGO_TIPS[index] ?? "";
		return { ok: true, lines: [`可以看看 ${index + 1}/${ARGO_TIPS.length}：${tip}`], hintUsed: true };
	},
};

/** 換成救援船版的指令，依名稱取代 `ALL_COMMANDS` 裡的同名指令。 */
const ARGO_OVERRIDES: CommandDefinition[] = [
	argoHintCommand,
	createIdCommand(ARGO_ACCOUNTS, argoNoSuchUser),
	createLastCommand(ARGO_LOGIN_LOG),
	createTopCommand(ARGO_TOP_TITLE),
	createKillCommand(argoProcessProtected),
	createSudoCommand(argoSudoDenied),
	createExitLikeCommand("exit", argoCannotExit),
	createExitLikeCommand("logout", argoCannotExit),
];

const ARGO_COMMANDS: CommandDefinition[] = ALL_COMMANDS.map((command) => {
	const override = ARGO_OVERRIDES.find((candidate) => candidate.name === command.name);
	if (override !== undefined) {
		return override;
	}
	return command;
});

/** 依存檔的阿彬留言進度建立一個全新的救援船 session。 */
export function createArgoShell(progress: ArgoProgress): Shell {
	return new Shell(
		{
			fs: VirtualFileSystem.fromSnapshot(buildArgoSnapshot(progress)),
			terminalId: ARGO_TERMINAL_ID,
			hints: [],
			learnedCommands: ARGO_COMMANDS.map((command) => command.name),
			env: ARGO_ENV,
			processes: ARGO_PROCESSES,
			promptUserHost: ARGO_PROMPT_USER_HOST,
		},
		ARGO_COMMANDS,
	);
}
