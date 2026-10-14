/**
 * `sudo`：用系統管理員的身分執行指令（第十七場的彩蛋，只開放使用，不在任何章節的 `teaches` 裡）。
 *
 * tech 不在 sudoers 名單裡，所以不管後面接什麼都被拒絕，照真的 sudo 說「這件事會被回報」。
 * 被拒絕是彩蛋不是打錯，所以不算錯誤（`ok: true`、不扣氧），結束碼照 sudo 是 1，`sudo x && y` 不會往下跑。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { PLAYER_USER } from "../types";
import { sudoDenied } from "../messages";

export const sudoCommand: CommandDefinition = {
	name: "sudo",
	run(): CommandResult {
		return { ok: true, lines: sudoDenied(PLAYER_USER), exitStatus: 1 };
	},
};
