/**
 * M13-3 開放使用、但沒有編進任何章節劇本的指令說明，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 不在任何終端機的 `teaches` 裡，所以 `help` 不會列出，只有 `man` 查得到。
 */

import type { CommandDoc } from "../types";

export const EXTRA_COMMAND_DOCS: Record<string, CommandDoc> = {
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
};

/** 這組指令在側邊面板的顯示順序，排在六章指令之後。 */
export const EXTRA_COMMAND_ORDER: string[] = ["tree", "cut", "diff"];
