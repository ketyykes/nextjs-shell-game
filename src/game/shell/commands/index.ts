/**
 * 指令註冊表。
 *
 * 新增指令時在這裡加進 `ALL_COMMANDS`，shell 就認得它；
 * 同時記得到 `docs.ts`（或各章的 `docs*.ts`）補說明，`man` 與側邊面板才查得到。
 * 設計文件 4.8：所有已實作的指令都能打，`help` 只列學過的。
 */

import { catCommand } from "./cat";
import { cdCommand } from "./cd";
import { chmodCommand } from "./chmod";
import { clearCommand } from "./clear";
import { cpCommand } from "./cp";
import { cutCommand } from "./cut";
import { diffCommand } from "./diff";
import { echoCommand } from "./echo";
import { envCommand } from "./env";
import { exportCommand } from "./export";
import { findCommand } from "./find";
import { grepCommand } from "./grep";
import { headCommand } from "./head";
import { helpCommand } from "./help";
import { hintCommand } from "./hint";
import { historyCommand } from "./history";
import { killCommand } from "./kill";
import { lessCommand } from "./less";
import { lsCommand } from "./ls";
import { manCommand } from "./man";
import { mkdirCommand } from "./mkdir";
import { mvCommand } from "./mv";
import { psCommand } from "./ps";
import { pwdCommand } from "./pwd";
import { rmCommand } from "./rm";
import { sortCommand } from "./sort";
import { tailCommand } from "./tail";
import { topCommand } from "./top";
import { touchCommand } from "./touch";
import { treeCommand } from "./tree";
import { uniqCommand } from "./uniq";
import { wcCommand } from "./wc";
import { whichCommand } from "./which";
import type { CommandDefinition } from "../types";

/** 全部指令：六章依章節排列，最後是 M13-3 只開放使用的指令。順序不影響行為，只是方便閱讀。 */
export const ALL_COMMANDS: CommandDefinition[] = [
	// 第一章
	pwdCommand,
	lsCommand,
	cdCommand,
	catCommand,
	helpCommand,
	hintCommand,
	manCommand,
	historyCommand,
	clearCommand,
	// 第二章
	headCommand,
	tailCommand,
	wcCommand,
	grepCommand,
	findCommand,
	// 第三章
	mkdirCommand,
	touchCommand,
	cpCommand,
	mvCommand,
	rmCommand,
	// 第四章
	echoCommand,
	sortCommand,
	uniqCommand,
	// 第五章
	exportCommand,
	envCommand,
	chmodCommand,
	// 第六章
	psCommand,
	topCommand,
	killCommand,
	// M13-3：只開放使用，不在劇本裡
	treeCommand,
	cutCommand,
	diffCommand,
	whichCommand,
	lessCommand,
];

export { catCommand, cdCommand, clearCommand, helpCommand, hintCommand, historyCommand, lsCommand, manCommand, pwdCommand };
export { COMMAND_DOC_ORDER, COMMAND_DOCS, getCommandDoc } from "./docs";
