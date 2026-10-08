/**
 * 概念說明：路徑簡寫、Tab 補全、萬用字元、管線、重導向、變數展開這類「不是指令」的教學項目。
 *
 * 劇本的 `teaches` 會列出 `..`、`Tab`、`*`、`>`、`|`、`$變數` 這種概念，回顧卡與側邊面板需要說明文字，
 * 但它們不是可執行的指令，所以不併進 `COMMAND_DOCS`（help 與 man 的指令清單不含它們），
 * 由 `getTeachDoc` 在查不到指令時改查這裡；`help` 也會跳過這裡有的名稱。
 */

import type { CommandDoc } from "../types";

export const CONCEPT_DOCS: Record<string, CommandDoc> = {
	// 第一章：路徑簡寫與 Tab 補全
	"..": {
		name: "..",
		summary: "代表上一層目錄",
		usage: "cd .. 或 ../路徑",
		description: [
			".. 代表上一層目錄，一個點 . 代表目前所在的目錄。每個目錄裡都有這兩個，用 ls -a 就看得到。",
			"cd .. 退回上一層，cd ../.. 一次退兩層。",
			".. 也可以寫在路徑中間，例如 ../power/status.txt 是「先退回上一層，再走進 power」。",
			"像這樣從目前位置出發的路徑叫相對路徑；開頭是 / 的叫絕對路徑，從哪裡打都指向同一個地方。",
		],
		examples: [
			{ command: "cd ..", explanation: "退回上一層目錄" },
			{ command: "cat ../power/status.txt", explanation: "站在 oxygen 目錄，讀隔壁 power 目錄的狀態檔" },
			{ command: "cd ../..", explanation: "一次退兩層" },
		],
	},
	"~": {
		name: "~",
		summary: "代表你的家目錄",
		usage: "cd ~ 或 ~/路徑",
		description: [
			"~ 是家目錄的簡寫。你的家目錄是 /home/tech，提示符裡的 ~ 指的就是這裡。",
			"cd ~ 從任何地方都能直接回家，不帶參數的 cd 也一樣。",
			"~/ 開頭的路徑從家目錄算起，例如 ~/note.txt 就是 /home/tech/note.txt。",
			"站上每個人的家目錄都在 /home 底下，例如阿彬的是 /home/abin。",
		],
		examples: [
			{ command: "cd ~", explanation: "回到家目錄 /home/tech" },
			{ command: "cat ~/note.txt", explanation: "不管現在在哪裡，都能讀家目錄裡的 note.txt" },
		],
	},
	Tab: {
		name: "Tab",
		summary: "自動補全指令名稱與路徑",
		usage: "打開頭幾個字，再按 Tab 鍵",
		description: [
			"打指令或路徑時，只要打開頭幾個字再按鍵盤的 Tab 鍵，終端機會替你補完剩下的部分，這叫做 Tab 補全。",
			"只有一個對得上時直接補完：檔案後面會多一個空白，目錄後面會加上 /，可以接著打下一層。",
			"有好幾個對得上時，會先補到它們共同的開頭，並把所有候選列出來；多打幾個字再按一次 Tab。",
			"按了沒反應，代表目前的位置沒有這個開頭的東西，先用 ls 看看。長檔名用 Tab 補，比自己打快也不會打錯。",
		],
		examples: [
			{ command: "cat wa", explanation: "打到這裡按 Tab，補成 cat wake_up.txt" },
			{ command: "cd /deck1/sys", explanation: "按 Tab 補成 /deck1/systems/，目錄會自動加上 /" },
			{ command: "cat records/PT-2028-06", explanation: "病歷檔名很長，打開頭幾個字按 Tab，剩下的交給終端機" },
		],
	},
	// 第二章：萬用字元
	"*": {
		name: "*",
		summary: "萬用字元，代表任意文字，一次指定很多個檔名",
		usage: "指令 開頭*結尾",
		description: [
			"* 是 shell 的萬用字元，代表「任意長度的任意文字」，一個字都沒有也算。",
			"指令執行之前，shell 會先把含 * 的參數換成所有對得上的檔名，例如 evac_*.log 會變成 evac_001.log 到 evac_030.log 一整串，再一起交給指令。",
			"沒有任何檔名對得上時，* 會照原樣留著交給指令。",
			"用引號包起來的 * 不會被展開，會原封不動交給指令。find -name \"rollback_*\" 要加引號，就是要讓 find 自己拿 * 去比對每一層的檔名。",
			"grep 的樣式不一樣：那是正規表示式，* 代表「前一個字重複零次以上」，不是任意文字；要表示任意文字寫成 .*，而且樣式要加引號。",
		],
		examples: [
			{ command: "wc -l evac_*.log", explanation: "一次數完 evac_001.log 到 evac_030.log 每份日誌的行數" },
			{ command: "sort fragments/*", explanation: "把 fragments 目錄裡的每個檔案一起排序" },
			{ command: "find /deck2/vault -name \"*exit_key*\"", explanation: "加了引號，* 原樣交給 find，找出檔名含 exit_key 的檔案" },
		],
	},
	// kill 有指令條目，但「kill -9」是獨立的教學項目（teaches 兩個都列），
	// 回顧卡查完整字串才分得出兩列的差別
	"kill -9": {
		name: "kill -9",
		summary: "強制終止不理一般訊號的程序",
		usage: "kill -9 PID",
		description: [
			"kill 是「請程序結束」，程序可以拒絕；kill -9 是強制終止，程序沒有拒絕的機會。",
			"先用一般的 kill，不聽話的再用 -9。",
		],
		examples: [{ command: "kill -9 1207", explanation: "強制終止編號 1207 的程序" }],
	},
	">": {
		name: ">",
		summary: "把指令的輸出寫進檔案，覆蓋原本的內容",
		usage: "指令 > 檔案",
		description: [
			"> 叫做重導向，會把左邊指令的輸出存進右邊的檔案，而不是印在螢幕上。",
			"檔案不存在就建立新檔，已存在則整個覆蓋，舊內容會不見。",
			"想保留舊內容、把輸出接在後面，改用 >>。",
		],
		examples: [
			{ command: "echo KEPLER-9 > callsign.txt", explanation: "把 KEPLER-9 這行字寫進 callsign.txt" },
			{ command: "sort fragments/* | uniq > signal.txt", explanation: "把整理好的訊號存成 signal.txt" },
		],
	},
	">>": {
		name: ">>",
		summary: "把指令的輸出接在檔案的結尾",
		usage: "指令 >> 檔案",
		description: [
			">> 跟 > 一樣把輸出寫進檔案，差別是不覆蓋：新內容接在原本內容的後面。",
			"檔案不存在時一樣會建立新檔。",
		],
		examples: [
			{ command: "cat signal.txt >> outbox.txt", explanation: "把求救訊號加進發送佇列的結尾" },
		],
	},
	"|": {
		name: "|",
		summary: "把左邊指令的輸出交給右邊的指令處理",
		usage: "指令A | 指令B",
		description: [
			"| 叫做管線，會把左邊指令印出來的東西，直接當成右邊指令的輸入。",
			"可以一層一層接下去，像工廠的輸送帶，每一站處理一道工序。",
		],
		examples: [
			{ command: "grep 回應 ping.log | tail -n 1", explanation: "先挑出有回應的行，再只看最後一筆" },
			{ command: "ls stations | wc -l", explanation: "數一數 stations 目錄裡有幾個項目" },
		],
	},
	$變數: {
		name: "$變數",
		summary: "讀出環境變數存的值",
		usage: "$名稱 或 ${名稱}",
		description: [
			"環境變數像貼了標籤的置物格，export 把值存進去，$ 開頭就能把值讀出來用。",
			"指令執行前，$名稱 會先被換成變數的值，再執行整行指令。",
			"用單引號包起來的 $ 不會展開，會保留原樣。",
		],
		examples: [
			{ command: "cat /deck5/keys/$CAPTAIN_KEY.txt", explanation: "用 CAPTAIN_KEY 變數的值組出檔名再讀取" },
			{ command: "cd $POD_DIR", explanation: "走進 POD_DIR 變數指向的目錄" },
		],
	},
};
