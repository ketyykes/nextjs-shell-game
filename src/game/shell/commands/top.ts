/**
 * `top`：系統負載的靜態快照。
 *
 * 真的 top 會全螢幕持續更新，終端機元件做不到也沒必要，所以只印一次：
 * 標題、程序數、空一行，然後跟 `ps` 一樣的表格，但依 %CPU 由大到小排序（同值依 PID）。
 * 不接受任何參數。
 */

import type { CommandDefinition, CommandResult, ProcessInfo } from "../types";
import { unknownOption } from "../messages";
import { formatProcessTable } from "./ps";

/** 標題行，提醒玩家這不是即時畫面。 */
const TOP_TITLE = "KEPLER-9 系統負載（靜態快照）";

/** 依 %CPU 由大到小排序，同值依 PID 由小到大，回傳新陣列。 */
function sortByCpu(processes: ProcessInfo[]): ProcessInfo[] {
	return [...processes].sort((a, b) => {
		if (a.cpu !== b.cpu) {
			return b.cpu - a.cpu;
		}

		return a.pid - b.pid;
	});
}

export const topCommand: CommandDefinition = {
	name: "top",
	run(args, context): CommandResult {
		if (args.length > 0) {
			return { ok: false, lines: unknownOption("top", args[0]) };
		}

		const lines = [
			TOP_TITLE,
			`程序：${context.processes.length} 個`,
			"",
			...formatProcessTable(sortByCpu(context.processes)),
		];

		return { ok: true, lines };
	},
};
