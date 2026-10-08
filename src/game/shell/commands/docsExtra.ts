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
};

/** 這組指令在側邊面板的顯示順序，排在六章指令之後。 */
export const EXTRA_COMMAND_ORDER: string[] = ["tree"];
