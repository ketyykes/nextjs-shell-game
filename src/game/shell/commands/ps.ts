/**
 * `ps`：列出目前的程序，依 PID 排序。
 *
 * 接受 `aux`、`-e`、`-ef` 等常見寫法，但任何參數都忽略、不報錯，輸出永遠一樣，
 * 會打 `ps aux` 的玩家不會被擋下來。
 *
 * 表格欄位：`PID  USER  %CPU  %MEM  STARTED  COMMAND`，欄位間兩個空格，
 * 每欄依內容最大寬度對齊（PID、%CPU、%MEM 靠右，其他靠左），跟 `ls -l` 的對齊方式一致。
 * 表格格式化函式 `formatProcessTable` 也給 `top` 用。
 */

import type { CommandDefinition, CommandResult, ProcessInfo } from "../types";
import { formatMtime } from "./ls";

/** 一個欄位的定義：表頭、靠哪邊對齊、怎麼從程序取值。 */
interface ProcessColumn {
	header: string;
	align: "left" | "right";
	value: (process: ProcessInfo) => string;
}

/** 百分比顯示一位小數。 */
function formatPercent(value: number): string {
	return value.toFixed(1);
}

const PROCESS_COLUMNS: ProcessColumn[] = [
	{ header: "PID", align: "right", value: (process) => String(process.pid) },
	{ header: "USER", align: "left", value: (process) => process.user },
	{ header: "%CPU", align: "right", value: (process) => formatPercent(process.cpu) },
	{ header: "%MEM", align: "right", value: (process) => formatPercent(process.mem) },
	{ header: "STARTED", align: "left", value: (process) => formatMtime(process.started) },
	{ header: "COMMAND", align: "left", value: (process) => process.command },
];

/** 依對齊方向補空白；最後一欄不補，避免行尾多出空白。 */
function padCell(text: string, width: number, align: "left" | "right", isLast: boolean): string {
	if (align === "right") {
		return text.padStart(width, " ");
	}

	if (isLast) {
		return text;
	}

	return text.padEnd(width, " ");
}

/**
 * 把程序清單格式化成表格（含表頭），不排序，照傳入順序輸出。
 * 沒有程序時只有表頭一行。
 */
export function formatProcessTable(processes: ProcessInfo[]): string[] {
	const rows = processes.map((process) => PROCESS_COLUMNS.map((column) => column.value(process)));
	const headers = PROCESS_COLUMNS.map((column) => column.header);

	const widths = PROCESS_COLUMNS.map((column, columnIndex) => {
		let width = column.header.length;

		for (const row of rows) {
			width = Math.max(width, row[columnIndex].length);
		}

		return width;
	});

	const lastIndex = PROCESS_COLUMNS.length - 1;
	const formatRow = (cells: string[]): string =>
		cells
			.map((cell, columnIndex) =>
				padCell(cell, widths[columnIndex], PROCESS_COLUMNS[columnIndex].align, columnIndex === lastIndex),
			)
			.join("  ");

	return [formatRow(headers), ...rows.map(formatRow)];
}

/** 依 PID 由小到大排序，回傳新陣列。 */
export function sortByPid(processes: ProcessInfo[]): ProcessInfo[] {
	return [...processes].sort((a, b) => a.pid - b.pid);
}

export const psCommand: CommandDefinition = {
	name: "ps",
	run(_args, context): CommandResult {
		return { ok: true, lines: formatProcessTable(sortByPid(context.processes)) };
	},
};
