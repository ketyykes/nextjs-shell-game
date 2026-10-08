/**
 * `less`：分頁器（M13-3，只開放使用，不在劇本裡）。
 *
 * 指令本身只讀檔，回傳一個分頁請求（`CommandResult.pager`），真正的翻頁畫面在終端機 UI
 * （`src/components/terminal/Pager.tsx`）：空白／b 翻頁、↑↓ 一行、/ 搜尋、q 離開。
 * 只有在管線最後一個、沒有重導向時 shell 才會把請求交給 UI；放在管線中間或接 `>` 時，
 * 照真的 less 在輸出不是終端機時的行為，把內容原樣輸出（`lines`，等同 `cat`）。
 *
 * 可以一次給好幾個檔案（分頁裡用 `:n`、`:p` 切換）；沒給檔名時翻管線輸入。
 * 讀不到的檔案印錯誤訊息、其他照翻，整體算失敗（跟 `cat` 一樣）。支援 `-N`（顯示行號），其他選項不支援。
 */

import type { CommandDefinition, CommandResult, PagerFile } from "../types";
import { FsError } from "../types";
import { fsError, noInput } from "../messages";
import { splitContentLines } from "./cat";
import { parseFlagArgs } from "./fileArgs";

export const lessCommand: CommandDefinition = {
	name: "less",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("less", args, "N");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const lineNumbers = parsed.flags.has("N");
		const { operands } = parsed;

		if (operands.length === 0) {
			if (context.stdin === null) {
				return { ok: false, lines: noInput("less", "less door_events.log") };
			}
			const lines = [...context.stdin];
			return { ok: true, lines, pager: { request: { files: [{ name: null, lines }], lineNumbers }, lines: [] } };
		}

		const files: PagerFile[] = [];
		const errors: string[] = [];
		const plainOutput: string[] = [];

		for (const path of operands) {
			try {
				const lines = splitContentLines(context.fs.readFile(context.cwd, path));
				files.push({ name: path, lines });
				plainOutput.push(...lines);
			} catch (error) {
				if (!(error instanceof FsError)) {
					throw error;
				}
				const message = fsError(error.code, error.path);
				errors.push(...message);
				plainOutput.push(...message);
			}
		}

		const ok = errors.length === 0;
		if (files.length === 0) {
			return { ok, lines: plainOutput };
		}
		return { ok, lines: plainOutput, pager: { request: { files, lineNumbers }, lines: errors } };
	},
};
