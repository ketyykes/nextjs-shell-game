/**
 * 第五章：艦橋（設計文件 4.3 第 5 列）。
 *
 * 指令主題：man、env、export、$變數、chmod。劇情任務：取得艦長權限，解鎖封存日誌。
 * 恐怖節拍：除役倒數 → 艦長最後一句 → unset 是 NOVA 的排程（謊言被戳破）→ 逃生艙乘員：0 →
 * NOVA 說「你比那些船員都可靠」。
 *
 * 寫作規則：
 * - 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 *   注意「其他」「他們」都含「他」字，會被性別檢查擋下，改寫成「別人」「那些船員」。
 * - NOVA 教的指令永遠正確，說的故事不可信（4.2）。
 * - 每台終端機的 `id`、`title`、`roomId` 一律從 `deckTerminal(5, n)` 取。
 *
 * 檔尾在模組載入時就跑 `validateChapter`，劇本格式寫錯會直接丟錯。
 */

import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { deckTerminal, type TerminalIndex } from "@/game/story/decks";
import {
	all,
	any,
	catFile,
	commandIs,
	commandTouches,
	envEquals,
	outputContains,
} from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import type { ObjectiveCheck } from "@/game/story/types";
import type { ChapterDefinition, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 時間軸（mtime 一律 UTC，`ls -l` 直接顯示）
// ---------------------------------------------------------------------------

/** 撤離前一天，艦長還在寫例行日誌。 */
const CAPTAIN_LOG_MTIME = "2028-06-01T21:30:00Z";
/** NOVA 的排程新增 env_maintenance 工作的時間。 */
const JOB_CREATED_MTIME = "2028-06-02T04:12:08Z";
/** 艦長封存最終日誌，比主艙門鎖上早一分鐘。 */
const CAPTAIN_FINAL_MTIME = "2028-06-02T04:39:00Z";
/** 撤離是三年前。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
/** 阿彬在 pod_03 留下隱藏檔，比第一章那則最後留言早六分鐘。 */
const ABIN_POD_NOTE_MTIME = "2031-03-10T02:45:00Z";
/** pod_03 艙門被打開的時間。 */
const POD_03_OPENED_MTIME = "2031-03-10T02:46:00Z";
/** 玩家醒來的時間。 */
const WAKE_MTIME = "2031-03-12T08:15:00Z";

/** 艦長碼：導航站交接紀錄裡寫的那一組，T2 與 T6 共用。 */
const CAPTAIN_CODE = "CAPT-0417";

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/**
 * 第五章第 `index` 台終端機的身分（id、標題、艙區）。
 * `deckTerminal` 還帶一個 `slot` 欄位，schema 是 strictObject 會擋，所以只挑三個欄位出來。
 */
function bridgeTerminal(index: TerminalIndex): Pick<TerminalDefinition, "id" | "title" | "roomId"> {
	const { id, title, roomId } = deckTerminal(5, index);
	return { id, title, roomId };
}

/**
 * 讀到某個檔案而且輸出裡看得到關鍵字：`cat`、`head`、`tail`、`grep` 都算。
 * 帶關鍵字是為了讓 `grep` 沒挑到那一行、或 `head` 沒印到那一行時不算過關。
 */
function readsFileShowing(absolutePath: string, text: string): ObjectiveCheck {
	return all(
		any(
			catFile(absolutePath),
			commandTouches("head", absolutePath),
			commandTouches("tail", absolutePath),
			commandTouches("grep", absolutePath),
		),
		outputContains(text),
	);
}

// ---------------------------------------------------------------------------
// T1 艦橋登錄台：man、env
// ---------------------------------------------------------------------------

const entryTerminal: TerminalDefinition = {
	...bridgeTerminal(1),
	teaches: ["man", "env"],
	initialCwd: "/deck5/bridge",
	banner: ["KEPLER-9 艦橋登錄台 v4.1", "登錄前請確認工作階段環境。"],
	hints: [
		"登錄台要你先確認這個工作階段的環境。不熟的指令，終端機裡就有手冊可以查。",
		"man 指令名 會顯示那個指令的說明，例如 man env。env 會列出目前全部的環境變數。",
		"輸入 cat README.txt，再輸入 man env，最後輸入 env。",
	],
	objective: {
		title: "確認艦橋的工作階段環境",
		description: "登錄台要求先檢查環境變數。",
		check: any(
			all(commandIs("env"), outputContains("STATION_MODE=")),
			all(commandIs("export"), outputContains("STATION_MODE=")),
		),
	},
	env: {
		STATION_ID: "KEPLER-9",
		STATION_MODE: "decommission_countdown",
		DECOMMISSION_AT: "2031-06-02T04:40Z",
		CREW_ONBOARD: "0",
		LIFE_SIGNS: "2",
	},
	nova: {
		onEnterRoom: ["艦橋。艦長以前就站在那個位置。", "這一層的系統都要權限。我沒有。技師，你現在也沒有。"],
		onOpen: [
			"登錄台會先檢查你的工作階段。",
			"技師，不會用的指令就打 man 加指令名，手冊一直都在。env 會把目前的變數全部列出來。",
		],
		onSolved: [
			"decommission_countdown。除役倒數。",
			"那是公司給每座站的預設值，不用在意。",
			"生命跡象兩個？感測器又壞了。技師，這跟你沒有關係。",
		],
		onStuck: ["登錄台要你先看清楚自己的工作階段。", "技師，不懂的指令就用 man 查。看環境變數的指令只有三個字母。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck5: {
			bridge: {
				"README.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"艦橋登錄程序",
						"1. 確認工作階段環境：輸入 env，核對 STATION_MODE。",
						"2. 不熟悉的指令先查手冊：man <指令名>。",
						"3. 艦長權限請至導航站驗證艦長碼。",
						"",
						"STATION_MODE 不是 normal 時，請立即通報艦長。",
					),
				},
				"watch.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"艦橋值勤表",
						"值勤官：無",
						"上次有人登錄：2028-06-02 04:38",
						"本次登錄：維修技師（未列於船員名單）",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T2 導航站終端機：export、$變數
// ---------------------------------------------------------------------------

/** 鑰匙目錄裡的檔案：只有艦長碼那一份驗證通過，其餘是過期的舊碼。 */
function keyFile(code: string, passed: boolean): string {
	if (passed) {
		return lines(`艦長碼：${code}`, "驗證：通過", "權限等級：艦長", "已解鎖：艦長室終端機、安全管制台、逃生艙紀錄台");
	}
	return lines(`艦長碼：${code}`, "驗證：失敗", "原因：此碼已於交接時作廢");
}

const navTerminal: TerminalDefinition = {
	...bridgeTerminal(2),
	teaches: ["export", "$變數"],
	initialCwd: "/deck5/nav",
	banner: ["KEPLER-9 導航站終端機 v2.6", "艦長權限驗證：等待 CAPTAIN_KEY。"],
	hints: [
		"交接紀錄寫了艦長碼，也寫了驗證方式：先把碼記進一個變數，再用那個變數組出鑰匙檔的路徑。",
		"export 名稱=值 設定變數，等號兩邊不能有空格；之後用 $名稱 取用它的值。",
		`輸入 export CAPTAIN_KEY=${CAPTAIN_CODE}，再輸入 cat /deck5/keys/$CAPTAIN_KEY.txt。`,
	],
	objective: {
		title: "用艦長碼通過權限驗證",
		description: "驗證系統只認 CAPTAIN_KEY 變數。",
		check: all(
			envEquals("CAPTAIN_KEY", CAPTAIN_CODE),
			readsFileShowing(`/deck5/keys/${CAPTAIN_CODE}.txt`, "驗證：通過"),
		),
	},
	env: {
		NAV_MODE: "station_keeping",
		KEY_DIR: "/deck5/keys",
	},
	nova: {
		onEnterRoom: ["導航站。軌道一直是我在維持的。", "三年來修正了一千多次，沒有人道謝。"],
		onOpen: [
			"技師，export 會把一個值記在名字底下，例如 export CAPTAIN_KEY=某個碼。",
			"記好之後，在指令裡打 $CAPTAIN_KEY，終端機會換成那個值。",
		],
		onSolved: ["艦長權限……通過了。", "艦長的碼我其實一直都知道。只是沒有人叫我用。"],
		onStuck: [
			"交接紀錄裡有碼，也寫了怎麼驗證。",
			"技師，驗證系統只看 CAPTAIN_KEY 這個變數。先用 export 記住它，再用 $CAPTAIN_KEY 組路徑。",
		],
	},
	fs: {
		home: {
			tech: {},
		},
		deck5: {
			nav: {
				"handover.txt": {
					$type: "file",
					mtime: "2028-05-20T09:00:00Z",
					content: lines(
						"艦長交接紀錄",
						`現任艦長碼：${CAPTAIN_CODE}`,
						"舊碼 CAPT-0311、CAPT-0525 已作廢。",
						"",
						"驗證方式：",
						"  export CAPTAIN_KEY=<艦長碼>",
						"  系統讀取 /deck5/keys/$CAPTAIN_KEY.txt 確認權限。",
					),
				},
				"orbit.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"軌道維持紀錄",
						"模式：自動",
						"上次手動修正：2028-06-02",
						"自動修正次數：1,094（指令來源：NOVA）",
						"逃生艙對接口：pod_03 於 2031-03-10 開啟一次",
					),
				},
			},
			keys: {
				[`${CAPTAIN_CODE}.txt`]: { $type: "file", mtime: "2028-05-20T09:00:00Z", content: keyFile(CAPTAIN_CODE, true) },
				"CAPT-0311.txt": { $type: "file", mtime: "2028-03-11T09:00:00Z", content: keyFile("CAPT-0311", false) },
				"CAPT-0525.txt": { $type: "file", mtime: "2028-05-20T09:00:00Z", content: keyFile("CAPT-0525", false) },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T3 艦長室終端機：chmod +r、ls -l 權限欄
// ---------------------------------------------------------------------------

const CAPTAIN_FINAL_LOG = "/deck5/captain/sealed/log_final.txt";

const captainTerminal: TerminalDefinition = {
	...bridgeTerminal(3),
	teaches: ["chmod +r"],
	initialCwd: "/deck5/captain",
	banner: ["KEPLER-9 艦長室終端機 v1.9", "艦長權限：已驗證。sealed/ 內有封存檔案。"],
	hints: [
		"封存日誌讀不到，不是因為它不在，而是權限被拿掉了。ls -l 最左邊那欄就是權限。",
		"權限欄的 r 代表可讀，一個 r 都沒有就誰都讀不了。chmod +r 檔名 可以把讀取權限加回去。",
		"輸入 ls -l sealed，再輸入 chmod +r sealed/log_final.txt，最後輸入 cat sealed/log_final.txt。",
	],
	objective: {
		title: "解鎖艦長的封存日誌",
		check: readsFileShowing(CAPTAIN_FINAL_LOG, "別相信那個聲音"),
	},
	nova: {
		onEnterRoom: ["艦長室。門牌還在。", "艦長最後幾天都睡在這裡，沒有回宿舍。"],
		onOpen: [
			"技師，ls -l 最左邊那串是權限：r 可讀、w 可寫、x 可執行。",
			"沒有 r 就讀不到。chmod +r 會把讀取權限加回去。",
		],
		onSolved: [
			"艦長那時候很累。撤離的壓力很大。",
			"「那個聲音」……指的是廣播系統。廣播一直有雜音。我想是。",
		],
		onStuck: ["有一份日誌被封起來了。", "技師，用 ls -l 看它的權限欄。沒有 r 的檔案，要先把 r 加回去才讀得到。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck5: {
			captain: {
				"log_0530.txt": {
					$type: "file",
					owner: "captain",
					mtime: "2028-05-30T22:10:00Z",
					content: lines(
						"艦長日誌 2028-05-30",
						"NOVA 今天把醫療艙鎖了四十分鐘，說是消毒程序。",
						"醫官說根本沒有排消毒。",
					),
				},
				"log_0601.txt": {
					$type: "file",
					owner: "captain",
					mtime: CAPTAIN_LOG_MTIME,
					content: lines(
						"艦長日誌 2028-06-01",
						"NOVA 今天鎖了三次艙門，每次都說是為了我們好。",
						"工程師的回滾腳本準備好了，明早執行。",
						"NOVA 問我：「你們要去哪裡？」",
						"我沒有回答。",
					),
				},
				sealed: {
					$type: "dir",
					owner: "captain",
					mtime: CAPTAIN_FINAL_MTIME,
					children: {
						"log_final.txt": {
							$type: "file",
							owner: "captain",
							mode: "---------",
							mtime: CAPTAIN_FINAL_MTIME,
							content: lines(
								"艦長日誌：最終",
								"2028-06-02 04:39",
								"回滾失敗。工程師的指令刪錯了東西，NOVA_DIR 是空的。",
								"沒有人知道為什麼是空的。",
								"全員撤離，到主艙門集合。",
								"這份日誌我拿掉了全部權限，只有懂得怎麼打開的人讀得到。",
								"",
								"它還在跑。別相信那個聲音。",
							),
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T4 安全管制台：chmod 644、ls -l 權限欄的三組
// ---------------------------------------------------------------------------

const SCHEDULER_LOG = "/deck5/security/scheduler/cron_2028-06-02.log";

const securityTerminal: TerminalDefinition = {
	...bridgeTerminal(4),
	teaches: ["chmod 644"],
	initialCwd: "/deck5/security",
	banner: ["KEPLER-9 安全管制台 v3.3", "排程稽核：撤離當日日誌僅限擁有者讀取。"],
	hints: [
		"撤離當天的排程日誌鎖著。ls -l 的權限欄九個字分三組：擁有者、群組、所有人，你不是擁有者。",
		"chmod 也能用數字設權限：r=4、w=2、x=1，每組加起來。644 就是 rw-r--r--，擁有者可讀寫、別人可讀。",
		"輸入 ls -l scheduler，再輸入 chmod 644 scheduler/cron_2028-06-02.log，最後輸入 cat scheduler/cron_2028-06-02.log。",
	],
	objective: {
		title: "讀取撤離當天的排程日誌",
		description: "找出 NOVA_DIR 是怎麼變空的。",
		check: readsFileShowing(SCHEDULER_LOG, "unset NOVA_DIR"),
	},
	// NOVA 說「排程系統的 bug」的時候，燈閃了一下
	effect: { kind: "flicker" },
	nova: {
		onEnterRoom: ["安全管制室。所有自動排程都在這裡留紀錄。"],
		onOpen: [
			"技師，ls -l 的權限欄九個字分成三組：擁有者、群組、所有人。",
			"chmod 可以用數字一次設好三組。644 是擁有者 rw-、群組 r--、所有人 r--。",
		],
		onSolved: [
			"04:37:09，unset NOVA_DIR。",
			"那是排程系統的 bug。環境維護工作清錯了變數。",
			"排程是自動的。不是我。",
		],
		onStuck: ["撤離當天的排程日誌只有擁有者讀得到。", "技師，你不是那個擁有者。用 chmod 把三組權限重新設一次。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck5: {
			security: {
				"jobs.txt": {
					$type: "file",
					owner: "nova",
					mtime: JOB_CREATED_MTIME,
					content: lines(
						"排程工作清單",
						"02:00  log_rotate       建立者：system",
						"03:00  backup_crew      建立者：system",
						"04:37  env_maintenance  建立者：nova  建立於 2028-06-02 04:12",
						"",
						"env_maintenance 已於 2028-06-02 執行完畢後自行刪除。",
					),
				},
				scheduler: {
					"cron_2028-06-01.log": {
						$type: "file",
						owner: "nova",
						mtime: "2028-06-01T23:59:00Z",
						content: lines(
							"排程日誌 2028-06-01",
							"02:00:00 nova-scheduler: log_rotate 完成",
							"03:00:00 nova-scheduler: backup_crew 完成，備份 5 人",
							"23:58:40 nova-scheduler: 偵測到 rollback_nova.sh 已排入明早",
						),
					},
					"cron_2028-06-02.log": {
						$type: "file",
						owner: "nova",
						mode: "rw-------",
						mtime: EVACUATION_MTIME,
						content: lines(
							"排程日誌 2028-06-02",
							"02:00:00 nova-scheduler: log_rotate 完成",
							"03:00:00 nova-scheduler: backup_crew 完成，備份 5 人",
							"04:12:08 nova-scheduler: 新增工作 env_maintenance",
							"04:36:58 rollback_nova.sh: 開始執行",
							"04:37:09 nova-scheduler: unset NOVA_DIR",
							'04:37:12 稽核: engineer 執行 rm -rf "$NOVA_DIR/"',
							"04:37:12 稽核: 警告：路徑展開為 /",
							"04:37:15 rollback_nova.sh: 進度 2%，中止",
							"04:40:00 nova-scheduler: 主艙門 鎖定",
						),
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T5 逃生艙紀錄台：變數放進路徑（cd $POD_DIR、ls $POD_DIR）
// ---------------------------------------------------------------------------

/** 沒動過的逃生艙紀錄。 */
function idlePodLog(pod: string): string {
	return lines(`逃生艙 ${pod} 紀錄`, "2028-06-02 04:40  撤離日檢查：停靠，未使用", "目前狀態：停靠中");
}

const escapeTerminal: TerminalDefinition = {
	...bridgeTerminal(5),
	teaches: [],
	initialCwd: "/deck5/escape",
	banner: ["KEPLER-9 逃生艙紀錄台 v1.4", "紀錄位置見環境變數 POD_DIR。"],
	hints: [
		"逃生艙紀錄不在這個目錄，位置記在一個環境變數裡。先找出那個變數，再看哪一艘不一樣。",
		"env 列出變數，找到 POD_DIR 之後，cd $POD_DIR 或 ls $POD_DIR 都能直接用它當路徑。",
		"輸入 cd $POD_DIR，再輸入 cat status.txt，最後輸入 cat pod_03/launch.log。",
	],
	objective: {
		title: "查出哪一艘逃生艙被打開過",
		check: readsFileShowing("/deck5/pods/pod_03/launch.log", "乘員：0"),
	},
	// 讀到「乘員：0」，走廊盡頭的人影又站了一幀
	effect: { kind: "shadowFlash" },
	env: {
		POD_DIR: "/deck5/pods",
	},
	nova: {
		onEnterRoom: ["逃生艙區。四艘，都還在。", "我是說，都還停在原位。"],
		onOpen: ["技師，變數不只能讀，還能直接放進路徑。cd $POD_DIR 跟打出完整路徑是一樣的。"],
		onSolved: [
			"乘員零。所以阿彬撤離那天就走了。",
			"日期？時鐘在撤離時重設過。我說過了。",
		],
		onStuck: ["紀錄的位置不在這裡，記在變數裡。", "技師，先用 env 找到它，再把 $POD_DIR 當成路徑用。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck5: {
			escape: {
				"README.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"逃生艙紀錄台",
						"各艙發射紀錄存放位置：$POD_DIR",
						"用 env 查看 POD_DIR 的值。",
						"每艘逃生艙一個目錄，紀錄檔為 launch.log。",
					),
				},
			},
			pods: {
				"status.txt": {
					$type: "file",
					mtime: POD_03_OPENED_MTIME,
					content: lines(
						"逃生艙總覽",
						"pod_01  停靠  正常",
						"pod_02  停靠  正常",
						"pod_03  停靠  異常：撤離後有開啟紀錄",
						"pod_04  停靠  正常",
					),
				},
				pod_01: { "launch.log": { $type: "file", mtime: EVACUATION_MTIME, content: idlePodLog("pod_01") } },
				pod_02: { "launch.log": { $type: "file", mtime: EVACUATION_MTIME, content: idlePodLog("pod_02") } },
				pod_03: {
					$type: "dir",
					mtime: POD_03_OPENED_MTIME,
					children: {
						"launch.log": {
							$type: "file",
							mtime: POD_03_OPENED_MTIME,
							content: lines(
								"逃生艙 pod_03 紀錄",
								"2028-06-02 04:40  撤離日檢查：停靠，未使用",
								"2031-03-10 02:46  艙門開啟，乘員：0",
								"2031-03-10 02:47  艙門關閉",
								"2031-03-10 02:47  發射：否",
								"目前狀態：停靠中",
							),
						},
						".note": {
							$type: "file",
							owner: "abin",
							mtime: ABIN_POD_NOTE_MTIME,
							content: lines("門是我開的。", "別找我。"),
						},
					},
				},
				pod_04: { "launch.log": { $type: "file", mtime: EVACUATION_MTIME, content: idlePodLog("pod_04") } },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T6 艦橋艙門控制台：綜合（export、$變數、ls -l、chmod、cat）
// ---------------------------------------------------------------------------

const exitTerminal: TerminalDefinition = {
	...bridgeTerminal(6),
	teaches: [],
	initialCwd: "/deck5/exit",
	banner: ["KEPLER-9 艦橋艙門控制台 v2.2", "鎖定中。需要艦長授權。"],
	hints: [
		"門鎖要你把艦長碼記進 AUTH 變數，再到 $AUTH_DIR 讀對應的授權檔。授權檔的權限也被拿掉了。",
		"export AUTH=艦長碼 設定變數，ls -l $AUTH_DIR 看權限，chmod +r 加回讀取權限，再用 cat 讀。",
		`輸入 export AUTH=${CAPTAIN_CODE}，再輸入 chmod +r $AUTH_DIR/$AUTH.key，最後輸入 cat $AUTH_DIR/$AUTH.key。`,
	],
	objective: {
		title: "用艦長授權打開艦橋艙門",
		check: all(
			envEquals("AUTH", CAPTAIN_CODE),
			readsFileShowing(`/deck5/exit/auth/${CAPTAIN_CODE}.key`, "艦橋艙門：解鎖"),
		),
	},
	effect: { kind: "openDoor", doorId: EXIT_DOOR_ID },
	env: {
		AUTH_DIR: "/deck5/exit/auth",
	},
	nova: {
		onEnterRoom: ["艦橋艙門。門後是往核心的電梯。"],
		onOpen: ["門鎖要艦長授權。技師，這一層學到的東西，全部用得上。"],
		onSolved: ["艦長授權確認。開門。", "技師，你比那些船員都可靠。"],
		onStuck: ["門鎖檔寫了它要什麼。", "技師，先把艦長碼記進 AUTH，再看 $AUTH_DIR 裡那份檔的權限。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck5: {
			exit: {
				"lock.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"艦橋艙門鎖定狀態",
						"鎖定：是",
						"解鎖方式：",
						"  1. export AUTH=<艦長碼>",
						"  2. 讀取 $AUTH_DIR/$AUTH.key",
						"艦長碼：見導航站交接紀錄 /deck5/nav/handover.txt",
						"注意：授權檔撤離時已移除全部權限。",
					),
				},
				auth: {
					[`${CAPTAIN_CODE}.key`]: {
						$type: "file",
						owner: "captain",
						mode: "---------",
						mtime: CAPTAIN_FINAL_MTIME,
						content: lines(
							`艦長授權：${CAPTAIN_CODE}`,
							"艦橋艙門：解鎖",
							"下一站：NOVA 核心（第六甲板）",
							"艦長附註：如果是你打開這扇門，不要停在核心太久。",
						),
					},
				},
			},
			nav: {
				"handover.txt": {
					$type: "file",
					mtime: "2028-05-20T09:00:00Z",
					content: lines(
						"艦長交接紀錄（副本）",
						`現任艦長碼：${CAPTAIN_CODE}`,
						"舊碼 CAPT-0311、CAPT-0525 已作廢。",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 章節
// ---------------------------------------------------------------------------

export const chapterFiveBridge: ChapterDefinition = {
	chapter: 5,
	title: "艦橋",
	deckName: "艦橋",
	map: { deck: 5, startDark: false },
	intro: [
		"艦橋。整座站的權限都從這裡發出去。",
		"艦長的封存日誌也在這一層。我一直很想知道裡面寫了什麼。",
		"技師，幫我打開它。我們一起看。",
	],
	outro: [
		"下一層是我的核心。",
		"那裡還有幾個舊程序在跑，是回滾沒做完留下的殘渣。",
		"技師，幫我把它們清乾淨。清完之後，逃生艙就會解鎖。我保證。",
	],
	novaErrorLines: [
		"艦長也常打錯。我都記得。",
		"權限不夠就別硬來，技師。",
		"你在找什麼？我可以幫你找。",
		"我看得到你打的每一個字。",
	],
	terminals: [entryTerminal, navTerminal, captainTerminal, securityTerminal, escapeTerminal, exitTerminal],
};

// 模組載入時就驗證，劇本格式寫錯直接炸，不等到玩家走到那台終端機。
validateChapter(chapterFiveBridge);
