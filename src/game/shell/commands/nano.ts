/**
 * `nano`：全螢幕文字編輯器（第十九場，設計文件 4.22；只開放使用，不在任何章節的 teaches 裡）。
 *
 * 指令本身只開檔，回傳一個編輯請求（`CommandResult.editor`），真正的編輯畫面在終端機 UI
 * （`src/components/terminal/Editor.tsx`）：^O 寫入、^X 離開、^W 搜尋、^G 說明。存檔與離開的流程見 `../editor.ts`。
 * 只有在管線最後一個、沒有重導向時 shell 才會把請求交給 UI；放在管線中間或接 `>` 時跟 `less` 一樣，
 * 把檔案內容原樣輸出（`lines`）。
 *
 * - `nano 檔名`：既有檔案放進緩衝區；不存在的開空白緩衝區，存檔時才建立。目錄、讀不到的檔案、上層目錄不存在都報錯。
 * - `nano`、`nano -`：沒有檔名的緩衝區，存檔時再問檔名；接在管線右邊時放左邊指令的輸出（真的 nano 要寫 `-`）。
 * - 一次只開一個檔案；不支援任何選項（`+行號` 會被當成檔名，所以算兩個檔案）。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { openEditorBuffer, openEditorFile } from "../editor";
import { nanoTooManyFiles } from "../messages";
import { splitContentLines } from "./cat";
import { parseFlagArgs } from "./options";

export const nanoCommand: CommandDefinition = {
	name: "nano",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("nano", args, "");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { operands } = parsed;
		if (operands.length > 1) {
			return { ok: false, lines: nanoTooManyFiles() };
		}

		const fileName = operands[0];
		if (fileName === undefined || fileName === "-") {
			return { ok: true, lines: [...(context.stdin ?? [])], editor: openEditorBuffer(context.cwd, context.stdin) };
		}

		const opened = openEditorFile(context.fs, context.cwd, fileName);
		if (!opened.ok) {
			return { ok: false, lines: opened.lines };
		}
		return { ok: true, lines: splitContentLines(opened.request.content), editor: opened.request };
	},
};
