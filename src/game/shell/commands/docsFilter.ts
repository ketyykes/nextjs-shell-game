/**
 * 第二章指令（head、tail、wc、grep、find）的說明資料，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 範例用第二章資料中心的世界觀檔名（日誌、紀錄）。
 */

import type { CommandDoc } from "../types";

export const FILTER_COMMAND_DOCS: Record<string, CommandDoc> = {
	head: {
		name: "head",
		summary: "只看檔案開頭的幾行",
		usage: "head [-n 行數] [檔案...]",
		description: [
			"日誌動輒上千行，用 cat 會一口氣洗滿整個畫面；head 只印開頭，預設 10 行。",
			"-n 5 指定要看幾行，也可以寫成 -n5 或 -5。",
			"一次給多個檔案時，每個檔案前面會有一行 ==> 檔名 <== 標出是哪個檔案。",
			"沒給檔名時，head 會讀 | 左邊指令的輸出，例如 ls /deck2/logs | head -n 3 只看前三個檔名。",
		],
		examples: [
			{ command: "head /deck2/logs/door_events.log", explanation: "看艙門事件日誌的前 10 行" },
			{ command: "head -n 3 /deck2/logs/nova_core.log", explanation: "只看 NOVA 核心日誌的前 3 行" },
			{
				command: "head -n 1 /deck2/logs/door_events.log /deck2/logs/nova_core.log",
				explanation: "一次看兩份日誌的第一行，每份前面有 ==> 檔名 <== 標題",
			},
		],
	},
	tail: {
		name: "tail",
		summary: "只看檔案結尾的幾行",
		usage: "tail [-n 行數] [檔案...]",
		description: [
			"日誌是照時間往下寫的，最新的事件在最後面；tail 只印結尾，預設 10 行。",
			"-n 5 指定要看幾行，也可以寫成 -n5 或 -5。",
			"想知道某件事最後怎麼收尾，先 tail 一下通常最快。",
			"沒給檔名時，tail 會讀 | 左邊指令的輸出，例如 cat door_events.log | tail -n 1。",
		],
		examples: [
			{ command: "tail /deck2/logs/evac_2028-06-02.log", explanation: "看撤離當晚日誌的最後 10 行" },
			{ command: "tail -n 1 /deck2/logs/door_events.log", explanation: "只看艙門事件的最後一筆紀錄" },
			{ command: "tail -5 /deck2/logs/nova_core.log", explanation: "-5 是 -n 5 的簡寫" },
		],
	},
	wc: {
		name: "wc",
		summary: "計算行數、字數與位元組數",
		usage: "wc [-l] [-w] [-c] [檔案...]",
		description: [
			"wc 是 word count 的縮寫，依序印出行數、字數、位元組數，最後是檔名。",
			"-l 只算行數，-w 只算字數，-c 只算位元組數，可以合在一起寫成 -lw。",
			"日誌通常一個事件一行，所以 wc -l 等於「這份日誌記了幾件事」。",
			"常跟管線一起用：grep ERROR nova_core.log | wc -l 可以算出有幾行錯誤。",
			"一次給多個檔案時，最後會多一行 total 加總。",
		],
		examples: [
			{ command: "wc /deck2/logs/door_events.log", explanation: "印出艙門事件日誌的行數、字數與位元組數" },
			{ command: "wc -l /deck2/logs/evac_2028-06-02.log", explanation: "撤離當晚一共記了幾行" },
			{ command: "wc -l door_events.log nova_core.log", explanation: "兩份日誌各有幾行，最後一行是加總" },
		],
	},
	grep: {
		name: "grep",
		summary: "從檔案裡挑出符合樣式的行",
		usage: "grep [-i] [-n] [-c] [-v] [-r] [-w] [-o] [-E | -F] 樣式 [檔案...]",
		description: [
			"幾千行日誌裡只想看跟某件事有關的行，就用 grep，它只印出符合樣式的行；只打一般文字時，就是找含有那串字的行。",
			"-i 不分大小寫，-n 在行首加行號，-c 只印有幾行符合，-v 反過來印「不符合」的行。",
			"-r 會走進目錄，把底下所有檔案（包括子目錄與隱藏檔）都搜一遍，每行前面標出檔案路徑。",
			"-w 只算整個單字，grep -w LOCK 不會配到 UNLOCK；-o 只印符合的那一段，一段一行，接 wc -l 就能算出現幾次。",
			"樣式是正規表示式，有幾個符號有特別意思：. 代表任意一個字，* 代表前一個字重複零次以上。",
			"^ 代表行首、$ 代表行尾，[abc] 代表其中一個字、[0-9] 代表一個數字；要找這些符號本身，在前面加 \\ 並用引號包起來，例如 grep \"v3\\.1\"。",
			"-E 是延伸正規表示式，多了 +（一次以上）、?（可有可無）、|（或）和 ( ) 群組，例如 grep -E \"ERROR|WARN\"。",
			"-F 把樣式完全照字面比對，要找含 . [ * 這些符號的字串時最省事，例如 grep -F \"a[1]\"。",
			"樣式裡有空白或特殊符號時要用引號包起來，例如 grep \"DOOR LOCK\" door_events.log。",
			"grep 常跟管線一起用：cat log.txt | grep ERROR，左邊讀檔案，右邊只留下含 ERROR 的行。",
		],
		examples: [
			{ command: "grep ERROR /deck2/logs/evac_2028-06-02.log", explanation: "找出撤離當晚日誌裡含 ERROR 的行" },
			{ command: "grep -in nova /deck2/logs/door_events.log", explanation: "不分大小寫找 nova，並顯示是第幾行" },
			{ command: "grep -r LOCK /deck2/logs", explanation: "搜遍 logs 底下所有日誌，找出含 LOCK 的行" },
			{ command: "grep -c ERROR /deck2/logs/nova_core.log", explanation: "只算 NOVA 核心日誌裡有幾行 ERROR" },
			{ command: "grep \"^21:4\" /deck2/logs/evac_2028-06-02.log", explanation: "只看 21:40 到 21:49 開頭的紀錄，^ 代表行首" },
			{ command: "grep -E \"ERROR|WARN\" /deck2/logs/evac_2028-06-02.log", explanation: "一次找出含 ERROR 或 WARN 的行" },
			{ command: "grep -F \"v3.1\" /deck2/logs/nova_core.log", explanation: "照字面找 v3.1，. 就只是句點" },
			{ command: "grep -w LOCK /deck2/logs/door_events.log", explanation: "只找 LOCK 這個字，UNLOCK 不算" },
			{ command: "grep -oi nova /deck2/logs/door_events.log | wc -l", explanation: "算 nova 一共出現幾次；-c 算的是有幾行" },
		],
	},
	find: {
		name: "find",
		summary: "依名稱或類型找出檔案與目錄",
		usage: "find [路徑...] [-name 樣式] [-iname 樣式] [-type f|d]",
		description: [
			"不知道檔案藏在哪一層目錄時用 find，它會從起點一路往下走，列出所有符合條件的路徑。",
			"-name 依檔名找，樣式可以用 * 代表任意文字、? 代表一個字，記得用引號包起來，例如 \"*.log\"。",
			"-iname 跟 -name 一樣，但不分大小寫；-type f 只找檔案，-type d 只找目錄。",
			"不給路徑時從目前目錄 . 開始找，隱藏檔也會列出來。",
			"找到檔案之後，再用 grep 或 cat 讀內容。",
		],
		examples: [
			{ command: "find /deck2/logs -name \"evac_*\"", explanation: "找出所有檔名以 evac_ 開頭的撤離日誌" },
			{ command: "find . -name \"*.log\"", explanation: "從目前目錄往下找出所有 .log 檔" },
			{ command: "find /deck2 -type d", explanation: "只列出資料中心底下的目錄" },
			{ command: "find /deck2 -iname \"*NOVA*\"", explanation: "不分大小寫找出檔名含 nova 的檔案" },
		],
	},
};

/** 這組指令在 `help` 與側邊面板的顯示順序。 */
export const FILTER_COMMAND_ORDER: string[] = ["head", "tail", "wc", "grep", "find"];
