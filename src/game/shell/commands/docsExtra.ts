/**
 * M13-3 開放使用、但沒有編進任何章節劇本的指令說明，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 不在任何終端機的 `teaches` 裡，所以 `help` 不會列出，只有 `man` 查得到。
 */

import type { CommandDoc } from "../types";

export const EXTRA_COMMAND_DOCS: Record<string, CommandDoc> = {
	less: {
		name: "less",
		summary: "一頁一頁翻看長檔案",
		usage: "less [-N] [檔案...]",
		description: [
			"檔案太長、cat 一印就洗掉整個畫面時用 less：它把內容放進全螢幕的翻頁畫面，一次只看一頁。",
			"空白鍵或 PageDown 往下一頁，b 或 PageUp 往上一頁；↓、j、Enter 往下一行，↑、k 往上一行；d、u 半頁；g 跳到開頭，G 跳到結尾。",
			"打 / 加關鍵字再按 Enter 往下找（寫法跟 grep -E 一樣），n 找下一個、N 找上一個；? 加關鍵字是往上找。",
			"最下面一行顯示檔名、目前看到第幾行與百分比，翻到底會出現 (END)。按 q 或 Esc 離開，回到原本的提示列。",
			"-N 在每行前面加行號。一次給好幾個檔案時，:n 換下一個、:p 回上一個。",
			"沒給檔名時翻 | 左邊指令的輸出，例如 grep ERROR nova_core.log | less。",
		],
		examples: [
			{ command: "less /deck2/logs/evac_2028-06-02.log", explanation: "一頁一頁翻看撤離當晚的日誌" },
			{ command: "less -N /deck2/logs/door_events.log", explanation: "加上行號翻看艙門事件" },
			{ command: "less door_events.log nova_core.log", explanation: "先翻第一份，:n 換到第二份" },
		],
	},
	tree: {
		name: "tree",
		summary: "把目錄畫成樹狀圖",
		usage: "tree [-a] [-d] [-L 層數] [路徑...]",
		description: [
			"tree 會從目錄一路往下，把底下所有的檔案與子目錄畫成一棵樹，一眼看出整個目錄的結構。",
			"├── 和 └── 標出每個項目，└── 是那一層的最後一個；目錄名稱結尾有 /，跟 ls 一樣。",
			"最後一行統計一共有幾個目錄、幾個檔案。不給路徑就從目前目錄 . 開始畫。",
			"-a 連隱藏檔一起畫，-d 只畫目錄，-L 2 只往下畫兩層，目錄很深的時候先用它看個大概。",
		],
		examples: [
			{ command: "tree /deck2/logs", explanation: "畫出日誌目錄底下的所有檔案與子目錄" },
			{ command: "tree -L 1 /deck2", explanation: "只看資料中心底下第一層有什麼" },
			{ command: "tree -d /deck2", explanation: "只畫目錄，看清楚資料夾怎麼分層" },
			{ command: "tree -a ~", explanation: "連隱藏檔一起畫出家目錄" },
		],
	},
	cut: {
		name: "cut",
		summary: "從每一行切出指定的欄位或字元",
		usage: "cut -d 分隔字元 -f 欄位 [-s] [檔案...] 或 cut -c 位置 [檔案...]",
		description: [
			"像名冊、設定檔這種一行有好幾欄的資料，cut 可以只把你要的那幾欄切出來。",
			"-d 指定欄位之間的分隔字元，-f 指定要第幾欄，例如 -d , -f 2 是逗號分隔的第二欄；不給 -d 時用 Tab 分隔。",
			"-c 改成依字元位置切，例如 -c 1-5 是每行的前五個字，中文一個字算一個。",
			"位置可以寫 2、1,3、2-4，或 3- 代表第 3 個到最後；輸出照原本的順序，-f 3,1 跟 -f 1,3 一樣。",
			"沒有分隔字元的行會整行照印，加 -s 就略過它們。分隔字元是空白時要用引號包起來：-d \" \"。",
			"沒給檔名時讀 | 左邊指令的輸出，例如 cat crew.csv | cut -d , -f 2。",
		],
		examples: [
			{ command: "cut -d , -f 2 crew.csv", explanation: "取出逗號分隔名冊的第二欄（姓名）" },
			{ command: "cut -d , -f 1,3 crew.csv", explanation: "取出第一欄和第三欄，中間照樣用逗號接起來" },
			{ command: "cut -d \" \" -f 3- door_events.log", explanation: "用空白切，取第三欄到最後" },
			{ command: "cut -c 1-5 door_events.log", explanation: "只看每行開頭的時間（前五個字）" },
		],
	},
	diff: {
		name: "diff",
		summary: "逐行比較兩個檔案哪裡不同",
		usage: "diff [-u] [-q] 檔案1 檔案2",
		description: [
			"diff 會逐行比較兩個檔案，只印出不一樣的地方；兩個檔案完全一樣時什麼都不印。",
			"每段差異先有一行標頭：3c3 是第 3 行被改了，4d3 是刪掉第 4 行，5a6,7 是在第 5 行後面加了第 6 到 7 行（逗號前是第一個檔案的行號，後面是第二個的）。",
			"< 開頭的行來自第一個檔案，> 開頭的行來自第二個檔案，改動的前後用 --- 隔開。",
			"-u 改用另一種常見的格式：- 開頭是刪掉的行、+ 開頭是加入的行，前後各附三行沒變的內容幫你對位置；-q 只說兩個檔案有沒有不同。",
			"其中一個寫目錄時，會去比目錄裡同名的檔案，例如 diff core.cfg backup/ 比的是 backup/core.cfg。",
			"有差異是正常的結果，不算打錯指令；- 代表 | 左邊指令的輸出，例如 sort a.txt | diff - b.txt。",
		],
		examples: [
			{ command: "diff core.cfg backup/core.cfg", explanation: "比對現在的設定檔跟備份差在哪幾行" },
			{ command: "diff core.cfg backup/", explanation: "跟上一個一樣，目錄裡同名的檔案會自動對上" },
			{ command: "diff -u core.cfg backup/core.cfg", explanation: "用 - 與 + 標出刪掉和加入的行" },
			{ command: "diff -q core.cfg backup/core.cfg", explanation: "只想知道兩個檔案一不一樣" },
		],
	},
	which: {
		name: "which",
		summary: "查指令的程式檔放在哪裡",
		usage: "which [-a] 指令...",
		description: [
			"你打的指令大多是一支放在某個目錄裡的程式，shell 會照環境變數 PATH 列的目錄，用冒號隔開，一個一個去找。",
			"which 印出它找到的那一支，例如 which ls 印出 /usr/bin/ls；-a 印出 PATH 裡每一個找得到的位置。",
			"這台站的一般指令都在 /usr/bin（/bin 跟它是同一個目錄），站上加裝的 hint 在 /usr/local/bin。",
			"cd、export、help、history 是 shell 的內建指令，沒有獨立的程式檔，which 找不到它們，但照樣能用。",
			"沒有設定 PATH 時照預設的 /usr/local/bin:/usr/bin:/bin 找。找不到時會說明原因，不算打錯指令。",
		],
		examples: [
			{ command: "which ls", explanation: "印出 /usr/bin/ls" },
			{ command: "which hint grep", explanation: "一次查兩個，hint 在 /usr/local/bin" },
			{ command: "which -a ls", explanation: "列出 PATH 裡每一個找得到 ls 的位置" },
			{ command: "which cd", explanation: "cd 是內建指令，沒有程式檔" },
		],
	},
};

/** 這組指令在側邊面板的顯示順序，排在六章指令之後。 */
export const EXTRA_COMMAND_ORDER: string[] = ["less", "tree", "cut", "diff", "which"];
