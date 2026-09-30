/**
 * `pwd`：印出目前所在的目錄。
 */

import type { CommandDefinition } from "../types";

export const pwdCommand: CommandDefinition = {
	name: "pwd",
	run(_args, context) {
		// 多餘的參數直接忽略，不報錯，避免新手因為多打字被懲罰
		return { ok: true, lines: [context.cwd] };
	},
};
