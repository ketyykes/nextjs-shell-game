/**
 * `mkdir`：建立目錄（第三章工程艙）。
 *
 * `mkdir [-p] 目錄...`
 * - 可以一次建多個目錄，某個失敗不中斷，繼續處理後面的，但整體 `ok` 為 false
 * - `-p` 連父目錄一起建，已存在的目錄也不報錯
 * - 成功時跟真的 shell 一樣沒有輸出
 */

import type { CommandDefinition, CommandResult } from "../types";
import { fsError, missingOperand } from "../messages";
import { captureFsError, parseFlagArgs } from "./fileArgs";

export const mkdirCommand: CommandDefinition = {
	name: "mkdir",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("mkdir", args, "p");

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		if (parsed.operands.length === 0) {
			return { ok: false, lines: missingOperand("mkdir", "一個目錄名稱，例如 mkdir backup") };
		}

		const parents = parsed.flags.has("p");
		const lines: string[] = [];
		let ok = true;

		for (const path of parsed.operands) {
			const error = captureFsError(() => context.fs.mkdir(context.cwd, path, { parents }));

			if (error !== null) {
				ok = false;
				lines.push(...fsError(error.code, error.path));
			}
		}

		return { ok, lines };
	},
};
