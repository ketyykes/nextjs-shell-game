/**
 * 第四到六章系統指令（echo、sort、uniq、export、env、ps、top、kill）的說明資料，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 範例用通訊艙、艦橋、NOVA 核心的世界觀檔名。
 */

import type { CommandDoc } from "../types";

export const SYSTEM_COMMAND_DOCS: Record<string, CommandDoc> = {
	echo: {
		name: "echo",
		summary: "把文字印出來",
		usage: "echo [-n] [文字...]",
		description: [
			"echo 會把後面接的文字原樣印成一行，多個字之間用一個空格隔開。",
			"文字裡有多個連續空白或特殊符號時，用引號包起來，例如 echo \"MAYDAY  MAYDAY\"。",
			"echo 跟 > 搭配，就能把文字寫進檔案：echo 文字 > 檔名 會覆寫整個檔案，>> 則是加在檔案結尾。",
			"echo $變數名稱 可以印出變數的值，用來確認變數有沒有設對。",
		],
		examples: [
			{ command: "echo MAYDAY KEPLER-9", explanation: "印出 MAYDAY KEPLER-9" },
			{ command: "echo \"MAYDAY KEPLER-9\" > outbox.txt", explanation: "把求救訊號寫進 outbox.txt，原本的內容會被蓋掉" },
			{ command: "echo \"CREW: 1\" >> outbox.txt", explanation: "在 outbox.txt 結尾再加一行" },
			{ command: "echo $NOVA_DIR", explanation: "印出變數 NOVA_DIR 的值" },
		],
	},
	sort: {
		name: "sort",
		summary: "把每一行排序",
		usage: "sort [-r] [-n] [-u] [檔案...]",
		description: [
			"sort 會把檔案的每一行排好順序再印出來，預設依字母與數字字元的順序排。",
			"-n 依每行開頭的數字大小排，不然 10 會排在 2 前面；-r 反過來由大到小；-u 排完把重複的行只留一個。",
			"可以一次給好幾個檔案，內容會接起來一起排。",
			"沒給檔名時，sort 會讀 | 左邊指令的輸出；| 的意思是「把左邊的輸出交給右邊」。",
			"sort 常接 uniq：先排序讓相同的行靠在一起，uniq 才能把它們合併或計數。",
		],
		examples: [
			{ command: "sort fragments/part_01.txt", explanation: "把第一段求救訊號碎片依行首編號排好" },
			{ command: "sort fragments/part_01.txt fragments/part_02.txt", explanation: "兩段碎片接起來一起排序" },
			{ command: "sort -u fragments/part_01.txt fragments/part_02.txt", explanation: "一起排序並去掉重複的行，拼出完整訊號" },
			{ command: "sort -nr freq.txt", explanation: "依開頭數字由大到小排" },
		],
	},
	uniq: {
		name: "uniq",
		summary: "合併相鄰的重複行",
		usage: "uniq [-c] [-d] [檔案]",
		description: [
			"uniq 會把「緊鄰」的重複行合併成一行，不相鄰的重複不會合併。",
			"所以通常先用 sort 排序，讓相同的行靠在一起，再用 | 交給 uniq，例如 sort relay.log | uniq。",
			"-c 會在每行前面加上它出現的次數；-d 只印出有重複過的行。",
			"uniq 最多接一個檔案；沒給檔名時讀 | 左邊指令的輸出。",
		],
		examples: [
			{ command: "uniq relay.log", explanation: "把通訊紀錄裡連續重複的行合併成一行" },
			{ command: "uniq -c relay.log", explanation: "合併並顯示每行連續出現幾次" },
			{ command: "uniq -d relay.log", explanation: "只列出有連續重複的行" },
		],
	},
	export: {
		name: "export",
		summary: "設定環境變數",
		usage: "export [名稱=值 ...]",
		description: [
			"變數是一個有名字的值，設定一次之後，其他指令都可以拿來用。",
			"export 名稱=值 設定變數，等號兩邊不能有空格；值有空白時用引號包起來。",
			"設定好的變數用 $名稱 取用，例如 cd $NOVA_DIR 會走進變數記住的目錄。",
			"名稱只能用英文字母、數字與底線，不能以數字開頭，習慣上用大寫。",
			"不加任何參數，export 會列出目前所有變數。",
		],
		examples: [
			{ command: "export NOVA_DIR=/opt/nova", explanation: "把 NOVA 的安裝目錄記在變數 NOVA_DIR" },
			{ command: "export CAPTAIN_KEY=7734", explanation: "設定變數 CAPTAIN_KEY，之後用 $CAPTAIN_KEY 取用" },
			{ command: "export", explanation: "列出目前所有變數" },
		],
	},
	env: {
		name: "env",
		summary: "列出目前全部的環境變數",
		usage: "env",
		description: [
			"env 會列出目前全部的環境變數，一行一個，格式是 名稱=值。",
			"用 export 設定變數之後，可以用 env 確認它有沒有出現、值對不對。",
			"值是空的變數會顯示成 名稱= 後面什麼都沒有，代表變數存在但被清空了。",
		],
		examples: [
			{ command: "env", explanation: "列出全部變數，例如 HOME=/home/tech、NOVA_DIR=/opt/nova" },
			{ command: "env | grep NOVA", explanation: "只挑出名稱或值含 NOVA 的變數" },
		],
	},
	ps: {
		name: "ps",
		summary: "列出正在執行的程序",
		usage: "ps [aux]",
		description: [
			"程序就是正在執行中的程式。ps 會列出目前所有程序，依 PID 排序。",
			"PID 是系統給每個程序的編號，要終止某個程序時，kill 後面接的就是這個數字。",
			"USER 是誰在執行它，%CPU 與 %MEM 是它吃掉多少運算與記憶體，STARTED 是啟動時間，COMMAND 是執行的指令。",
			"習慣打 ps aux 也可以，輸出一樣。",
		],
		examples: [
			{ command: "ps", explanation: "列出所有程序，例如 /opt/nova/nova --core" },
			{ command: "ps aux", explanation: "常見寫法，輸出跟 ps 一樣" },
			{ command: "ps | grep nova", explanation: "只挑出跟 nova 有關的程序" },
		],
	},
	top: {
		name: "top",
		summary: "看哪些程序最吃資源",
		usage: "top",
		description: [
			"top 會顯示系統負載，程序依 %CPU 由高到低排列，最耗資源的在最上面。",
			"欄位跟 ps 一樣，PID 也一樣可以拿去給 kill 用。",
			"這座站的 top 只印一次當下的快照，不會持續更新。",
		],
		examples: [
			{ command: "top", explanation: "看目前哪個程序最吃 CPU" },
		],
	},
	kill: {
		name: "kill",
		summary: "終止程序",
		usage: "kill [-9] PID...",
		description: [
			"kill 後面接 PID，終止那個程序；PID 用 ps 或 top 查。",
			"一般的 kill 只是「請它自己結束」，程序可以選擇不理，這時候它還會在 ps 裡。",
			"kill -9 是強制結束，程序沒辦法拒絕；但系統核心程序連 -9 都不能殺。",
			"可以一次給好幾個 PID，會逐一處理。",
		],
		examples: [
			{ command: "kill 207", explanation: "請 PID 207 的程序結束" },
			{ command: "kill -9 3141", explanation: "強制結束 PID 3141 的程序，它無法拒絕" },
			{ command: "kill 88 207", explanation: "一次終止兩個程序" },
		],
	},
};

/** 這組指令在 `help` 與側邊面板的顯示順序。 */
export const SYSTEM_COMMAND_ORDER: string[] = ["echo", "sort", "uniq", "export", "env", "ps", "top", "kill"];
