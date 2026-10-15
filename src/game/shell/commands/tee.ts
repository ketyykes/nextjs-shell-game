/**
 * `tee`：把管線輸入原樣印出，同時寫進一個以上的檔案（第十九場，只開放使用，不在劇本裡）。
 *
 * - 預設覆寫，`-a` 接在檔案結尾；檔案不存在就建立，父目錄必須存在（跟 `>`、`>>` 一樣）。
 * - 某個檔案寫不到（父目錄不存在、是目錄）算錯誤，但其他檔案照寫、畫面照樣印出內容；
 *   錯誤訊息印在內容前面（真的 tee 開檔失敗時就先報錯，再一邊讀一邊印）。
 * - 不給檔名就只是原樣印出。只讀管線輸入；不在管線裡回 `teeNeedsPipe`。
 * 不支援 `-i`、`-p`。檔案的修改時間跟 `>` 一樣用寫入當下的時間。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { fsError, teeNeedsPipe } from "../messages";
import { joinContentLines } from "./cat";
import { captureFsError } from "./fileArgs";
import { parseFlagArgs } from "./options";

export const teeCommand: CommandDefinition = {
	name: "tee",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("tee", args, "a");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}
		if (context.stdin === null) {
			return { ok: false, lines: teeNeedsPipe() };
		}

		const content = joinContentLines(context.stdin);
		const append = parsed.flags.has("a");
		const errors: string[] = [];
		for (const path of parsed.operands) {
			const error = captureFsError(() => {
				if (append) {
					context.fs.appendFile(context.cwd, path, content);
				} else {
					context.fs.writeFile(context.cwd, path, content);
				}
			});
			if (error !== null) {
				errors.push(...fsError(error.code, error.path));
			}
		}

		if (errors.length > 0) {
			return { ok: false, lines: [...errors, ...context.stdin] };
		}
		return { ok: true, lines: [...context.stdin] };
	},
};
