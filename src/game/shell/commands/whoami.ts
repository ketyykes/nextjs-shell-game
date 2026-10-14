/**
 * `whoami`：印出登入的帳號名稱（第十七場的彩蛋，只開放使用，不在任何章節的 `teaches` 裡）。
 *
 * 看的是登入的帳號（`PLAYER_USER`），不是環境變數 `USER`，跟真的 whoami 看有效 uid 一樣，
 * 所以 `export USER=別的名字` 改不了它。輸出只有一行，可以接管線。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { PLAYER_USER } from "../types";
import { extraOperand, unknownOption } from "../messages";

export const whoamiCommand: CommandDefinition = {
	name: "whoami",
	run(args): CommandResult {
		const first = args[0];
		if (first === undefined) {
			return { ok: true, lines: [PLAYER_USER] };
		}
		if (first.startsWith("-")) {
			return { ok: false, lines: unknownOption("whoami", first) };
		}
		return { ok: false, lines: extraOperand("whoami", first, "whoami") };
	},
};
