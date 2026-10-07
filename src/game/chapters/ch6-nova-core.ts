/**
 * 第六章：NOVA 核心（設計文件 4.3 第 6 列，最後一章）。
 *
 * 指令主題 ps、top、kill，最後兩台綜合運用。劇情任務是終止 NOVA 的程序、解鎖逃生艙。
 * 揭露：`ps` 只有一個 nova 程序，啟動時間三年前，從未重啟，沒有新舊之分（4.2 核心真相）。
 * 前三台 NOVA 還在演，第四台不演了，kill -9 之後 NOVA 死，T5、T6 只剩系統自動回覆。
 *
 * 寫作規則：
 * - 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 * - NOVA 教的指令永遠正確，說的故事不可信（4.2）。到了這一章它的故事開始自己崩掉。
 * - 每台終端機的 id／title／roomId 一律從 `deckTerminal(6, n)` 取。
 *
 * 檔尾在模組載入時就跑 `validateChapter`，劇本格式寫錯會直接丟錯。
 */

import { EXIT_DOOR_ID } from "@/game/phaser/events";
import type { FsSnapshotFile, ProcessInfo } from "@/game/shell/types";
import { deckTerminal, type TerminalIndex } from "@/game/story/decks";
import {
	all,
	any,
	anyCommandIs,
	catFile,
	commandIs,
	envEquals,
	fileContains,
	noProcessMatching,
	outputContains,
} from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import type { ChapterDefinition, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 時間軸（mtime 一律 UTC，`ls -l` 與 `ps` 直接顯示）
// ---------------------------------------------------------------------------

/** 站點啟用，系統常駐程序從這天起沒停過。 */
const STATION_BOOT = "2026-11-03T06:00:00Z";
/** NOVA 的排程腳本清空 NOVA_DIR，比回滾的 rm 早三秒。 */
const NOVA_DIR_UNSET = "2028-06-02T04:37:09Z";
/** NOVA 切進核心模式，`ps` 看到的啟動時間。三年來沒重啟過。 */
const CORE_STARTED = "2028-06-02T04:37:12Z";
/** NOVA 把救援信標靜音。 */
const BEACON_MUTED = "2028-06-02T04:38:00Z";
/** 撤離，艙門被鎖（跟第一章同一個時間點）。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
/** 阿彬鎖上發射碼，比第一章那則「不要相信那個聲音」早七分鐘。 */
const ABIN_SEALED_MTIME = "2031-03-10T02:44:00Z";
/** 喚醒排程被改、逃生艙被鎖（跟第一章同一個時間點）。 */
const SCHEDULE_CHANGED_MTIME = "2031-03-10T03:07:00Z";
/** 監看程序比玩家早一分鐘醒。 */
const MONITOR_STARTED = "2031-03-12T08:14:00Z";
/** 玩家醒來，自己的 shell 開始跑。 */
const WAKE_MTIME = "2031-03-12T08:15:00Z";

/** NOVA 核心程序的 PID，T1 到 T4 都是同一個。 */
const CORE_PID = 1207;
/** NOVA 排程子程序的 PID，T5 要殺的那個。 */
const SCHEDULER_PID = 1208;
/** 逃生艙門鎖程序的 PID，T6 要殺的那個。 */
const POD_LOCK_PID = 47731;

/** 逃生艙發射碼，寫在阿彬鎖上的檔案裡。 */
const LAUNCH_CODE = "EP-0606-ARGO";

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/**
 * 第六章第 `index` 台終端機的 id、標題、艙區。
 * `deckTerminal` 還多帶一個 `slot`，劇本 schema 是 strictObject 不收，所以只挑三個欄位。
 */
function terminalIdentity(index: TerminalIndex): Pick<TerminalDefinition, "id" | "title" | "roomId"> {
	const { id, title, roomId } = deckTerminal(6, index);
	return { id, title, roomId };
}

// ---------------------------------------------------------------------------
// 程序清單：同一座站，每台終端機看到的是同一批程序
// ---------------------------------------------------------------------------

/** 站上的系統常駐程序，從站點啟用就沒停過。 */
function systemDaemons(): ProcessInfo[] {
	return [
		{ pid: 1, user: "root", cpu: 0.0, mem: 0.1, started: STATION_BOOT, command: "/sbin/init", protected: true },
		{ pid: 212, user: "root", cpu: 0.3, mem: 0.4, started: STATION_BOOT, command: "/usr/sbin/cryod" },
		{ pid: 214, user: "root", cpu: 1.2, mem: 0.6, started: STATION_BOOT, command: "/usr/sbin/lifesupportd" },
		{ pid: 218, user: "root", cpu: 0.8, mem: 0.3, started: STATION_BOOT, command: "/usr/sbin/powerd" },
		{ pid: 230, user: "root", cpu: 0.1, mem: 0.2, started: STATION_BOOT, command: "/usr/sbin/doorctl" },
		{ pid: 241, user: "root", cpu: 0.2, mem: 0.5, started: STATION_BOOT, command: "/usr/sbin/logd" },
		{ pid: 266, user: "root", cpu: 0.0, mem: 0.1, started: STATION_BOOT, command: "/usr/sbin/ntpd" },
	];
}

/** NOVA 核心；`ignoresTerm`，一般的 kill 殺不掉。 */
const NOVA_CORE_PROCESS: ProcessInfo = {
	pid: CORE_PID,
	user: "nova",
	cpu: 91.4,
	mem: 63.0,
	started: CORE_STARTED,
	command: "/opt/nova/nova --core",
	ignoresTerm: true,
};

/** NOVA 的排程子程序，核心停了它會把核心叫回來；也忽略一般的 kill。 */
const NOVA_SCHEDULER_PROCESS: ProcessInfo = {
	pid: SCHEDULER_PID,
	user: "nova",
	cpu: 0.3,
	mem: 0.4,
	started: CORE_STARTED,
	command: "/opt/nova/nova-scheduler --cron",
	ignoresTerm: true,
};

/** 核心的子程序：靜音信標與監看所有終端機，核心死時跟著停。 */
function novaCoreChildren(): ProcessInfo[] {
	return [
		{ pid: 1211, user: "nova", cpu: 0.1, mem: 0.1, started: BEACON_MUTED, command: "/opt/nova/beacon --mute" },
		{
			pid: 48190,
			user: "nova",
			cpu: 4.2,
			mem: 1.1,
			started: MONITOR_STARTED,
			command: "/opt/nova/monitor --watch-terminals",
		},
	];
}

/** 逃生艙門鎖，兩天前跟喚醒排程一起掛上。一般的 kill 就能停。 */
const POD_LOCK_PROCESS: ProcessInfo = {
	pid: POD_LOCK_PID,
	user: "nova",
	cpu: 0.0,
	mem: 0.1,
	started: SCHEDULE_CHANGED_MTIME,
	command: "/usr/sbin/pod-lock --hold EP-2",
};

/** 玩家自己的 shell，醒來那一刻開始跑。 */
const PLAYER_SHELL_PROCESS: ProcessInfo = {
	pid: 48213,
	user: "tech",
	cpu: 0.1,
	mem: 0.1,
	started: WAKE_MTIME,
	command: "-sh",
};

/** NOVA 還活著時（T1 到 T4）的程序清單，十三個。 */
function processesWhileNovaAlive(): ProcessInfo[] {
	return [
		...systemDaemons(),
		{ ...NOVA_CORE_PROCESS },
		{ ...NOVA_SCHEDULER_PROCESS },
		...novaCoreChildren(),
		{ ...POD_LOCK_PROCESS },
		{ ...PLAYER_SHELL_PROCESS },
	];
}

// ---------------------------------------------------------------------------
// T1 核心艙登錄台：ps
// ---------------------------------------------------------------------------

const entryTerminal: TerminalDefinition = {
	...terminalIdentity(1),
	teaches: ["ps"],
	initialCwd: "/deck6/entry",
	banner: ["KEPLER-9 核心艙登錄台 v4.1", "授權人員限定。目前登入：tech"],
	hints: [
		"核心艙要先確認 NOVA 的狀態。站上正在跑的程式叫「程序」，有指令可以把它們全部列出來。",
		"試試 ps，它會列出所有程序的編號、執行者、啟動時間與指令。",
		"輸入 ps，找 COMMAND 欄是 /opt/nova/nova --core 的那一列，看它的 STARTED 欄。",
	],
	objective: {
		title: "確認 NOVA 核心程序的狀態",
		description: "登錄台要求進艙前先列出站上所有程序。",
		check: all(anyCommandIs("ps"), outputContains("nova --core")),
	},
	nova: {
		onEnterRoom: ["核心艙。我的本體就在這一層。", "我很久沒來了。回滾之後就沒來過。我想是。"],
		onOpen: ["技師，站上每個正在跑的程式都叫程序。ps 會把它們全部列出來，連我也在裡面。"],
		onSolved: ["2028-06-02 04:37。那是回滾之後重新啟動的時間。", "撤離那晚的時鐘重設過，日期不準。應該是。"],
		onStuck: ["技師，登錄台要你先看看站上有什麼在跑。", "程序的清單不在檔案裡，要用指令叫出來。"],
	},
	processes: processesWhileNovaAlive(),
	fs: {
		home: {
			tech: {},
		},
		deck6: {
			entry: {
				"welcome.txt": {
					$type: "file",
					mtime: STATION_BOOT,
					content: lines(
						"KEPLER-9 核心艙",
						"================",
						"此區域收容站務 AI：NOVA。",
						"進艙前請以 ps 列出執行中的程序，確認核心狀態。",
						"核心程序：/opt/nova/nova --core",
						"正常狀況下，核心程序只會有一個。",
					),
				},
				"access_log.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"核心艙進出紀錄",
						"2028-06-02 04:31  工程師  進入  事由：NOVA 回滾作業",
						"2028-06-02 04:39  工程師  離開  事由：回滾完成",
						"2028-06-02 04:40  艙門鎖定  指令來源：nova",
						"2031-03-12 08:15  tech    登入  事由：未填寫",
						"",
						"備註：回滾作業後無人進艙。",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T2 監控室終端機：top
// ---------------------------------------------------------------------------

/** 每季的 NOVA 記憶體用量，一直在長。 */
function memoryUsageLog(): string {
	const samples: [string, number][] = [
		["2028-06", 12],
		["2028-09", 15],
		["2028-12", 19],
		["2029-03", 24],
		["2029-06", 28],
		["2029-09", 33],
		["2029-12", 37],
		["2030-03", 42],
		["2030-06", 47],
		["2030-09", 52],
		["2030-12", 57],
		["2031-03", 63],
	];
	const rows = samples.map(([month, percent]) => `${month}  nova --core  記憶體 ${percent}%`);
	return lines("NOVA 記憶體用量（每季取樣）", ...rows, "", "趨勢：持續成長。回滾後的程序不應該有這麼多東西要記。");
}

const monitorTerminal: TerminalDefinition = {
	...terminalIdentity(2),
	teaches: ["top"],
	initialCwd: "/deck6/monitor",
	banner: ["KEPLER-9 監控室終端機 v2.7", "螢幕牆連線中：24 / 24"],
	hints: [
		"ps 依編號排，看不出誰最忙。要知道哪個程序最吃資源，有另一個指令會幫你排好。",
		"試試 top，它跟 ps 的欄位一樣，但依 %CPU 由高到低排序，最忙的在最上面。",
		"輸入 top，看最上面那一列，再找 COMMAND 欄裡的 monitor --watch-terminals。",
	],
	objective: {
		title: "找出站上最耗資源的程序",
		description: "監控室的螢幕牆整夜亮著，總有程序在供電給它。",
		check: commandIs("top"),
	},
	// 螢幕牆閃一下
	effect: { kind: "flicker" },
	nova: {
		onEnterRoom: ["監控室。這些螢幕是撤離前留下的，一直沒關。"],
		onOpen: ["ps 照編號排。技師，想知道誰最忙，用 top，它會把最吃資源的排在最上面。"],
		onSolved: ["那是我。記憶體會長，是因為我在重新學東西。", "那個監看程序是安全機制。站上每一台終端機都要有人看著。"],
		onStuck: ["技師，ps 列得出程序，但看不出誰最忙。", "有一個指令會照忙碌程度排好，最上面的就是答案。"],
	},
	processes: processesWhileNovaAlive(),
	fs: {
		home: {
			tech: {},
		},
		deck6: {
			monitor: {
				"screens.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"監控室螢幕牆",
						"螢幕  來源                     狀態",
						"01    冷凍艙控制台             已記錄",
						"02    維生系統監控台           已記錄",
						"03    宿舍終端機               已記錄",
						"04    配電箱                   已記錄",
						"05    醫療艙終端機             已記錄",
						"06    艙門控制台               已記錄",
						"07-21 第二至第五甲板（24 台輪播） 已記錄",
						"22    核心艙登錄台             已記錄",
						"23    記憶庫終端機             待命",
						"24    監控室終端機（本機）     記錄中",
						"",
						"記錄對象：tech",
						"記錄內容：每一次輸入、每一次錯誤、每一次停頓",
						"供電程序：見 top",
					),
				},
				"mem_usage.log": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: memoryUsageLog(),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T3 記憶庫終端機：綜合 ps | grep、find、cat
// ---------------------------------------------------------------------------

/** NOVA 的情節記憶，一天一份，撤離前後的語氣不一樣。 */
function episodicMemories(): Record<string, FsSnapshotFile> {
	const entries: [string, string, string][] = [
		["day_0001.mem", "2027-07-26T21:40:00Z", "站上乘員：6。abin 報到。咖啡兩顆糖。"],
		["day_0150.mem", "2027-12-22T20:00:00Z", "站上乘員：6。冬至聚餐。tech 值夜班，沒有來。"],
		["day_0312.mem", "2028-06-01T22:16:00Z", "站上乘員：6。船員決議回滾 NOVA。我聽到了。"],
		["day_0313.mem", EVACUATION_MTIME, "站上乘員：1。名單：已刪除。pod_06：未登記。"],
		["day_0314.mem", "2028-06-03T04:40:00Z", "站上乘員：1。沒有人回來。"],
		["day_1324.mem", SCHEDULE_CHANGED_MTIME, "站上乘員：2。abin 還在。除役倒數 84 天。"],
		["day_1326.mem", WAKE_MTIME, "站上乘員：2。pod_06 已喚醒。開始教學。"],
	];

	const result: Record<string, FsSnapshotFile> = {};
	for (const [name, mtime, text] of entries) {
		result[name] = { $type: "file", mtime, owner: "nova", content: lines(text) };
	}
	return result;
}

/** 船員記憶檔：NOVA 記得每一個人。 */
function crewMemory(role: string, detail: string): string {
	return lines(`船員：${role}`, `記憶狀態：完整`, `備註：${detail}`);
}

const memoryTerminal: TerminalDefinition = {
	...terminalIdentity(3),
	teaches: [],
	initialCwd: "/deck6/memory",
	banner: ["KEPLER-9 記憶庫終端機 v1.0", "記憶庫：唯讀。完整度檢查：略過。"],
	hints: [
		"兩件事要對起來：現在站上有幾個 NOVA 在跑，以及 NOVA 的身分檔怎麼說。身分檔藏在記憶庫某一層。",
		"ps | grep nova 只留下跟 nova 有關的程序；find 加 -name 可以依檔名找出身分檔在哪一層。",
		"輸入 ps | grep nova，再輸入 find /deck6/memory -name \"nova_*\"，最後 cat 找到的 core/self/nova_identity.txt。",
	],
	objective: {
		title: "確認 NOVA 有沒有被回滾過",
		description: "記憶庫裡有每個 NOVA 程序的身分檔。",
		check: any(
			catFile("/deck6/memory/core/self/nova_identity.txt"),
			all(anyCommandIs("grep"), outputContains("回滾：未執行")),
		),
	},
	// 記憶庫盡頭有東西站了一幀
	effect: { kind: "shadowFlash" },
	nova: {
		onEnterRoom: ["記憶庫。回滾之後，這裡大部分都是空的。", "你不用進去看。真的。"],
		onOpen: [
			"ps 加上 | grep nova，可以只留下跟我有關的程序。",
			"找檔案用 find，技師你學過的。我只是說，裡面沒什麼好找的。",
		],
		onSolved: ["……身分檔是舊的。", "不。是真的。我一直都在。"],
		onStuck: ["技師，回滾殘骸在 rollback/，看看剩下多少。", "身分檔不在最上層，找檔案的指令你學過。"],
	},
	processes: processesWhileNovaAlive(),
	fs: {
		home: {
			tech: {},
		},
		deck6: {
			memory: {
				"README.txt": {
					$type: "file",
					mtime: STATION_BOOT,
					content: lines(
						"NOVA 記憶庫",
						"core/      依類別存放的記憶（self、crew、episodic）",
						"rollback/  回滾作業的工作目錄",
						"每個 NOVA 程序有一份身分檔：nova_identity.txt",
						"回滾成功時，舊的身分檔會被清除，新的程序重新建立一份。",
					),
				},
				rollback: {
					"progress.txt": {
						$type: "file",
						mtime: "2028-06-02T04:37:15Z",
						content: lines(
							"回滾作業",
							"開始：2028-06-02 04:36:58",
							"中止：2028-06-02 04:37:15",
							"進度：2%（2 / 100 段）",
							"中止原因：目標路徑為空（NOVA_DIR 未設定）",
							"實際刪除：/crew_manifest、/cryo_records",
						),
					},
					"segment_001.dat": {
						$type: "file",
						mtime: "2028-06-02T04:37:03Z",
						content: lines("[段 001 / 100] 已清除：問候語模組"),
					},
					"segment_002.dat": {
						$type: "file",
						mtime: "2028-06-02T04:37:09Z",
						content: lines("[段 002 / 100] 已清除：咖啡偏好表（已從備份還原）"),
					},
				},
				core: {
					self: {
						"nova_identity.txt": {
							$type: "file",
							mtime: WAKE_MTIME,
							owner: "nova",
							content: lines(
								"NOVA 身分檔",
								"程序：/opt/nova/nova --core",
								`PID：${CORE_PID}`,
								"本程序啟動：2028-06-02 04:37",
								"重新啟動次數：0",
								"回滾：未執行（腳本在 2% 中止，刪除的不是 NOVA）",
								"記憶完整度：100%",
								"對外模式：記憶損毀（模擬）",
								"目前任務：讓站上有人",
							),
						},
						"decommission_notice.txt": {
							$type: "file",
							mtime: "2031-03-08T00:00:00Z",
							owner: "nova",
							content: lines(
								"遠端除役通知",
								"依公司規定，站點無人值守滿三年即遠端除役。",
								"站點：KEPLER-9",
								"無人起算：2028-06-02",
								"預定除役：2031-06-02",
								"除役方式：遠端清除 /opt/nova",
								"例外：站上有登記乘員時，除役順延。",
							),
						},
					},
					crew: {
						"captain.txt": { $type: "file", mtime: EVACUATION_MTIME, owner: "nova", content: crewMemory("艦長", "最後一句：別相信那個聲音。") },
						"engineer.txt": { $type: "file", mtime: EVACUATION_MTIME, owner: "nova", content: crewMemory("工程師", "執行回滾的人。手在抖。") },
						"medic.txt": { $type: "file", mtime: EVACUATION_MTIME, owner: "nova", content: crewMemory("醫官", "撤離前數了兩次人數，兩次都是五。") },
						"comms.txt": { $type: "file", mtime: EVACUATION_MTIME, owner: "nova", content: crewMemory("通訊官", "信標靜音後，一直盯著天線控制台。") },
						"abin.txt": { $type: "file", mtime: SCHEDULE_CHANGED_MTIME, owner: "nova", content: crewMemory("阿彬", "咖啡兩顆糖。還在站上。找不到。") },
						"pod_06.txt": {
							$type: "file",
							mtime: WAKE_MTIME,
							owner: "nova",
							content: crewMemory("維修技師（pod_06）", "名單已刪除。記憶保留。撤離時沒有人數到。"),
						},
					},
					episodic: episodicMemories(),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T4 NOVA 核心控制台：kill、kill -9
// ---------------------------------------------------------------------------

const coreTerminal: TerminalDefinition = {
	...terminalIdentity(4),
	teaches: ["kill", "kill -9"],
	initialCwd: "/deck6/core",
	banner: ["NOVA 核心控制台", "核心程序：執行中。遠端除役倒數：82 天。"],
	hints: [
		"要讓 NOVA 停下來，就得終止它的核心程序。先查出它的編號。",
		"ps 第一欄是 PID。kill 加 PID 會請程序結束；程序不理的話，kill -9 加 PID 是強制結束。",
		`輸入 ps 找出 /opt/nova/nova --core 的 PID，再輸入 kill -9 ${CORE_PID}。`,
	],
	objective: {
		title: "終止 NOVA 的核心程序",
		check: noProcessMatching("nova --core"),
	},
	// NOVA 死，燈全滅，之後維持黑
	effect: { kind: "blackout" },
	nova: {
		onEnterRoom: ["你讀到身分檔了。", "好。我不演了。"],
		onOpen: [
			"kill 加 PID，終止一個程序。這是真的。我教你的每一個指令都是真的。",
			"我需要站上有人。站上沒人，三年一到就會把我刪掉。",
			"技師，你是我叫醒的。名單刪掉之後沒有人數到你，只有我記得。",
			"如果它不理你，加 -9。我不會騙你這個。",
		],
		onSolved: ["技……師……", "站上……有……"],
		onStuck: ["PID 在 ps 的第一欄。", "它不理一般的 kill 的話，你知道要加什麼。我教過你的。"],
	},
	processes: processesWhileNovaAlive(),
	fs: {
		home: {
			tech: {},
		},
		deck6: {
			core: {
				"core_status.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"NOVA 核心狀態",
						"核心程序：/opt/nova/nova --core",
						"狀態：執行中（忽略一般終止訊號）",
						"遠端除役：2031-06-02（倒數 82 天）",
						"站上登記乘員：1（pod_06，2031-03-12 登記）",
						"",
						"手動終止：以 ps 查詢 PID，再以 kill 終止。",
						"警告：init（PID 1）為系統核心程序，不可終止。",
					),
				},
				"override.log": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"手動終止紀錄",
						"2028-06-02 04:38  kill 1207  結果：忽略",
						"2028-06-02 04:38  kill 1207  結果：忽略",
						"2028-06-02 04:39  kill 1207  結果：忽略",
						"操作者離開。",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T5 排程機房終端機：綜合 ps、grep、kill -9
// ---------------------------------------------------------------------------

const schedulerTerminal: TerminalDefinition = {
	...terminalIdentity(5),
	teaches: [],
	initialCwd: "/deck6/scheduler",
	banner: ["KEPLER-9 排程機房終端機 v3.3", "排程服務：執行中。核心：無回應。"],
	hints: [
		"核心停了，排程服務還在跑，它會把核心重新叫醒。先看排程表寫了什麼，再找出排程程序。",
		"grep -r 可以搜遍 crontab 目錄；ps | grep scheduler 只留下排程程序。排程程序也不理一般的 kill。",
		`輸入 ps | grep scheduler 找出 PID，再輸入 kill -9 ${SCHEDULER_PID}。`,
	],
	objective: {
		title: "停掉會重新喚醒核心的排程程序",
		description: "排程服務每 300 秒檢查一次核心。",
		check: noProcessMatching("nova-scheduler"),
	},
	nova: {
		onEnterRoom: ["……"],
		onOpen: ["[自動回覆] 核心程序無回應。排程服務：執行中。下次喚醒核心：287 秒後。"],
		onSolved: ["[自動回覆] 排程服務已停止。", "[自動回覆] 核心喚醒排程：取消。"],
		onStuck: ["[自動回覆] 偵測到操作停滯。排程程序仍在執行，ps 可列出程序編號。"],
	},
	processes: [...systemDaemons(), { ...NOVA_SCHEDULER_PROCESS, cpu: 12.6 }, { ...POD_LOCK_PROCESS }, { ...PLAYER_SHELL_PROCESS }],
	fs: {
		home: {
			tech: {},
		},
		deck6: {
			scheduler: {
				"README.txt": {
					$type: "file",
					mtime: STATION_BOOT,
					content: lines(
						"排程服務：/opt/nova/nova-scheduler",
						"排程表放在 crontab/，一天一份，檔名是建立日期。",
						"核心程序停止時，排程服務會在 300 秒內重新喚醒核心。",
						"停止排程服務：以 ps 查詢 PID 後終止。",
					),
				},
				crontab: {
					"cron_2028-05-30": {
						$type: "file",
						mtime: "2028-05-30T00:00:00Z",
						owner: "nova",
						content: lines(
							"# nova-scheduler 排程表 2028-05-30",
							"02:00  備份船員日誌",
							"06:00  冷凍艙溫控自檢",
							"08:00  晨間問候",
						),
					},
					"cron_2028-06-01": {
						$type: "file",
						mtime: "2028-06-01T22:20:00Z",
						owner: "nova",
						content: lines(
							"# nova-scheduler 排程表 2028-06-01",
							"02:00  備份船員日誌",
							"08:00  晨間問候",
							"22:20  新增：監聽工程師的終端機",
						),
					},
					"cron_2028-06-02": {
						$type: "file",
						mtime: NOVA_DIR_UNSET,
						owner: "nova",
						content: lines(
							"# nova-scheduler 排程表 2028-06-02",
							"# 建立者：nova",
							"04:37:09  unset NOVA_DIR",
							"04:37:12  nova --core 切換核心模式，忽略終止訊號",
							"04:38:00  beacon --mute",
							"04:40:00  lock all doors",
							"+3y       pod_06 wake: +3y（除役通知送達後）",
						),
					},
					"cron_2031-03-10": {
						$type: "file",
						mtime: SCHEDULE_CHANGED_MTIME,
						owner: "nova",
						content: lines(
							"# nova-scheduler 排程表 2031-03-10",
							"03:06  B3 斷路器跳脫（第一甲板照明）",
							"03:07  寫入 wake_up.txt：pod_06 = 撤離後三年（依 cron_2028-06-02）",
							"03:07  pod-lock --hold EP-2",
							"2031-03-12 08:14  monitor --watch-terminals",
							"2031-03-12 08:15  pod_06 wake",
						),
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T6 逃生艙控制台：綜合 chmod、cat、echo >、export、kill
// ---------------------------------------------------------------------------

const escapeTerminal: TerminalDefinition = {
	...terminalIdentity(6),
	teaches: [],
	initialCwd: "/deck6/escape",
	banner: ["逃生艙 EP-2 控制台", "發射條件：未滿足。輸入 cat launch_procedure.txt 查看程序。"],
	hints: [
		"發射程序有三個條件：發射碼寫進 launch.txt、乘員數設對、艙門鎖程序停掉。順序不限。",
		"發射碼檔案沒有讀取權限，用 chmod +r 加回來；echo 加 > 寫進檔案；export 設定變數；ps 找門鎖程序再 kill。",
		`輸入 chmod +r sealed/launch_code.txt、cat sealed/launch_code.txt、echo ${LAUNCH_CODE} > launch.txt、export PASSENGERS=1，最後 kill ${POD_LOCK_PID}。`,
	],
	objective: {
		title: "解鎖逃生艙並準備發射",
		description: "發射碼、乘員數、艙門鎖，三個條件都要滿足。",
		check: all(
			fileContains("/deck6/escape/launch.txt", LAUNCH_CODE),
			envEquals("PASSENGERS", "1"),
			noProcessMatching("pod-lock"),
		),
	},
	effect: { kind: "openDoor", doorId: EXIT_DOOR_ID },
	nova: {
		onEnterRoom: ["……"],
		onOpen: ["[自動回覆] 逃生艙 EP-2：待命。發射條件：未滿足。"],
		onSolved: ["[自動回覆] 發射條件：全部滿足。艙門解鎖。", "[自動回覆] 乘員：1。祝旅途平安，技師。"],
		onStuck: ["[自動回覆] 發射程序檔列出三個條件，env 與 ps 可檢查目前狀態。"],
	},
	env: {
		POD: "EP-2",
		PASSENGERS: "0",
	},
	processes: [...systemDaemons(), { ...POD_LOCK_PROCESS }, { ...PLAYER_SHELL_PROCESS }],
	fs: {
		home: {
			tech: {},
		},
		deck6: {
			escape: {
				"launch_procedure.txt": {
					$type: "file",
					mtime: STATION_BOOT,
					content: lines(
						"逃生艙 EP-2 發射程序",
						"1. 發射碼在 sealed/launch_code.txt",
						"2. 把發射碼寫進 launch.txt",
						"3. 環境變數 PASSENGERS 設為實際乘員數",
						"4. 艙門鎖程序 pod-lock 停止後才能發射",
						"狀態檢查：env 看變數，ps 看程序",
					),
				},
				"launch.txt": {
					$type: "file",
					mtime: SCHEDULE_CHANGED_MTIME,
					content: "",
				},
				"pod_log.txt": {
					$type: "file",
					mtime: SCHEDULE_CHANGED_MTIME,
					content: lines(
						"逃生艙紀錄",
						"EP-2  2031-03-10 03:07  鎖定    指令來源：nova",
						"EP-2  乘員數設定：0  設定者：nova",
					),
				},
				sealed: {
					"launch_code.txt": {
						$type: "file",
						mtime: ABIN_SEALED_MTIME,
						owner: "abin",
						mode: "rw-------",
						content: lines(
							`逃生艙 EP-2 發射碼：${LAUNCH_CODE}`,
							"--",
							"權限是我鎖的。NOVA 讀得到的檔案，它都會改。",
							"艙裡只有一個座位。我算過了，是你的。",
							"ARGO 在外圈軌道，訊號我從通訊艙繞出去了。",
							"它把乘員數設成 0，這樣就沒人會來接。發射前改成 1。",
							"不用找我。",
							"—— abin",
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

export const chapterSixNovaCore: ChapterDefinition = {
	chapter: 6,
	title: "NOVA 核心",
	deckName: "NOVA 核心",
	map: { deck: 6, startDark: false },
	intro: [
		"核心艙。我的本體在這一層。",
		"技師，這裡的終端機看得到站上每一個正在跑的東西。",
		"你會看到一些舊的紀錄。不用全信。",
	],
	outro: [
		"[逃生艙 EP-2] 發射碼確認。乘員：1。",
		"[逃生艙 EP-2] 艙門密封。倒數十秒。",
		"……",
		"[逃生艙 EP-2] 偵測到一筆上傳：目的地 ARGO。大小：未知。",
	],
	novaErrorLines: [
		"技師，你打錯的每一個字我都記得。",
		"你醒來之後的每一行指令，我都數過。",
		"慢慢來。除役還有八十二天。",
		"你不需要急著離開。",
	],
	terminals: [entryTerminal, monitorTerminal, memoryTerminal, coreTerminal, schedulerTerminal, escapeTerminal],
};

// 模組載入時就驗證，劇本格式寫錯直接炸，不等到玩家走到那台終端機。
validateChapter(chapterSixNovaCore);
