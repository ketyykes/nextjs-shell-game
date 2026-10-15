/**
 * `date`：印出現在的日期與時間（第十九場，只開放使用，不在劇本裡）。
 *
 * 「現在」不讀真實時鐘：遊戲內各章的時間點不同（喚醒 08:15、第二章 09:12、第四章 14:02），
 * 由 shell 從終端機劇本的 `now` 或章節時鐘帶進 `context.now`。遊戲沒有流逝的時鐘，同一台終端機打幾次都是同一個時間。
 * 時間一律 UTC，跟 `ls -l`、`last` 一樣，所以 `-u` 接受但不改變結果。
 *
 * - 不給參數：GNU 的預設格式 `%a %b %e %H:%M:%S %Z %Y`，例如 `Wed Mar 12 08:15:00 UTC 2031`。
 * - `+格式`：照 GNU date 的 `%` 寫法（見 `formatDate`），不認得的 `%` 寫法原樣印出，跟 GNU 一樣。
 * - 不是 `+` 開頭的參數（真的 date 會拿去改系統時間）回 `dateCannotSet`；`-d`、`-I`、`-R` 這類選項不做。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { dateCannotSet, extraOperand } from "../messages";
import { parseFlagArgs } from "./options";

/** `context.now` 沒給時用的時間：第一章的喚醒時間。 */
export const DEFAULT_NOW = "2031-03-12T08:15:00Z";

/** 預設格式，跟 GNU date 在 C 語系的輸出一樣。 */
const DEFAULT_FORMAT = "%a %b %e %H:%M:%S %Z %Y";

const USAGE = "date [-u] [+格式]";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 補到 `width` 位，`pad` 是補零或補空白。 */
function pad(value: number, width: number, padChar = "0"): string {
	return String(value).padStart(width, padChar);
}

/** 12 小時制的時：0 點與 12 點都是 12。 */
function twelveHour(hours: number): number {
	const value = hours % 12;
	if (value === 0) {
		return 12;
	}
	return value;
}

/** 一年裡的第幾天，1 月 1 日是 1。 */
function dayOfYear(date: Date): number {
	const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
	return Math.floor((date.getTime() - startOfYear) / DAY_MS) + 1;
}

/** 單一個 `%` 寫法的值；不認得的回傳 null，由呼叫端原樣印出。 */
function conversion(date: Date, letter: string): string | null {
	const hours = date.getUTCHours();
	switch (letter) {
		case "a":
			return WEEKDAYS[date.getUTCDay()].slice(0, 3);
		case "A":
			return WEEKDAYS[date.getUTCDay()];
		case "b":
		case "h":
			return MONTHS[date.getUTCMonth()].slice(0, 3);
		case "B":
			return MONTHS[date.getUTCMonth()];
		case "C":
			return pad(Math.floor(date.getUTCFullYear() / 100), 2);
		case "d":
			return pad(date.getUTCDate(), 2);
		case "D":
			return formatDate(date, "%m/%d/%y");
		case "e":
			return pad(date.getUTCDate(), 2, " ");
		case "F":
			return formatDate(date, "%Y-%m-%d");
		case "H":
			return pad(hours, 2);
		case "I":
			return pad(twelveHour(hours), 2);
		case "j":
			return pad(dayOfYear(date), 3);
		case "k":
			return pad(hours, 2, " ");
		case "l":
			return pad(twelveHour(hours), 2, " ");
		case "m":
			return pad(date.getUTCMonth() + 1, 2);
		case "M":
			return pad(date.getUTCMinutes(), 2);
		case "n":
			return "\n";
		case "p":
			return hours < 12 ? "AM" : "PM";
		case "R":
			return formatDate(date, "%H:%M");
		case "s":
			return String(Math.floor(date.getTime() / 1000));
		case "S":
			return pad(date.getUTCSeconds(), 2);
		case "t":
			return "\t";
		case "T":
			return formatDate(date, "%H:%M:%S");
		case "u":
			return String(date.getUTCDay() === 0 ? 7 : date.getUTCDay());
		case "w":
			return String(date.getUTCDay());
		case "y":
			return pad(date.getUTCFullYear() % 100, 2);
		case "Y":
			return String(date.getUTCFullYear());
		case "z":
			return "+0000";
		case "Z":
			return "UTC";
		case "%":
			return "%";
		default:
			return null;
	}
}

/**
 * 照 GNU date 的格式字串把時間（UTC）組成文字。
 * 支援 `%a %A %b %B %h %C %d %D %e %F %H %I %j %k %l %m %M %n %p %R %s %S %t %T %u %w %y %Y %z %Z %%`；
 * 不認得的 `%X` 與結尾單獨的 `%` 原樣保留。中文等其他字元照抄。
 *
 * @example formatDate(new Date("2031-03-12T08:15:00Z"), "%F %T") // "2031-03-12 08:15:00"
 */
export function formatDate(date: Date, format: string): string {
	const chars = Array.from(format);
	let output = "";
	let index = 0;

	while (index < chars.length) {
		const char = chars[index];
		const next = chars[index + 1];
		if (char !== "%" || next === undefined) {
			output += char;
			index += 1;
			continue;
		}

		const value = conversion(date, next);
		if (value === null) {
			output += `%${next}`;
		} else {
			output += value;
		}
		index += 2;
	}

	return output;
}

export const dateCommand: CommandDefinition = {
	name: "date",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("date", args, "u");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const [operand, extra] = parsed.operands;
		if (extra !== undefined) {
			return { ok: false, lines: extraOperand("date", extra, USAGE) };
		}

		let format = DEFAULT_FORMAT;
		if (operand !== undefined) {
			if (!operand.startsWith("+")) {
				return { ok: false, lines: dateCannotSet(operand) };
			}
			format = operand.slice(1);
		}

		const now = new Date(context.now ?? DEFAULT_NOW);
		return { ok: true, lines: formatDate(now, format).split("\n") };
	},
};
