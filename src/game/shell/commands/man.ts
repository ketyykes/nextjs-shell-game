/**
 * `man` 指令：顯示指令的詳細說明。
 *
 * 說明資料來自 `docs.ts`，與側邊面板的「已學指令」是同一份。
 * 未學過的指令也可以查，設計上所有已實作的指令都開放使用。
 */

import { manNotFound, missingOperand } from "../messages";
import type { CommandDefinition, CommandDoc, CommandResult } from "../types";
import { getCommandDoc } from "./docs";

/** 範例的縮排：指令縮 2 格，說明再往內縮到 6 格。 */
const EXAMPLE_COMMAND_INDENT = "  ";
const EXAMPLE_EXPLANATION_INDENT = "      ";

/** 把一份指令說明排成終端機的行，空行用空字串表示。 */
function formatDoc(doc: CommandDoc): string[] {
	const lines: string[] = [];

	lines.push(`${doc.name} — ${doc.summary}`);
	lines.push("");
	lines.push(`用法：${doc.usage}`);
	lines.push("");
	lines.push(...doc.description);

	if (doc.examples.length > 0) {
		lines.push("");
		lines.push("範例：");
		for (const example of doc.examples) {
			lines.push(`${EXAMPLE_COMMAND_INDENT}${example.command}`);
			lines.push(`${EXAMPLE_EXPLANATION_INDENT}${example.explanation}`);
		}
	}

	return lines;
}

export const manCommand: CommandDefinition = {
	name: "man",
	run(args): CommandResult {
		const name = args[0];

		if (name === undefined) {
			return { ok: false, lines: missingOperand("man", "一個指令名稱，例如 man ls") };
		}

		const doc = getCommandDoc(name);
		if (doc === undefined) {
			return { ok: false, lines: manNotFound(name) };
		}

		return { ok: true, lines: formatDoc(doc) };
	},
};
