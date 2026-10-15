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
	xargs: {
		name: "xargs",
		summary: "把左邊的輸出變成指令的參數",
		usage: "xargs [-n 個數] [-I 代換字串] [指令 [參數...]]",
		description: [
			"rm、touch、kill 這些指令不讀 | 傳過來的內容，只看參數。xargs 接在 | 右邊，把左邊的輸出用空白和換行切成一個一個項目，接在後面那個指令的參數裡執行。",
			"例如 find trash -name '*.tmp' | xargs rm，等於把找到的每個檔名都打在 rm 後面。沒給指令時用 echo，所以 ls | xargs 會把清單印成一行。",
			"-n 2 每次只接兩個項目，分好幾次執行；-I {} 改成每一行執行一次，並把指令裡的 {} 換成那一行，例如 ls | xargs -I {} cp {} backup/，檔名有空白時也用 -I。",
			"xargs 自己的選項要寫在指令前面，指令後面的選項是那個指令的。左邊沒有輸出時什麼都不執行。其中一次執行失敗時其他照樣跑完，整個算失敗。",
			"cd、export、alias 這類改 shell 自己狀態的指令交給 xargs 不會生效（跟真的一樣，它們在另一個程序裡跑）；hint、clear、less 要直接打，不能交給 xargs。",
		],
		examples: [
			{ command: "xargs rm", explanation: "接在 | 右邊刪掉左邊列出的檔案，例如 find trash -name '*.tmp' | xargs rm" },
			{ command: "xargs -n 1 echo", explanation: "一個項目印一行" },
			{ command: "xargs -I {} cp {} backup/", explanation: "每個檔案各複製一份到 backup/" },
			{ command: "xargs kill", explanation: "結束左邊列出的程序，例如 ps | grep fan_test | cut -d ' ' -f 1 | xargs kill" },
		],
	},
	sed: {
		name: "sed",
		summary: "照腳本逐行取代、挑出或刪掉文字",
		usage: "sed [-n] [-E] [-i] [-e 腳本]... 腳本 [檔案...]",
		description: [
			"sed 一行一行讀進來，照你寫的腳本改過再印出來，原本的檔案不會變。最常用的是 s/舊/新/：把每行第一個「舊」換成「新」；結尾加 g 整行都換，加 i 不分大小寫，加數字只換第幾個。",
			"「舊」是正規表示式，寫法跟 grep 一樣，加 -E 改用延伸語法。「新」裡的 & 代表整個符合的字串，\\1 到 \\9 代表樣式裡 \\( \\) 包住的那幾段（-E 時是 ( )）。路徑的斜線很多時，分隔字元可以換成別的，例如 s|/deck1|/deck2|。",
			"指令前面可以加位址，只處理某些行：3 是第 3 行，2,5 是第 2 到 5 行，$ 是最後一行，/ERROR/ 是含 ERROR 的行。p 印出那幾行，d 刪掉那幾行，例如 sed '/^#/d' 去掉註解。",
			"sed 預設每一行都會印；-n 讓它只印 p 指定的行，所以 sed -n '3p' 只看第 3 行，sed -n '/ERROR/p' 跟 grep ERROR 一樣。",
			"好幾個指令用 ; 隔開，或給好幾個 -e，會依序套用。-i 直接改寫檔案、畫面上不印，改之前先不加 -i 跑一次確認結果。",
			"腳本裡有空白、$、* 這些符號時用單引號包起來。這裡的 sed 只做 s、p、d 三種，a、i、c、y 這類指令不支援。沒給檔名時讀 | 左邊的輸出。",
		],
		examples: [
			{ command: "sed 's/action=open/開門/' access.log", explanation: "把每行的 action=open 換成「開門」，檔案本身不變" },
			{ command: "sed -n '2,5p' sensors.log", explanation: "只印第 2 到 5 行" },
			{ command: "sed '/INFO/d' sensors.log", explanation: "刪掉含 INFO 的行，只留 WARN 和 ERROR" },
			{ command: "sed 's/,/ | /g' inventory.csv", explanation: "每個逗號都換成 | ，表格比較好讀" },
			{ command: "sed -i 's/1200/1500/' config_old.conf", explanation: "直接改寫設定檔裡的數字" },
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
	alias: {
		name: "alias",
		summary: "幫常用的指令取一個短名字",
		usage: "alias [名稱='指令 參數'...] [名稱...]",
		description: [
			"alias 幫一串常打的指令取個短名字，例如 alias ll='ls -l' 之後，打 ll 就等於打 ls -l，後面還能接參數：ll logs 就是 ls -l logs。",
			"等號兩邊不能有空白，內容有空白就用引號包起來。內容可以是一個指令，或用 | 串起來的管線，例如 alias errs='grep ERROR | wc -l'；; && > 這些寫法不行。",
			"不加參數的 alias 列出目前所有的別名，alias ll 只看 ll 那一條；不要了用 unalias ll 拿掉。",
			"只有指令開頭（或 | 後面）的第一個字會換成別名，當參數時不會。想用指令原本的樣子就在前面加反斜線或用引號包起來，例如 alias ls='ls -a' 之後，\\ls 還是原本的 ls。",
			"別名只存在這台終端機這次的工作階段：關掉再打開還在；換一台終端機、重新整理網頁、回標題，或練習模式按重置之後就沒了。跟真的 shell 一樣，沒寫進設定檔的別名重開就沒了。",
			"alias 是 shell 的內建指令。which 只找程式檔，查別名時會說明它是別名。",
		],
		examples: [
			{ command: "alias ll='ls -l'", explanation: "之後打 ll 就是 ls -l" },
			{ command: "alias errs='grep -c ERROR'", explanation: "之後打 errs sensors.log 就知道有幾行錯誤" },
			{ command: "alias", explanation: "列出目前所有的別名" },
			{ command: "alias ll", explanation: "只看 ll 那一條" },
		],
	},
	unalias: {
		name: "unalias",
		summary: "拿掉別名",
		usage: "unalias [-a] [名稱...]",
		description: [
			"unalias ll 拿掉 ll 這個別名，之後打 ll 就會說找不到指令；一次可以給好幾個名稱。",
			"-a 把這個工作階段的別名全部拿掉。",
			"名稱打錯或本來就沒有這個別名時會說明一下，不算打錯指令。unalias 也是 shell 的內建指令。",
		],
		examples: [
			{ command: "unalias ll", explanation: "拿掉 ll 這個別名" },
			{ command: "unalias -a", explanation: "全部拿掉" },
		],
	},
};

/** 這組指令在側邊面板的顯示順序，排在帳號與登入的彩蛋之後。 */
export const EXTRA2_COMMAND_ORDER: string[] = ["tr", "tee", "xargs", "sed", "date", "alias", "unalias"];
