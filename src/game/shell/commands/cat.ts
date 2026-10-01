/**
 * `cat`：依序印出一或多個檔案的內容；沒給檔名時把管線的輸入原樣印出。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { fsError, noInput } from "../messages";

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
		// 沒給檔名時讀管線前一個指令的輸出，例如 ls | cat；不在管線裡就提示要給輸入
		if (args.length === 0) {
			if (context.stdin === null) {
				return { ok: false, lines: noInput("cat", "cat log.txt 或 ls | cat") };
			}
			return { ok: true, lines: [...context.stdin] };
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
