/**
 * `clear` 指令：要求 UI 清空輸出區，不影響目錄與歷史。
 */

import type { CommandDefinition, CommandResult } from "../types";

export const clearCommand: CommandDefinition = {
	name: "clear",
	run(): CommandResult {
		return { ok: true, lines: [], clearScreen: true };
	},
};
