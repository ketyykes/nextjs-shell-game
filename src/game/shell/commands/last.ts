/**
 * `last`：列出登入紀錄（第十七場的彩蛋，只開放使用，不在任何章節的 `teaches` 裡）。
 *
 * 格式照 util-linux 的 last：帳號 8 欄、終端機 12 欄、來源主機 16 欄（站上直接登入是空的）、
 * 登入時間 `Wed Mar 12 08:15`，接著是 ` - 02:53  (00:06)`（超過一天寫成 `(2+01:10)`）或 `  still logged in`；
 * 最後空一行再印 `wtmp begins Sat Mar  1 00:00:00 2031`。時間一律 UTC，跟 `ls -l` 一樣。
 *
 * - 給帳號名稱只列那些帳號的紀錄；沒有紀錄的帳號只印結尾兩行，不算錯誤（跟真的 last 一樣）。
 * - 選項（`-n` 等）不支援，回 `unknownOption`。
 *
 * 紀錄用 `createLastCommand` 注入：遊戲用 `STATION_LOGIN_LOG`，沙盒換成不碰主線的那一份。
 */

import type { CommandDefinition, CommandResult, LoginLog, LoginRecord } from "../types";
import { unknownOption } from "../messages";
import { STATION_LOGIN_LOG } from "./accounts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 補成兩位數。 */
function twoDigits(value: number): string {
	return String(value).padStart(2, "0");
}

/** `HH:MM`（UTC）。 */
function clock(date: Date): string {
	return `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}`;
}

/** 星期、月份與日期，日期不足兩位補空白，例如 `Sat Mar  1`。 */
function dayStamp(date: Date): string {
	const day = String(date.getUTCDate()).padStart(2, " ");
	return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${day}`;
}

/** 登入時間欄，例如 `Wed Mar 12 08:15`。 */
function loginStamp(date: Date): string {
	return `${dayStamp(date)} ${clock(date)}`;
}

/** 用了多久：一天以內 ` (00:06)`，超過一天 `(2+01:10)`（util-linux 的寫法，前者前面多一個空白）。 */
function duration(login: Date, logout: Date): string {
	const totalMinutes = Math.floor((logout.getTime() - login.getTime()) / 60000);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) {
		return `(${days}+${twoDigits(hours)}:${twoDigits(minutes)})`;
	}
	return ` (${twoDigits(hours)}:${twoDigits(minutes)})`;
}

/** 一筆紀錄的一行。 */
function formatRecord(record: LoginRecord): string {
	const login = new Date(record.login);
	const head = `${record.user.padEnd(8)} ${record.tty.padEnd(12)} ${"".padEnd(16)} ${loginStamp(login)}`;
	if (record.logout === null) {
		return `${head}   still logged in`;
	}
	const logout = new Date(record.logout);
	return `${head} - ${clock(logout)} ${duration(login, logout)}`;
}

/** 結尾那一行，例如 `wtmp begins Sat Mar  1 00:00:00 2031`。 */
function formatBegins(begins: string): string {
	const date = new Date(begins);
	const seconds = twoDigits(date.getUTCSeconds());
	return `wtmp begins ${dayStamp(date)} ${clock(date)}:${seconds} ${date.getUTCFullYear()}`;
}

/** 依登入紀錄建立 `last` 指令。 */
export function createLastCommand(log: LoginLog): CommandDefinition {
	return {
		name: "last",
		run(args): CommandResult {
			const option = args.find((arg) => arg.startsWith("-"));
			if (option !== undefined) {
				return { ok: false, lines: unknownOption("last", option) };
			}

			let records = log.records;
			if (args.length > 0) {
				records = records.filter((record) => args.includes(record.user));
			}

			return { ok: true, lines: [...records.map(formatRecord), "", formatBegins(log.begins)] };
		},
	};
}

export const lastCommand: CommandDefinition = createLastCommand(STATION_LOGIN_LOG);
