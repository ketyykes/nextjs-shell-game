/**
 * 第十九場開放的 nano 編輯器（4.22）的說明，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 不在任何終端機的 `teaches` 裡，所以 `help` 不會列出（沙盒全部列出），`man nano` 查得到。
 */

import type { CommandDoc } from "../types";

export const EDITOR_COMMAND_DOCS: Record<string, CommandDoc> = {
	nano: {
		name: "nano",
		summary: "全螢幕的文字編輯器，打開、修改、存檔",
		usage: "nano [檔案]",
		description: [
			"nano 會把檔案放進全螢幕的編輯畫面，直接打字就會寫進去；方向鍵移動游標，可以貼上，也能用中文輸入法。",
			"檔案不存在也可以打開，按 Ctrl+O 存檔時才會建立；不給檔名時開一個空白的緩衝區，存檔時再輸入檔名。",
			"最下面兩列是常用按鍵，^ 代表 Ctrl，Mac 也是按 control 鍵，不是 command 鍵：",
			"Ctrl+O（^O）寫入：確認或修改檔名後按 Enter，存了還能繼續改。",
			"Ctrl+X（^X）離開：有沒存的修改時會問要不要存，Y 存、N 不存、Ctrl+C 取消；Esc 跟 Ctrl+X 一樣，只離開編輯器、不關終端機。",
			"Ctrl+W（^W）搜尋：輸入文字按 Enter，游標會跳到找到的地方，再按一次 Ctrl+W 加 Enter 找下一個。有些瀏覽器把 Ctrl+W 當成關閉分頁，改按 F6。",
			"Ctrl+G（^G）顯示按鍵說明。存檔後回到提示列，終端機會印一行寫了哪個檔案、幾行。",
			"沒有寫入權限的檔案可以打開來看，存檔會失敗，可以改存成別的檔名；只寫一行的話 echo 文字 > 檔名 更快。",
		],
		examples: [
			{ command: "nano notes.txt", explanation: "打開 notes.txt；不存在的話存檔時建立" },
			{ command: "nano", explanation: "開一個空白的緩衝區，存檔時再輸入檔名" },
			{ command: "nano ~/repair/core.cfg", explanation: "用路徑打開別的目錄裡的設定檔" },
		],
	},
};

/** 這組指令在側邊面板的顯示順序，排在帳號與登入的彩蛋之後。 */
export const EDITOR_COMMAND_ORDER: string[] = ["nano"];
