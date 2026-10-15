/**
 * 第十九場開放使用、但沒有編進任何章節劇本的指令說明（設計文件 4.18），由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 跟 `docsExtra.ts` 的 M13-3 指令一樣不在任何終端機的 `teaches` 裡，所以 `help` 不會列出（沙盒全部列出），只有 `man` 查得到。
 */

import type { CommandDoc } from "../types";

export const EXTRA2_COMMAND_DOCS: Record<string, CommandDoc> = {
	tr: {
		name: "tr",
		summary: "把字元換掉、刪掉或壓縮重複",
		usage: "tr [-d] [-s] 第一組 [第二組]",
		description: [
			"tr 把 | 左邊指令輸出裡的字一個一個換掉：第一組的第 1 個字換成第二組的第 1 個字，第 2 個換成第 2 個，依此類推；第二組比較短時用它的最後一個字補齊。",
			"a-z 代表 a 到 z 每個字母；[:upper:] 大寫、[:lower:] 小寫、[:digit:] 數字、[:space:] 空白與換行、[:alpha:] 英文字母、[:alnum:] 英文字母加數字（中文不算字母）。\\n 是換行、\\t 是 Tab。",
			"-d 刪掉第一組裡的字；-s 把連續重複的同一個字壓成一個，例如好幾個空白壓成一個。中文一個字算一個。",
			"tr 只讀 | 左邊的輸出、不接檔名，要處理檔案寫成 cat 檔名 | tr a-z A-Z。",
			"字元組裡有空白、反斜線或中括號時用引號包起來，例如 tr ' ' '\\n' 把空白換成換行，變成一個字一行。",
		],
		examples: [
			{ command: "tr a-z A-Z", explanation: "接在 | 右邊把小寫換成大寫，例如 cat README.txt | tr a-z A-Z" },
			{ command: "tr -d '[:digit:]'", explanation: "刪掉所有數字" },
			{ command: "tr -s ' '", explanation: "好幾個連續的空白壓成一個，之後用 cut -d ' ' 切欄位才對得齊" },
			{ command: "tr ' ' '\\n'", explanation: "空白換成換行，一個字一行，再接 sort | uniq -c 就能數每個字出現幾次" },
		],
	},
	tee: {
		name: "tee",
		summary: "把輸出印在畫面上，同時存進檔案",
		usage: "tee [-a] [檔案...]",
		description: [
			"> 會把輸出存進檔案，但畫面上就看不到了。tee 像水管的 T 形接頭：接在 | 右邊，輸出照樣印在畫面上，同時存一份進檔案。",
			"檔名可以給好幾個，一次存進每一個；檔案不存在就建立，已經存在預設會被蓋掉，-a 改成接在檔案結尾。",
			"存不進去的檔案（例如目錄不存在）會報錯、算一次失敗，但內容照樣印在畫面上，其他檔案也照樣存。",
			"tee 後面還可以再接 |，例如 grep ERROR sensors.log | tee errors.txt | wc -l：存下錯誤的那幾行，同時數有幾行。",
		],
		examples: [
			{ command: "tee list.txt", explanation: "接在 | 右邊，例如 ls | tee list.txt：畫面上看得到，也存了一份" },
			{ command: "tee -a notes.txt", explanation: "接在檔案結尾，不蓋掉原本的內容" },
			{ command: "tee a.txt b.txt", explanation: "一次存進兩個檔案" },
		],
	},
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
export const EXTRA2_COMMAND_ORDER: string[] = ["tr", "tee", "date"];
