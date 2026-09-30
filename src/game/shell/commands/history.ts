/**
 * `history` 指令：列出這個 session 打過的指令，最舊在前。
 */

import { historyEmpty } from "../messages";
import type { CommandDefinition, CommandResult } from "../types";

/** 編號欄的寬度，右對齊。 */
const NUMBER_WIDTH = 4;

export const historyCommand: CommandDefinition = {
	name: "history",
	run(_args, context): CommandResult {
		if (context.history.length === 0) {
			return { ok: true, lines: historyEmpty() };
		}

		const lines = context.history.map((entry, index) => {
			const number = String(index + 1).padStart(NUMBER_WIDTH);
			return `${number}  ${entry}`;
		});

		return { ok: true, lines };
	},
};
