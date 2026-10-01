/**
 * `tail`：印出檔案或管線輸入的最後幾行，預設 10 行。
 *
 * 選項與多檔案輸出規則跟 `head` 完全相同（`-n 5`、`-n5`、`-5`、`==> 檔名 <==` 標題），
 * 共用 `head.ts` 的 `runLineSlicer`，這裡只決定「取最後幾行」。
 * 不支援真的 tail 的 `-f`（持續追蹤），遊戲裡的檔案不會自己長大。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { runLineSlicer } from "./head";

/** 取最後 `count` 行。 */
function selectLastLines(lines: string[], count: number): string[] {
	return lines.slice(Math.max(lines.length - count, 0));
}

export const tailCommand: CommandDefinition = {
	name: "tail",
	run(args, context): CommandResult {
		return runLineSlicer("tail", args, context, selectLastLines);
	},
};
