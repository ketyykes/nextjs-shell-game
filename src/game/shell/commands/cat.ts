/**
 * `cat`：依序印出一或多個檔案的內容。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { fsError, missingOperand } from "../messages";

/**
 * 把檔案內容切成終端機的行。
 * 結尾的換行只代表「這一行結束」，不應該多印一個空行；空檔案則完全沒有輸出。
 */
export function splitContentLines(content: string): string[] {
	const lines = content.split("\n");

	if (lines[lines.length - 1] === "") {
		lines.pop();
	}

	return lines;
}

export const catCommand: CommandDefinition = {
	name: "cat",
	run(args, context): CommandResult {
		if (args.length === 0) {
			return { ok: false, lines: missingOperand("cat", "一個檔名，例如 cat wake_up.txt") };
		}

		const lines: string[] = [];
		let ok = true;

		// 跟真的 cat 一樣：某個檔案失敗不中斷，錯誤訊息放在對應位置，繼續處理後面的檔案
		for (const path of args) {
			try {
				const content = context.fs.readFile(context.cwd, path);
				lines.push(...splitContentLines(content));
			} catch (error) {
				if (!(error instanceof FsError)) {
					throw error;
				}

				ok = false;
				lines.push(...fsError(error.code, error.path));
			}
		}

		return { ok, lines };
	},
};
