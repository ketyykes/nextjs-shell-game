/**
 * 「忘記空格」偵測。
 *
 * 新手常把指令和參數黏在一起，例如 `cdmedbay`、`catwake_up.txt`。
 * 當整串找不到指令時，shell 把第一個 token 丟進來，
 * 這裡試著拆成「已知指令 + 剩餘字串」，讓錯誤訊息能說
 * 「你是不是想打 `cd medbay`？」。
 */

import type { MissingSpaceSuggestion } from "../types";

/**
 * 在 `knownCommands` 裡找出是 `input` 前綴、且剩餘字串非空的指令。
 * 多個符合時取最長的前綴（例如 known 有 `ls` 與 `lsa` 時，`lsabc` 建議 `lsa` + `bc`）。
 * `input` 完全等於某個指令名時回傳 `null`，那不是忘記空格。
 * 找不到回傳 `null`。
 */
export function suggestMissingSpace(
	input: string,
	knownCommands: string[],
): MissingSpaceSuggestion | null {
	if (knownCommands.includes(input)) {
		return null;
	}

	let bestCommand: string | null = null;
	for (const command of knownCommands) {
		if (command.length === 0) {
			continue;
		}
		// 剩餘字串長度至少 1
		if (input.length <= command.length) {
			continue;
		}
		if (!input.startsWith(command)) {
			continue;
		}
		if (bestCommand === null || command.length > bestCommand.length) {
			bestCommand = command;
		}
	}

	if (bestCommand === null) {
		return null;
	}

	return {
		command: bestCommand,
		rest: input.slice(bestCommand.length),
	};
}
