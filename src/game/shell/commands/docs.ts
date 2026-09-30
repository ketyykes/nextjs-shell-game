/**
 * 指令說明字典。
 *
 * `man` 指令與 UI 側邊面板的「已學指令」共用這一份資料，
 * 所以這裡的文字要讓新手看得懂，範例用第一章的世界觀檔名。
 */

import type { CommandDoc } from "../types";

export const COMMAND_DOCS: Record<string, CommandDoc> = {
	pwd: {
		name: "pwd",
		summary: "顯示你現在所在的目錄",
		usage: "pwd",
		description: [
			"pwd 是 print working directory 的縮寫，會印出你目前站在哪個目錄。",
			"檔案系統像一棵樹，每個目錄都有完整的位置，叫做路徑，從最上層的 / 開始算起。",
			"迷路的時候先打 pwd，就知道自己在哪裡。",
		],
		examples: [
			{ command: "pwd", explanation: "印出目前所在的目錄，例如 /home/tech" },
		],
	},
	ls: {
		name: "ls",
		summary: "列出目錄裡有什麼",
		usage: "ls [-a] [-l] [路徑...]",
		description: [
			"ls 會列出目錄裡的檔案與子目錄，不給路徑就列出目前所在的目錄。",
			"-a 會連隱藏檔一起顯示，檔名以 . 開頭的就是隱藏檔，平常 ls 看不到它們。",
			"-l 會顯示詳細資訊：權限、擁有者、大小與修改日期，一行一個項目。",
			"-a 和 -l 可以合在一起寫成 -la，一次看到全部。",
			"路徑可以給多個，ls 會依序列出每一個目錄的內容。",
		],
		examples: [
			{ command: "ls", explanation: "列出目前目錄的內容，例如 pod_06/ 與 wake_up.txt" },
			{ command: "ls -a /deck1/systems/power/breakers/B3", explanation: "連隱藏檔一起列出，可以看到 .override" },
			{ command: "ls -l /home/abin", explanation: "用詳細格式看阿彬的目錄，包含檔案大小與修改日期" },
			{ command: "ls -la /home", explanation: "-l 加 -a 合併寫，詳細資訊加上隱藏檔" },
		],
	},
	cd: {
		name: "cd",
		summary: "切換到別的目錄",
		usage: "cd [目錄]",
		description: [
			"cd 是 change directory 的縮寫，用來走進另一個目錄，走完之後 pwd 會顯示新的位置。",
			".. 代表上一層目錄，cd .. 就是退回上一層。",
			"~ 代表你的家目錄，cd ~ 可以直接回家。",
			"不帶任何參數，cd 也會回到家目錄。",
			"cd 只能進入目錄，如果目標是檔案，要改用 cat 來讀。",
		],
		examples: [
			{ command: "cd pod_06", explanation: "走進目前目錄底下的 pod_06 目錄" },
			{ command: "cd ..", explanation: "退回上一層目錄" },
			{ command: "cd ~", explanation: "回到家目錄 /home/tech" },
			{ command: "cd /deck1/systems/power/breakers/B3", explanation: "用絕對路徑一次走到 B3 斷路器目錄" },
		],
	},
	cat: {
		name: "cat",
		summary: "顯示檔案的內容",
		usage: "cat <檔案>...",
		description: [
			"cat 會把檔案的內容印在螢幕上，是讀檔案最基本的方法。",
			"檔名後面可以接很多個檔案，cat 會依序把它們全部印出來。",
			"cat 只能讀檔案，如果給的是目錄，要用 ls 看裡面有什麼。",
			"檔名太長打不動的時候，可以先打前幾個字再按 Tab 補全。",
		],
		examples: [
			{ command: "cat wake_up.txt", explanation: "讀取喚醒排程檔，看看內容寫了什麼" },
			{ command: "cat status.txt", explanation: "讀取目前目錄裡的狀態檔" },
			{ command: "cat /deck1/systems/power/breakers/B3/.override", explanation: "用絕對路徑讀取隱藏檔 .override" },
			{ command: "cat status.txt wake_up.txt", explanation: "一次讀兩個檔案，內容會依序印出" },
		],
	},
	help: {
		name: "help",
		summary: "列出目前會的指令",
		usage: "help",
		description: [
			"help 會列出你目前學過的所有指令，以及每個指令的一句話說明。",
			"忘記有哪些指令可以用的時候，打 help 就對了。",
			"想知道某個指令的詳細用法，請用 man 加上指令名稱。",
		],
		examples: [
			{ command: "help", explanation: "列出已學過的指令與簡短說明" },
		],
	},
	hint: {
		name: "hint",
		summary: "在卡關時取得提示",
		usage: "hint",
		description: [
			"卡關的時候輸入 hint，遊戲會給你這台終端機的提示。",
			"提示分三段：第一次給方向，第二次給指令名稱，第三次給完整的指令與說明。",
			"每台終端機各自計算次數，重複輸入 hint 就會一段一段給得更詳細。",
			"提示來自遊戲系統，不是 NOVA 說的，所以永遠可以相信。",
		],
		examples: [
			{ command: "hint", explanation: "取得這台終端機的下一段提示" },
		],
	},
	man: {
		name: "man",
		summary: "查看指令的詳細說明",
		usage: "man <指令>",
		description: [
			"man 是 manual 的縮寫，也就是使用手冊，會顯示指令的用法、說明與範例。",
			"側邊面板的已學指令看到的是同一份內容。",
			"養成不確定就先 man 一下的習慣，真實的 shell 也是這樣查指令的。",
		],
		examples: [
			{ command: "man ls", explanation: "查看 ls 的用法，包含 -a 與 -l 選項" },
			{ command: "man cd", explanation: "查看 cd 的用法，包含 .. 與 ~" },
		],
	},
	history: {
		name: "history",
		summary: "列出你打過的指令",
		usage: "history",
		description: [
			"history 會依序列出這一次遊玩中你打過的指令，最舊的在最上面，每行有一個編號。",
			"想重打之前的指令，不用重新輸入，按鍵盤的向上鍵就能叫回上一個指令。",
			"多按幾次向上鍵，可以繼續往更早的指令回溯，按向下鍵則往回走。",
		],
		examples: [
			{ command: "history", explanation: "列出目前為止打過的所有指令" },
		],
	},
	clear: {
		name: "clear",
		summary: "清空終端機畫面",
		usage: "clear",
		description: [
			"clear 會把終端機畫面上的文字全部清掉，讓畫面回到乾淨的狀態。",
			"只是清掉畫面，不會影響你所在的目錄，也不會刪掉歷史紀錄。",
			"輸出太多、畫面看不清楚的時候很好用。",
		],
		examples: [
			{ command: "clear", explanation: "清空畫面，重新開始" },
		],
	},
};

/** 指令列表的顯示順序，`help` 與側邊面板都照這個順序排。 */
export const COMMAND_DOC_ORDER: string[] = [
	"pwd",
	"ls",
	"cd",
	"cat",
	"help",
	"hint",
	"man",
	"history",
	"clear",
];

/**
 * 取得指令說明，指令不存在時回傳 `undefined`。
 * 用 `Object.hasOwn` 判斷，避免 `constructor`、`toString` 這類原型上的名稱被誤認成指令。
 */
export function getCommandDoc(name: string): CommandDoc | undefined {
	if (!Object.hasOwn(COMMAND_DOCS, name)) {
		return undefined;
	}
	return COMMAND_DOCS[name];
}
