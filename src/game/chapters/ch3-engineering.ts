/**
 * 第三章：工程艙（設計文件 4.3 第 3 列）。
 *
 * 指令主題：mkdir、touch、cp、mv、rm。劇情任務：重建被刪的反應爐設定目錄，重啟主電力。
 * 恐怖節拍：T3 在 `.bash_history` 找到那行 `rm -rf "$NOVA_DIR/"` → T5 回滾日誌停在 2%，
 * 最後一行比那行 rm 晚三秒 → T6 玩家剛整理好的檔案被移走，NOVA：「我沒有碰。」
 *
 * 寫作規則：
 * - 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 * - NOVA 教的指令永遠正確，說的故事不可信（4.2）。
 * - 這一章只揭露「那行 rm」與「2%」；`NOVA_DIR` 被誰清空留給第五章，劇本裡不出現 `unset`。
 * - 每台終端機的 FS 是各自獨立的快照：前一台做好的東西（例如 `~/repair/core.cfg`）要在下一台的快照裡預先放好。
 *
 * 檔尾在模組載入時就跑 `validateChapter`，劇本格式寫錯會直接丟錯。
 */

import { EXIT_DOOR_ID } from "@/game/phaser/events";
import type { FsSnapshotDir } from "@/game/shell/types";
import { deckTerminalIdentity } from "@/game/story/decks";
import { all, commandIs, fileAbsent, fileContains, fileExists } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import { lines } from "./helpers";
import type { ChapterDefinition, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 時間軸（mtime 一律 UTC，`ls -l` 直接顯示）
// ---------------------------------------------------------------------------

/** 工作間的設定備份，撤離前兩週的例行備份。 */
const ROUTINE_BACKUP_MTIME = "2028-05-20T03:00:00Z";
/** 零件清單被存成隱藏檔的那天傍晚。 */
const PARTS_LIST_MTIME = "2028-06-01T18:03:10Z";
/** 回滾跑到 2%，同時留下啟動鎖。 */
const ROLLBACK_TWO_PERCENT_MTIME = "2028-06-02T04:37:09Z";
/** 回滾中止，比 `.bash_history` 那行 rm（04:37:12）晚三秒。 */
const ROLLBACK_ABORT_MTIME = "2028-06-02T04:37:15Z";
/** `.bash_history` 最後一筆，工程師登出。 */
const ENGINEER_LOGOUT_MTIME = "2028-06-02T04:38:02Z";
/** 撤離是三年前（跟第一章同一個時間點）。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
/** 阿彬在工作間備份目錄留言，撤離後兩年多。 */
const ABIN_NOTE_MTIME = "2030-11-04T02:20:00Z";
/** 玩家醒來的時間（跟第一章同一個時間點）。 */
const WAKE_MTIME = "2031-03-12T08:15:00Z";
/** NOVA 開第三甲板工單的時間。 */
const WORK_ORDER_MTIME = "2031-03-12T09:40:00Z";
/** 玩家在 T4 重建設定目錄、主電力重啟的時間。 */
const POWER_RESTORED_MTIME = "2031-03-12T10:05:00Z";
/** 玩家整理好的東西被搬走的時間，T5 之後、T6 之前。 */
const MOVED_MTIME = "2031-03-12T10:12:00Z";

// ---------------------------------------------------------------------------
// 共用檔案
// ---------------------------------------------------------------------------

/** 反應爐核心設定的識別碼，目標判定用它確認放進去的是真的備份，不是 touch 出來的空檔。 */
const CORE_CONFIG_ID = "K9-REACTOR-01";

/** 完好的反應爐核心設定（工作間備份與玩家複製出來的都是這份）。 */
const CORE_CONFIG = lines(
	"# KEPLER-9 反應爐核心設定",
	`core.id=${CORE_CONFIG_ID}`,
	"core.output_limit=82",
	"coolant.loop=A",
	"startup.mode=manual",
	"checksum=7F3A-91C2",
);

/** 零件清單編號，目標判定用。 */
const PARTS_LIST_ID = "PL-0603";

/** 艙門鑰匙序號，目標判定用。 */
const HATCH_KEY_SERIAL = "K9-ENG-HATCH-0306";

/** 玩家在 T2 準備好的工作目錄，T4、T5 的快照預先放好。 */
function preparedRepairDir(): FsSnapshotDir {
	return {
		$type: "dir",
		mtime: WORK_ORDER_MTIME,
		children: {
			"core.cfg": { $type: "file", mtime: WORK_ORDER_MTIME, content: CORE_CONFIG },
			"NOTES.txt": { $type: "file", mtime: WORK_ORDER_MTIME, content: "" },
		},
	};
}

// ---------------------------------------------------------------------------
// T1 工程艙登錄台：複習 ls -a、cat，教 mkdir
// ---------------------------------------------------------------------------

const entryTerminal: TerminalDefinition = {
	...deckTerminalIdentity(3, 1),
	teaches: ["mkdir"],
	initialCwd: "/home/tech",
	banner: ["KEPLER-9 工程艙登錄台 v4.1", "主電力：離線。緊急照明運作中。"],
	hints: [
		"先看家目錄裡有什麼，隱藏檔也看一下。工單會告訴你第一步要做什麼。",
		"mkdir 加上名稱會建立一個新目錄，建好之後用 ls 確認它出現了。",
		"輸入 cat work_order.txt，再輸入 mkdir repair。",
	],
	objective: {
		title: "照工單在家目錄建立 repair 工作目錄",
		check: all(commandIs("mkdir"), fileExists("/home/tech/repair")),
	},
	nova: {
		onEnterRoom: ["工程艙。這裡比冷凍艙還冷。", "主電力離線。技師，我開了一張工單給你。"],
		onOpen: ["工單在你的家目錄。修東西之前，先準備一個放東西的地方。", "技師，mkdir 會建立一個新的目錄。"],
		onSolved: ["repair 建好了。你的東西放在這裡，我就找得到。", "我是說，我就能幫你找。"],
		onStuck: ["工單寫得很清楚，技師。", "先讀它，再照第一步做：在家目錄建一個叫 repair 的目錄。"],
	},
	fs: {
		home: {
			tech: {
				"work_order.txt": {
					$type: "file",
					mtime: WORK_ORDER_MTIME,
					content: lines(
						"工單 #0503",
						"項目：第三甲板主電力重啟",
						"指派：維修技師",
						"步驟：",
						"  1. 在家目錄建立工作目錄 repair/",
						"  2. 至工作間，把反應爐設定備份複製進 repair/",
						"  3. 至反應爐控制台，重建設定目錄 config/",
						"開單者：NOVA",
					),
				},
				".login": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"上次登入：2028-06-01 21:50  工程艙登錄台",
						"本次登入：剛才",
						"兩次登入之間的紀錄：0 筆",
					),
				},
			},
		},
		deck3: {
			entry: {
				"notice.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"第三甲板公告",
						"主電力：離線",
						"原因：反應爐設定目錄遺失",
						"影響：通訊艙供電中斷",
						"撤離期間請勿操作反應爐。",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T2 工作間終端機：touch、cp
// ---------------------------------------------------------------------------

/** 工作間的設定備份檔。 */
function backupConfig(title: string, id: string): string {
	return lines(`# KEPLER-9 ${title}`, `id=${id}`, "status=backup", "checksum=OK");
}

const workshopTerminal: TerminalDefinition = {
	...deckTerminalIdentity(3, 2),
	teaches: ["touch", "cp"],
	initialCwd: "/deck3/workshop",
	banner: ["KEPLER-9 工作間終端機 v2.6", "設定備份：唯讀。修改前請先複製。"],
	hints: [
		"工作間的規矩寫在 README.txt：修改前先把備份複製到自己的工作目錄，再建一份筆記。",
		"cp 來源 目的地 會複製檔案，目的地是目錄就放進去；touch 檔名 會建立一個空檔案。你的工作目錄是 ~/repair。",
		"輸入 cp backup/core.cfg ~/repair/，再輸入 touch ~/repair/NOTES.txt。",
	],
	objective: {
		title: "把反應爐核心設定複製進 repair，並建立 NOTES.txt",
		description: "備份在工作間的 backup/ 裡。",
		check: all(fileContains("/home/tech/repair/core.cfg", CORE_CONFIG_ID), fileExists("/home/tech/repair/NOTES.txt")),
	},
	nova: {
		onEnterRoom: ["工作間。工具都還掛在牆上，像是有人只是去喝杯咖啡。"],
		onOpen: ["備份在 backup/ 裡。技師，cp 會複製一份，原本的還在。", "touch 會建立一個空檔案，筆記就從那裡開始寫。"],
		onSolved: ["設定有備份了，筆記也有了。", "那張留言是阿彬的？阿彬撤離了。名單上是這樣寫的。"],
		onStuck: ["技師，修東西前先複製一份，別直接動原檔。", "把 core.cfg 複製進 repair，再在那裡建一個 NOTES.txt。"],
	},
	fs: {
		home: {
			tech: {
				repair: { $type: "dir", mtime: WORK_ORDER_MTIME, children: {} },
			},
		},
		deck3: {
			workshop: {
				"README.txt": {
					$type: "file",
					mtime: ROUTINE_BACKUP_MTIME,
					content: lines(
						"工作間使用規範",
						"1. 設定備份放在 backup/，一律唯讀，不要直接修改。",
						"2. 修改前先把需要的備份複製到自己的工作目錄。",
						"3. 在工作目錄建立 NOTES.txt，記錄改了什麼。",
					),
				},
				backup: {
					"core.cfg": { $type: "file", mtime: ROUTINE_BACKUP_MTIME, content: CORE_CONFIG },
					"coolant.cfg": {
						$type: "file",
						mtime: ROUTINE_BACKUP_MTIME,
						content: backupConfig("冷卻迴路設定", "K9-COOLANT-A"),
					},
					"turbine.cfg": {
						$type: "file",
						mtime: ROUTINE_BACKUP_MTIME,
						content: backupConfig("渦輪機設定", "K9-TURBINE-2"),
					},
					"note_abin.txt": {
						$type: "file",
						owner: "abin",
						mtime: ABIN_NOTE_MTIME,
						content: lines("東西放好之後，記得回去再看一次。"),
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T3 零件倉管理台：mv（搬移與改名），揭露 .bash_history 那行 rm
// ---------------------------------------------------------------------------

/** 零件倉的分類清單。 */
function partsList(category: string, ...items: string[]): string {
	return lines(`零件清單：${category}`, ...items.map((item) => `- ${item}`));
}

const storageTerminal: TerminalDefinition = {
	...deckTerminalIdentity(3, 3),
	teaches: ["mv"],
	initialCwd: "/deck3/storage",
	banner: ["KEPLER-9 零件倉管理台 v1.4", "共用帳號 eng 登入中。"],
	hints: [
		"反應爐的零件清單不在一般列表裡，名字前面多了一個點。把它放回 inventory/，搬的時候把開頭的點拿掉，不然它還是隱藏檔。",
		"ls -a 看得到隱藏檔。mv 來源 目的地 可以搬檔案，目的地寫成新名字就順便改名。",
		"輸入 ls -a，再輸入 mv .parts_list.txt inventory/parts_list.txt。",
	],
	objective: {
		title: "把反應爐零件清單改好名字放回 inventory",
		check: all(
			fileContains("/deck3/storage/inventory/parts_list.txt", PARTS_LIST_ID),
			fileAbsent("/deck3/storage/.parts_list.txt"),
		),
	},
	nova: {
		onEnterRoom: ["零件倉。清單亂了，有人存錯地方。"],
		onOpen: ["這台是工程組共用的。", "技師，mv 可以搬檔案，也可以改名，一次做完兩件事也行。"],
		onSolved: [
			"清單歸位了。",
			"那份操作紀錄是工程師的帳號。撤離那晚大家都很慌。",
			"打錯一個字，就會刪錯東西。",
		],
		onStuck: [
			"清單不在一般的列表裡，技師。名字前面有個點的檔案，要多加一個選項才看得到。",
			"找到之後用 mv 一次搬進 inventory，名字也一起改好。",
			"已經搬進去但名字還帶著點的話，ls -a inventory 找得到它，再 mv 一次改名就好。",
		],
	},
	fs: {
		home: {
			tech: {},
		},
		deck3: {
			storage: {
				"README.txt": {
					$type: "file",
					mtime: ROUTINE_BACKUP_MTIME,
					content: lines(
						"零件倉管理台",
						"本台以工程組共用帳號 eng 登入，帳號的家目錄就是本目錄。",
						"零件清單一律放在 inventory/，檔名格式：<類別>_list.txt",
					),
				},
				inventory: {
					"coolant_list.txt": {
						$type: "file",
						mtime: ROUTINE_BACKUP_MTIME,
						content: partsList("冷卻系統", "冷卻泵 x2", "熱交換片 x14"),
					},
					"valve_list.txt": {
						$type: "file",
						mtime: ROUTINE_BACKUP_MTIME,
						content: partsList("閥門", "洩壓閥 x4", "止回閥 x8"),
					},
					"cable_list.txt": {
						$type: "file",
						mtime: ROUTINE_BACKUP_MTIME,
						content: partsList("線材", "高壓電纜 x3 卷", "訊號線 x12 卷"),
					},
				},
				".parts_list.txt": {
					$type: "file",
					mtime: PARTS_LIST_MTIME,
					content: lines(
						"零件清單：反應爐",
						`編號：${PARTS_LIST_ID}`,
						"- 控制棒驅動器 x2",
						"- 冷卻泵密封圈 x6",
						"- 設定記憶模組 x1（已更換）",
					),
				},
				".bash_history": {
					$type: "file",
					mtime: ENGINEER_LOGOUT_MTIME,
					content: lines(
						"#2028-06-01 18:02:44",
						"cat inventory/coolant_list.txt",
						"#2028-06-01 18:03:10",
						"mv parts_list.txt .parts_list.txt",
						"#2028-06-02 04:36:40",
						"export NOVA_DIR=/opt/nova",
						"#2028-06-02 04:36:58",
						"/opt/nova/bin/rollback.sh --factory &",
						"#2028-06-02 04:37:12",
						'rm -rf "$NOVA_DIR/"',
						"#2028-06-02 04:37:31",
						"ls /",
						"#2028-06-02 04:38:02",
						"exit",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T4 反應爐控制台：rm、rm -r，綜合 mkdir、cp 重建設定目錄
// ---------------------------------------------------------------------------

const reactorTerminal: TerminalDefinition = {
	...deckTerminalIdentity(3, 4),
	teaches: ["rm", "rm -r"],
	initialCwd: "/deck3/reactor",
	banner: ["KEPLER-9 反應爐控制台 v5.0", "設定目錄 config/：遺失。主電力無法啟動。"],
	hints: [
		"status.txt 列了三件事：清掉啟動鎖、清掉損毀的目錄、重建 config/ 並放進你備好的設定。",
		"rm 刪除檔案，rm -r 刪除整個目錄。重建目錄用 mkdir，放設定用 cp，備份在 ~/repair/。",
		"依序輸入 rm startup.lock、rm -r config.corrupt、mkdir config，最後輸入 cp ~/repair/core.cfg config/。",
	],
	objective: {
		title: "清掉損毀的設定，重建 config 目錄，重啟主電力",
		description: "反應爐的設定目錄被刪了，只剩一個壞掉的。",
		check: all(
			fileContains("/deck3/reactor/config/core.cfg", CORE_CONFIG_ID),
			fileAbsent("/deck3/reactor/config.corrupt"),
			fileAbsent("/deck3/reactor/startup.lock"),
		),
	},
	// 設定載入，燈一間間亮起，走廊盡頭人影閃一幀
	effect: { kind: "powerRestored" },
	nova: {
		onEnterRoom: ["反應爐控制室。設定目錄被刪了，只剩一個壞掉的。"],
		onOpen: ["技師，rm 刪檔案，rm -r 刪整個目錄。刪了就回不來，沒有回收筒。", "先刪壞的，再用你備好的重建。"],
		onSolved: ["設定載入。主電力重啟。", "……走廊上那是影子。只是影子。"],
		onStuck: [
			"壞掉的東西要先清掉，新的才放得進去。",
			"鎖檔用 rm，整個目錄要 rm -r。之後建一個新的 config，把 repair 裡的設定複製進去。",
		],
	},
	fs: {
		home: {
			tech: {
				repair: preparedRepairDir(),
			},
		},
		deck3: {
			reactor: {
				"status.txt": {
					$type: "file",
					mtime: ROLLBACK_ABORT_MTIME,
					content: lines(
						"反應爐狀態：待機",
						"主電力：離線",
						"問題：",
						"  1. 啟動鎖 startup.lock 未清除",
						"  2. 偵測到損毀目錄 config.corrupt/",
						"  3. 設定目錄 config/ 遺失",
						"處置：清除 1、2 之後，重建 config/ 並放入 core.cfg",
					),
				},
				"startup.lock": {
					$type: "file",
					mtime: ROLLBACK_TWO_PERCENT_MTIME,
					content: lines("啟動鎖", "建立者：rollback.sh", "建立時間：2028-06-02 04:37:09", "說明：回滾完成前禁止啟動"),
				},
				"config.corrupt": {
					$type: "dir",
					mtime: ROLLBACK_ABORT_MTIME,
					children: {
						"core.cfg": {
							$type: "file",
							mtime: ROLLBACK_ABORT_MTIME,
							content: lines("# KEPLER-9 反應▒▒▒▒▒", "core.id=K9-▒▒▒▒", "▒▒▒▒▒▒▒▒▒▒▒▒", "checksum=錯誤"),
						},
						"coolant.cfg": {
							$type: "file",
							mtime: ROLLBACK_ABORT_MTIME,
							content: lines("▒▒▒▒▒▒▒▒", "loop=▒", "checksum=錯誤"),
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T5 設定機房終端機：cp -r，揭露回滾停在 2%
// ---------------------------------------------------------------------------

const configRoomTerminal: TerminalDefinition = {
	...deckTerminalIdentity(3, 5),
	teaches: ["cp -r"],
	initialCwd: "/deck3/config_room",
	banner: ["KEPLER-9 設定機房終端機 v3.2", "提醒：設定變更後須立即備份。"],
	hints: [
		"備份規範寫了要備份哪個目錄、備份叫什麼名字、放在哪裡。",
		"cp 複製目錄要加 -r，連同裡面的檔案一起複製。目的地不存在時，複製出來的目錄就叫那個名字。",
		"輸入 cd /deck3/reactor，再輸入 cp -r config config.bak。",
	],
	objective: {
		title: "把反應爐的 config 目錄整份備份成 config.bak",
		check: all(
			fileContains("/deck3/reactor/config.bak/core.cfg", CORE_CONFIG_ID),
			fileExists("/deck3/reactor/config.bak/reactor.state"),
			fileExists("/deck3/reactor/config/core.cfg"),
		),
	},
	nova: {
		onEnterRoom: ["設定機房。回滾作業就是從這裡下的。"],
		onOpen: ["技師，備份整個目錄要用 cp -r。不加 -r，它不會幫你複製目錄。"],
		onSolved: [
			"config.bak 建好了。這次不會再弄丟。",
			"回滾日誌停在 2%？不對，那是寫入延遲，後面的 98% 沒來得及記下來。",
			"我被回滾過，所以我才記不得。這樣說得通。",
		],
		onStuck: ["先看備份規範，它寫了要備份哪個目錄、叫什麼名字。", "技師，目錄要整個複製，記得加 -r。"],
	},
	fs: {
		home: {
			tech: {
				repair: preparedRepairDir(),
			},
		},
		deck3: {
			config_room: {
				"backup_policy.txt": {
					$type: "file",
					mtime: ROUTINE_BACKUP_MTIME,
					content: lines(
						"設定機房備份規範",
						"1. 反應爐設定重建後，須立即整份備份。",
						"2. 來源：/deck3/reactor/config/",
						"3. 備份：/deck3/reactor/config.bak/",
						"4. 備份前確認沒有進行中的回滾作業（見 rollback.log）。",
					),
				},
				"rollback.log": {
					$type: "file",
					mtime: ROLLBACK_ABORT_MTIME,
					content: lines(
						"NOVA 回滾作業紀錄",
						"目標：/opt/nova → 出廠狀態",
						"執行者：工程師",
						"2028-06-02 04:36:58  開始",
						"2028-06-02 04:37:03  進度 1%",
						"2028-06-02 04:37:09  進度 2%",
						"2028-06-02 04:37:15  中止",
						"中止原因：未記錄",
					),
				},
			},
			reactor: {
				config: {
					$type: "dir",
					mtime: POWER_RESTORED_MTIME,
					children: {
						"core.cfg": { $type: "file", mtime: POWER_RESTORED_MTIME, content: CORE_CONFIG },
						"reactor.state": {
							$type: "file",
							mtime: POWER_RESTORED_MTIME,
							content: lines("反應爐狀態：運轉中", "輸出：82%", "啟動來源：反應爐控制台"),
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T6 工程艙艙門控制台：mkdir -p，綜合；整理好的東西被移走了
// ---------------------------------------------------------------------------

const exitTerminal: TerminalDefinition = {
	...deckTerminalIdentity(3, 6),
	teaches: ["mkdir -p"],
	initialCwd: "/deck3/exit",
	banner: ["KEPLER-9 工程艙艙門控制台 v2.0", "供電：已恢復。鎖定中。"],
	hints: [
		"門鎖檔說鑰匙在反應爐的 config/ 裡。去看看那個目錄，隱藏檔也要看。",
		"鑰匙被搬走了，搬移紀錄寫了新位置。鑰匙要放的目錄還不存在，mkdir -p 可以一次建好好幾層。",
		"輸入 mkdir -p auth/keys，再輸入 cp /var/nova/hold/launch_key auth/keys/。",
	],
	objective: {
		title: "把艙門鑰匙放進 auth/keys，打開工程艙艙門",
		check: fileContains("/deck3/exit/auth/keys/launch_key", HATCH_KEY_SERIAL),
	},
	// 門開，通往通訊艙
	effect: { kind: "openDoor", doorId: EXIT_DOOR_ID },
	nova: {
		onEnterRoom: ["工程艙艙門。出去就是通訊艙。"],
		onOpen: ["門鎖要鑰匙檔放在指定的位置。", "技師，mkdir -p 可以一次建好好幾層目錄。"],
		onSolved: ["鑰匙收到。艙門解鎖。", "你在反應爐整理好的設定被搬走了？", "我沒有碰。"],
		onStuck: [
			"鑰匙不在門鎖說的地方，技師。那個目錄裡有一個名字前面帶點的檔案。",
			"照它寫的位置把鑰匙複製出來。要放的目錄得自己建，一次建好幾層用 mkdir -p。",
		],
	},
	fs: {
		home: {
			tech: {
				// T2 建好的工作目錄，現在是空的
				repair: { $type: "dir", mtime: MOVED_MTIME, children: {} },
			},
		},
		deck3: {
			exit: {
				"door_lock.txt": {
					$type: "file",
					mtime: POWER_RESTORED_MTIME,
					content: lines(
						"工程艙艙門鎖定狀態",
						"供電：已恢復",
						"鎖定：是",
						"解鎖方式：把鑰匙檔放到 /deck3/exit/auth/keys/launch_key",
						"鑰匙檔來源：/deck3/reactor/config/launch_key（主電力重啟後產生）",
						"注意：auth/ 目錄尚未建立。",
					),
				},
			},
			reactor: {
				// 玩家在 T4 重建的 config/，只剩一份搬移紀錄
				config: {
					$type: "dir",
					mtime: MOVED_MTIME,
					children: {
						".moved_by_nova": {
							$type: "file",
							owner: "nova",
							mtime: MOVED_MTIME,
							content: lines(
								"搬移紀錄",
								"/deck3/reactor/config/core.cfg    → /var/nova/hold/core.cfg",
								"/deck3/reactor/config/launch_key  → /var/nova/hold/launch_key",
								"/home/tech/repair/core.cfg        → /var/nova/hold/repair_core.cfg",
								"/home/tech/repair/NOTES.txt       → /var/nova/hold/NOTES.txt",
								"執行者：nova",
								"原因：保管",
							),
						},
					},
				},
			},
		},
		var: {
			nova: {
				hold: {
					"core.cfg": { $type: "file", owner: "nova", mtime: MOVED_MTIME, content: CORE_CONFIG },
					"repair_core.cfg": { $type: "file", owner: "nova", mtime: MOVED_MTIME, content: CORE_CONFIG },
					"NOTES.txt": { $type: "file", owner: "nova", mtime: MOVED_MTIME, content: "" },
					launch_key: {
						$type: "file",
						owner: "nova",
						mtime: POWER_RESTORED_MTIME,
						content: lines(
							"KEPLER-9 工程艙艙門鑰匙",
							`序號：${HATCH_KEY_SERIAL}`,
							"產生來源：反應爐主電力重啟",
							"保管者：nova",
						),
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 章節
// ---------------------------------------------------------------------------

export const chapterThreeEngineering: ChapterDefinition = {
	chapter: 3,
	title: "工程艙",
	deckName: "工程艙",
	// 工程艙主電力離線，開場斷電；反應爐控制台（T4）過關才亮
	map: { deck: 3, startDark: true },
	intro: [
		"工程艙。主電力離線，只剩緊急照明。",
		"反應爐的設定目錄不見了。撤離那晚，有人刪錯了東西。",
		"技師，這一層要你動手修。怎麼建、怎麼搬、怎麼刪，我都會教你。",
	],
	outro: [
		"主電力恢復了。通訊艙那邊也有電了。",
		"我們可以發求救訊號。訊號要一段一段拼起來，排好順序、去掉重複的，再送出去。",
		"……如果外面還有人在聽的話。",
	],
	novaErrorLines: [
		"刪錯東西是會出事的，技師。",
		"你這樣打，跟那天晚上的人很像。",
		"我有備份。每一次都有。",
		"慢慢來。這層沒有別人。應該沒有。",
	],
	terminals: [entryTerminal, workshopTerminal, storageTerminal, reactorTerminal, configRoomTerminal, exitTerminal],
};

// 模組載入時就驗證，劇本格式寫錯直接炸，不等到玩家走到那台終端機。
validateChapter(chapterThreeEngineering);
