/**
 * `touch`：建立空檔案，或把既有檔案的修改時間改成現在（第三章工程艙）。
 *
 * `touch 檔案...`
 * - 可以一次處理多個檔案，某個失敗不中斷，但整體 `ok` 為 false
 * - 成功時沒有輸出
 */

import type { CommandDefinition, CommandResult } from "../types";
import { fsError, missingOperand } from "../messages";
import { captureFsError } from "./fileArgs";
import { parseFlagArgs } from "./options";

export const touchCommand: CommandDefinition = {
	name: "touch",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("touch", args, "");

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		if (parsed.operands.length === 0) {
			return { ok: false, lines: missingOperand("touch", "一個檔名，例如 touch core.cfg") };
		}

		const lines: string[] = [];
		let ok = true;

		for (const path of parsed.operands) {
			const error = captureFsError(() => context.fs.touch(context.cwd, path));

			if (error !== null) {
				ok = false;
				lines.push(...fsError(error.code, error.path));
			}
		}

		return { ok, lines };
	},
};
