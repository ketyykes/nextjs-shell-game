/**
 * 概念說明：管線、重導向、變數展開這類「不是指令」的教學項目。
 *
 * 劇本的 `teaches` 會列出 `>`、`|`、`$變數` 這種概念，回顧卡與側邊面板需要說明文字，
 * 但它們不是可執行的指令，所以不併進 `COMMAND_DOCS`（help 與 man 的指令清單不含它們），
 * 由 `getTeachDoc` 在查不到指令時改查這裡。
 */

import type { CommandDoc } from "../types";

export const CONCEPT_DOCS: Record<string, CommandDoc> = {
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
