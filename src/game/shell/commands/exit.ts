/**
 * `exit`、`logout`：結束 shell（第十七場的彩蛋，只開放使用，不在任何章節的 `teaches` 裡）。
 *
 * 遊戲的終端機是彈窗，shell 不能自己關掉它，所以只說明要按 Esc。
 * 沒關成不算打錯，不算錯誤（`ok: true`、不扣氧）；結束碼是 1，`exit && ls` 不會往下跑（bash 在 exit 之後什麼都不會執行）。
 *
 * 說明文字用 `createExitLikeCommand` 注入：遊戲用 `cannotExit`（按 Esc 只是關畫面），
 * 沙盒換成 `sandboxCannotExit`（按 Esc 會先問要不要回標題，回去就全部重來）。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { cannotExit } from "../messages";

/** 建立一個只說明要按 Esc 的指令，`message` 依指令名稱產生說明。 */
export function createExitLikeCommand(name: string, message: (command: string) => string[] = cannotExit): CommandDefinition {
	return {
		name,
		run(): CommandResult {
			return { ok: true, lines: message(name), exitStatus: 1 };
		},
	};
}

export const exitCommand: CommandDefinition = createExitLikeCommand("exit");

export const logoutCommand: CommandDefinition = createExitLikeCommand("logout");
