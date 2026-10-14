/**
 * 第十七場帳號與登入彩蛋（whoami、id、last、sudo、exit、logout）的說明資料，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 不在任何終端機的 `teaches` 裡，所以 `help` 不會列出，只有 `man` 查得到（沙盒例外，全部列出）。
 *
 * 沙盒的 `man` 也看得到這份，所以說明與範例只用 `tech`、`root` 這些通用的帳號，不提主線的人名與劇情。
 */

import type { CommandDoc } from "../types";

export const ACCOUNT_COMMAND_DOCS: Record<string, CommandDoc> = {
	whoami: {
		name: "whoami",
		summary: "顯示你登入的帳號名稱",
		usage: "whoami",
		description: [
			"whoami 就是 who am I（我是誰），印出你目前登入的帳號名稱，只有一行。",
			"它看的是你登入時用的帳號，不是環境變數 USER，所以 export USER=別的名字 也改不了它。",
			"想看帳號的編號與所屬群組，用 id。",
		],
		examples: [
			{ command: "whoami", explanation: "印出你的帳號名稱，例如 tech" },
		],
	},
	id: {
		name: "id",
		summary: "顯示帳號的編號與所屬群組",
		usage: "id [帳號]",
		description: [
			"id 印出帳號的使用者編號 uid、主要群組 gid，以及所屬的全部群組 groups。",
			"系統其實是用編號認人，括號裡的名稱只是給人看的，例如 uid=0(root) 代表編號 0 就是 root。",
			"群組是一群共用權限的帳號，chmod 的 g 指的就是檔案所屬的群組。",
			"不給帳號就顯示你自己的；給帳號名稱就查那個帳號，一次查一個。",
		],
		examples: [
			{ command: "id", explanation: "顯示你自己的 uid、gid 與群組" },
			{ command: "id root", explanation: "查系統管理員 root 的帳號，它的 uid 是 0" },
		],
	},
	last: {
		name: "last",
		summary: "列出最近的登入紀錄",
		usage: "last [帳號...]",
		description: [
			"last 列出這台主機的登入紀錄，最新的在最上面，一次登入一行。",
			"欄位依序是帳號、終端機、來源主機（在站上直接登入時是空的）、登入時間，最後是登出時間與用了多久，例如 - 02:53  (00:06) 是用了 6 分鐘。",
			"還沒登出的寫 still logged in。時間都是 UTC，跟 ls -l 一樣。",
			"給帳號名稱就只列那個帳號的紀錄。最後一行 wtmp begins 是這份紀錄從什麼時候開始記，更早的登入不在這裡。",
		],
		examples: [
			{ command: "last", explanation: "看最近有誰登入過、待了多久" },
			{ command: "last tech", explanation: "只看 tech 這個帳號的登入紀錄" },
			{ command: "last | grep still", explanation: "只挑出現在還沒登出的" },
		],
	},
	sudo: {
		name: "sudo",
		summary: "用系統管理員的身分執行指令",
		usage: "sudo 指令 [參數...]",
		description: [
			"sudo 讓有權限的帳號暫時用系統管理員 root 的身分執行一個指令，通常是改系統設定這類一般帳號不能做的事。",
			"只有寫在 sudoers 名單裡的帳號可以用，別的帳號用了，sudo 會拒絕並把這件事記下來。",
			"這座站的工作都用不到 sudo：讀不到的檔案用 ls -l 看權限，再用 chmod 改。",
		],
		examples: [
			{ command: "sudo ls /root", explanation: "用 root 的身分列出 /root，帳號要在 sudoers 名單裡才行" },
		],
	},
	exit: {
		name: "exit",
		summary: "結束 shell（這裡要按 Esc）",
		usage: "exit",
		description: [
			"在一般的終端機裡，exit 會結束目前的 shell，視窗跟著關掉。",
			"這個遊戲的終端機不能用 exit 關，要離開請按 Esc，或點「[Esc] 關閉」。",
			"站上的終端機按 Esc 只是把畫面關上，下次打開工作目錄與檔案都還在；練習模式按 Esc 會先問要不要回標題，回去之後練習的內容不會保留。",
		],
		examples: [
			{ command: "exit", explanation: "在這裡只會提醒你按 Esc" },
		],
	},
	logout: {
		name: "logout",
		summary: "登出（這裡要按 Esc）",
		usage: "logout",
		description: [
			"logout 結束登入時開的那個 shell，效果跟 exit 差不多。",
			"這個遊戲的終端機一樣不能用它關，要離開請按 Esc，或點「[Esc] 關閉」。",
		],
		examples: [
			{ command: "logout", explanation: "在這裡只會提醒你按 Esc" },
		],
	},
};

/** 這組指令的顯示順序，排在所有指令的最後。 */
export const ACCOUNT_COMMAND_ORDER: string[] = ["whoami", "id", "last", "sudo", "exit", "logout"];
