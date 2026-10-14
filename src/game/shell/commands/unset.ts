/**
 * `unset`：把環境變數拿掉（第十七場，只開放使用，不在任何章節的 `teaches` 裡）。
 *
 * - `unset 名稱...`：逐一拿掉；不存在的名稱靜默成功（bash 行為）。
 * - `-v`：拿掉變數，就是預設行為，接受但不改變什麼。
 * - `-f`（拿掉函式）與別的選項：這個 shell 沒有函式，回 `unknownOption`，什麼都不動。
 * - 名稱不合法（含 `名稱=值` 的寫法）：回 `invalidVariableName`，不影響合法的那些（跟 bash 一樣），但整體 `ok` 為 false。
 * - 唯讀變數（`context.readonlyEnv`，bash 的 `readonly`）：回 `readonlyVariable`，同樣不影響其他名稱、整體算錯誤。
 *
 * 跟 `export` 一樣不直接改 `context.env`，而是回傳整份新的 `nextEnv` 讓 shell 取代；什麼都沒拿掉時不回 `nextEnv`。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { invalidVariableName, readonlyVariable, unknownOption } from "../messages";
import { VARIABLE_NAME } from "./export";

export const unsetCommand: CommandDefinition = {
	name: "unset",
	run(args, context): CommandResult {
		const nextEnv: Record<string, string> = { ...context.env };
		const errors: string[] = [];
		let changed = false;

		for (const arg of args) {
			if (arg === "-v") {
				continue;
			}

			if (arg.startsWith("-")) {
				// 跟 export 一樣先擋掉選項，避免 `-f` 之類的被當成變數名稱
				return { ok: false, lines: unknownOption("unset", arg) };
			}

			if (!VARIABLE_NAME.test(arg)) {
				errors.push(...invalidVariableName(arg));
				continue;
			}

			if (context.readonlyEnv?.includes(arg) === true) {
				errors.push(...readonlyVariable(arg, "unset"));
				continue;
			}

			if (Object.prototype.hasOwnProperty.call(nextEnv, arg)) {
				delete nextEnv[arg];
				changed = true;
			}
		}

		const result: CommandResult = { ok: errors.length === 0, lines: errors };

		if (changed) {
			result.nextEnv = nextEnv;
		}

		return result;
	},
};
