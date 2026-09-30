/**
 * `hint` 指令：三段式提示，同一台終端機重複輸入會逐步加深。
 *
 * 提示內容來自劇本（`context.hints`），第 n 次給第 n 段；
 * 超過段數就重複最後一段。實際的次數累加由 shell 依 `hintUsed` 處理。
 */

import { hintExhausted, hintNotAvailable } from "../messages";
import type { CommandDefinition, CommandResult } from "../types";

export const hintCommand: CommandDefinition = {
	name: "hint",
	run(_args, context): CommandResult {
		const { hints, hintCount } = context;

		if (hints.length === 0) {
			return { ok: true, lines: hintNotAvailable() };
		}

		// 第 n 次給第 n 段，超過就停在最後一段
		const index = Math.min(hintCount, hints.length - 1);
		const contentLines = hints[index].split("\n");
		const [firstLine, ...restLines] = contentLines;
		const lines = [`提示 ${index + 1}/${hints.length}：${firstLine}`, ...restLines];

		// 這次之前就已經把全部提示給完了，額外提醒不會再有新內容
		if (hintCount >= hints.length) {
			lines.push(...hintExhausted());
		}

		return { ok: true, lines, hintUsed: true };
	},
};
