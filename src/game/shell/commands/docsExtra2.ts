/**
 * 第十九場開放使用、但沒有編進任何章節劇本的指令說明（設計文件 4.18），由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 跟 `docsExtra.ts` 的 M13-3 指令一樣不在任何終端機的 `teaches` 裡，所以 `help` 不會列出（沙盒全部列出），只有 `man` 查得到。
 */

import type { CommandDoc } from "../types";

export const EXTRA2_COMMAND_DOCS: Record<string, CommandDoc> = {
	date: {
		name: "date",
		summary: "顯示現在的日期與時間",
		usage: "date [-u] [+格式]",
		description: [
			"date 印出這台終端機現在的時間，例如 Wed Mar 12 08:15:00 UTC 2031：星期、月、日、時:分:秒、時區、年。",
			"站上的時鐘一律用 UTC（世界協調時間），跟 ls -l、last 顯示的時間一樣，所以加不加 -u 都一樣。",
			"在 + 後面寫格式可以自己排：%Y 年、%m 月、%d 日、%H 時、%M 分、%S 秒、%a 星期、%b 月份、%j 一年裡的第幾天、%s 從 1970 年起算的秒數。",
			"%F 等於 %Y-%m-%d，%T 等於 %H:%M:%S，%D 等於 %m/%d/%y，%% 是百分比符號本身；格式裡有空白要用引號包起來，例如 date \"+%F %T\"。",
			"遊戲裡的時間不會跟著現實走，也不會自己往前走：在同一台終端機打幾次 date 都是同一個時間。date 只能看時間，不能改時間。",
		],
		examples: [
			{ command: "date", explanation: "印出現在的日期與時間" },
			{ command: "date +%H:%M", explanation: "只看幾點幾分" },
			{ command: "date \"+%F %T\"", explanation: "印成 年-月-日 時:分:秒 的寫法" },
			{ command: "date +%j", explanation: "今天是這一年的第幾天" },
		],
	},
};

/** 這組指令在側邊面板的顯示順序，排在帳號與登入的彩蛋之後。 */
export const EXTRA2_COMMAND_ORDER: string[] = ["date"];
