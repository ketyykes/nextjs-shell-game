/**
 * `help` 指令：只列出目前學過的指令。
 *
 * 設計上所有已實作的指令都能打，但 help 只列已學的，
 * 新手不會被沒教過的東西干擾。`help <指令>` 等同 `man <指令>`。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { COMMAND_DOC_ORDER, getCommandDoc } from "./docs";
import { manCommand } from "./man";

const HELP_TITLE = "目前會的指令：";
const HELP_FOOTER = "輸入 man <指令> 看詳細說明，卡關輸入 hint。";
const HELP_NOTHING_LEARNED = "目前還沒學會任何指令，卡關的話輸入 hint 會給你提示。";

/**
 * 依顯示順序排列已學指令：先照 `COMMAND_DOC_ORDER`，
 * 不在順序表裡的排在最後，維持學會的順序。同名只留一個。
 */
function sortLearnedCommands(learnedCommands: string[]): string[] {
	const learned = [...new Set(learnedCommands)];
	const inOrder = COMMAND_DOC_ORDER.filter((name) => learned.includes(name));
	const others = learned.filter((name) => !COMMAND_DOC_ORDER.includes(name));
	return [...inOrder, ...others];
}

/** 組出「名稱  一句話說明」的列表，名稱欄寬對齊最長的名稱。 */
function formatCommandList(names: string[]): string[] {
	const nameWidth = Math.max(...names.map((name) => name.length));

	return names.map((name) => {
		const doc = getCommandDoc(name);
		if (doc === undefined) {
			return name;
		}
		return `${name.padEnd(nameWidth)}  ${doc.summary}`;
	});
}

function listLearnedCommands(context: CommandContext): CommandResult {
	const names = sortLearnedCommands(context.learnedCommands);

	if (names.length === 0) {
		return { ok: true, lines: [HELP_NOTHING_LEARNED] };
	}

	return {
		ok: true,
		lines: [HELP_TITLE, ...formatCommandList(names), HELP_FOOTER],
	};
}

export const helpCommand: CommandDefinition = {
	name: "help",
	run(args, context): CommandResult {
		if (args.length > 0) {
			return manCommand.run(args, context);
		}
		return listLearnedCommands(context);
	},
};
