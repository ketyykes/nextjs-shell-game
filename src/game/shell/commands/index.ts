/**
 * 指令註冊表。
 *
 * 新增指令時在這裡加進 `ALL_COMMANDS`，shell 就認得它；
 * 同時記得到 `docs.ts` 補說明，`man` 與側邊面板才查得到。
 */

import { catCommand } from "./cat";
import { cdCommand } from "./cd";
import { clearCommand } from "./clear";
import { helpCommand } from "./help";
import { hintCommand } from "./hint";
import { historyCommand } from "./history";
import { lsCommand } from "./ls";
import { manCommand } from "./man";
import { pwdCommand } from "./pwd";
import type { CommandDefinition } from "../types";

/** 第一章可用的全部指令。順序不影響行為，只是方便閱讀。 */
export const ALL_COMMANDS: CommandDefinition[] = [
	pwdCommand,
	lsCommand,
	cdCommand,
	catCommand,
	helpCommand,
	hintCommand,
	manCommand,
	historyCommand,
	clearCommand,
];

export { catCommand, cdCommand, clearCommand, helpCommand, hintCommand, historyCommand, lsCommand, manCommand, pwdCommand };
export { COMMAND_DOC_ORDER, COMMAND_DOCS, getCommandDoc } from "./docs";
