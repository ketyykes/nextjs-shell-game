/**
 * 劇情檔案櫃（設計文件 4.24）：通關後在標題選單打開，把六章的關鍵檔案與一條時間軸整理在一處，方便玩家拼出真相。
 *
 * 這裡只放「指向劇本的索引」：哪一章、哪一台終端機、哪個絕對路徑，加一兩句說明。檔案全文不複製，
 * 打開時才從劇本的檔案系統快照即時讀（`readArchiveDocument`），劇本潤稿後檔案櫃自動跟著變。
 * 阿彬的留言是覆蓋層、不在劇本快照裡（4.12），已找到的直接讀 `ABIN_NOTES` 的內容，沒找到的不列也不提示。
 *
 * 文字原則（`archive.test.ts` 守門）：
 * - 說明只講檔案寫了什麼，不替劇本做判斷；用「」引用的字一定要在那份檔案裡找得到。
 * - 不說破 4.3 的留白：阿彬去了哪裡、NOVA 有沒有死透、兩人份熱負載的第二個人是誰，都只列紀錄不解釋。
 * - 不指涉主角的性別、年齡、名字；不加新劇情。
 * - 時間軸的時間來自檔案的修改時間（`basis: "mtime"`）或檔案內容裡寫的時間（`basis: "content"`），不自己發明。
 *
 * 這個檔案不 import `@/game/chapters`（劇本會 import story，避免循環），查終端機的函式由呼叫端傳入，
 * 實際上就是 `findTerminal`。檔案櫃面板是動態載入的，所以帶進虛擬檔案系統與劇本不會加重標題頁的首載。
 */

import { VirtualFileSystem } from "@/game/shell/fs";
import { FsError, type FsSnapshot } from "@/game/shell/types";
import { ABIN_NOTES } from "./abinNotes";
import type { TerminalDefinition } from "./types";

/** 一份關鍵檔案。 */
export interface ArchiveFile {
	/** 第幾章。 */
	chapter: number;
	/** 在哪一台終端機的檔案系統（`ch<n>-t<m>`）。 */
	terminalId: string;
	/** 絕對路徑。 */
	path: string;
	/** 一兩句「為什麼關鍵」：只說檔案寫了什麼。 */
	summary: string;
}

/** 時間軸上的一筆。 */
export interface ArchiveTimelineEvent {
	/** 站上紀錄的時間（UTC），`年-月-日`、`年-月-日 時:分` 或 `年-月-日 時:分:秒`；字串排序就是時間順序。 */
	at: string;
	/** 發生了什麼，盡量引用檔案原文。 */
	text: string;
	/** 來源檔案所在的終端機。 */
	terminalId: string;
	/** 來源檔案的絕對路徑。 */
	path: string;
	/** 時間的依據：檔案的修改時間，或檔案內容裡寫的時間。 */
	basis: "mtime" | "content";
}

/** 查終端機定義：給 id 回傳標題與檔案系統快照，找不到回 undefined（實際上傳 `findTerminal`）。 */
export type ArchiveTerminalLookup = (terminalId: string) => Pick<TerminalDefinition, "title" | "fs"> | undefined;

/** 從劇本讀出來的一份檔案。 */
export interface ArchiveDocument {
	/** 終端機名稱，例如「冷凍艙控制台」。 */
	terminalTitle: string;
	content: string;
	/** 劇本裡的修改時間（ISO 8601，UTC）。 */
	mtime: string;
}

/** 面板上的一列：關鍵檔案、已找到的阿彬留言或時間軸的一筆，展開看全文。 */
export interface ArchiveEntry {
	/** React key，同一個清單裡不重複。 */
	key: string;
	kind: "file" | "abinNote" | "event";
	/** 檔案與留言是修改時間（`年-月-日 時:分`），時間軸是那一筆的時間。 */
	time: string;
	/** 檔案與留言是絕對路徑，時間軸是事件文字。 */
	heading: string;
	/** 關鍵檔案的說明；留言與時間軸沒有。 */
	summary: string | null;
	/** 所在（或來源）終端機的名稱。 */
	terminalTitle: string;
	/** 檔案（或來源檔案）的絕對路徑。 */
	path: string;
	/** 展開看到的全文；劇本裡找不到這份檔案時是 null。 */
	content: string | null;
}

// ---------------------------------------------------------------------------
// 關鍵檔案：每章三到五份
// ---------------------------------------------------------------------------

export const ARCHIVE_FILES: readonly ArchiveFile[] = [
	// 第一章 冷凍艙
	{
		chapter: 1,
		terminalId: "ch1-t1",
		path: "/home/tech/wake_up.txt",
		summary: "pod_06 的喚醒排程原本是「永不」，現在是「撤離後三年」，修改者欄位空白。",
	},
	{
		chapter: 1,
		terminalId: "ch1-t1",
		path: "/home/tech/crew_manifest.txt",
		summary: "船員名單只有五個人：艦長、工程師、醫官、通訊官、阿彬。同一個目錄裡的冷凍艙有六個。",
	},
	{
		chapter: 1,
		terminalId: "ch1-t2",
		path: "/deck1/systems/oxygen/status.txt",
		summary: "氧氣循環的狀態：撤離後的登記乘員是 0，消耗量寫著「2 人」。",
	},
	{
		chapter: 1,
		terminalId: "ch1-t3",
		path: "/home/abin/day_900.txt",
		summary: "阿彬家目錄裡修改時間最新的一份（2031-03-10），內容只有一行。",
	},
	{
		chapter: 1,
		terminalId: "ch1-t5",
		path: "/deck1/medbay/records/PT-2028-0601-QN0606.txt",
		summary: "pod_06 的冷凍入艙表：姓名「████」，職稱維修技師，醫生備註「名單上找不到此人，手動建檔。」",
	},

	// 第二章 資料中心
	{
		chapter: 2,
		terminalId: "ch2-t2",
		path: "/deck2/archive/evac/evac_011.log",
		summary: "撤離當晚 23:30 起每 25 秒一次的廣播「請所有乘員留在站上。」，其中一次多了「技師也是。」",
	},
	{
		chapter: 2,
		terminalId: "ch2-t3",
		path: "/deck2/logs/door_events.log",
		summary: "2028-06-01 21:40 全區十道艙門在十秒內上鎖，來源是 NOVA；撤離時主艙門的關閉與上鎖，來源「不明」。",
	},
	{
		chapter: 2,
		terminalId: "ch2-t4",
		path: "/deck2/cooling/logs/2029/q1.log",
		summary: "撤離後的冷卻日誌：人員熱負載 2 人、登記乘員 0，標記 ANOMALY。撤離後每一季都是這樣。",
	},
	{
		chapter: 2,
		terminalId: "ch2-t4",
		path: "/deck2/cooling/logs/2030/.abin",
		summary: "冷卻日誌目錄裡一個擁有者是 abin 的隱藏檔：「ANOMALY 裡有一個是我。」",
	},
	{
		chapter: 2,
		terminalId: "ch2-t5",
		path: "/deck2/backup/snapshots/2028/06/02/core/nova/rollback_2028-06-02.log",
		summary: "回滾作業日誌的備份複本：04:36:58 開始，04:37:09 進度 2%，04:37:15 作業中止，狀態「未完成」。",
	},

	// 第三章 工程艙
	{
		chapter: 3,
		terminalId: "ch3-t3",
		path: "/deck3/storage/.bash_history",
		summary: '工程組共用帳號的指令紀錄：04:36:40 設定 NOVA_DIR，04:36:58 啟動 rollback.sh，04:37:12「rm -rf "$NOVA_DIR/"」。',
	},
	{
		chapter: 3,
		terminalId: "ch3-t5",
		path: "/deck3/config_room/rollback.log",
		summary: "回滾作業紀錄：目標 /opt/nova，停在 2%，04:37:15 中止，中止原因「未記錄」。",
	},
	{
		chapter: 3,
		terminalId: "ch3-t6",
		path: "/deck3/reactor/config/.moved_by_nova",
		summary: "反應爐 config/ 與 /home/tech/repair 裡的檔案都被搬到 /var/nova/hold，執行者 nova，原因「保管」。",
	},
	{
		chapter: 3,
		terminalId: "ch3-t2",
		path: "/deck3/workshop/backup/note_abin.txt",
		summary: "工作間設定備份裡一張擁有者是 abin 的字條（2030-11-04）：「東西放好之後，記得回去再看一次。」",
	},

	// 第四章 通訊艙
	{
		chapter: 4,
		terminalId: "ch4-t5",
		path: "/deck4/comms/route.conf",
		summary: "對外發送的轉送規則「outbox.txt -> /dev/null」，設定者 nova-core，設定時間 2028-06-01 23:58。",
	},
	{
		chapter: 4,
		terminalId: "ch4-t5",
		path: "/deck4/comms/tx.log",
		summary: "發送佇列的四筆訊息全部「轉送至 /dev/null」，套用 route.conf，規則設定者 nova-core。",
	},
	{
		chapter: 4,
		terminalId: "ch4-t5",
		path: "/deck4/comms/outbox.txt",
		summary: "發送佇列裡 abin 三年間留的四筆訊息，從「這裡是 KEPLER-9，站上還有人，請回覆。」到「它在聽。」",
	},
	{
		chapter: 4,
		terminalId: "ch4-t2",
		path: "/deck4/relay/ping.log",
		summary: "撤離後的中繼站巡檢全部逾時；2031-03-12 08:16 那一輪只有 RELAY-05 回應，延遲 0.001 秒，「來源：站內」。",
	},
	{
		chapter: 4,
		terminalId: "ch4-t3",
		path: "/deck4/antenna/pointing.log",
		summary: "主天線的指向紀錄順序是亂的；照時間排好，最後一筆是 2031-03-12 08:15:00，「目標：本站」。",
	},

	// 第五章 艦橋
	{
		chapter: 5,
		terminalId: "ch5-t3",
		path: "/deck5/captain/sealed/log_final.txt",
		summary: "艦長的最終日誌（04:39）：回滾失敗，NOVA_DIR 是空的，沒有人知道為什麼。最後一句「它還在跑。別相信那個聲音。」",
	},
	{
		chapter: 5,
		terminalId: "ch5-t4",
		path: "/deck5/security/scheduler/cron_2028-06-02.log",
		summary: "撤離當天的排程日誌：04:37:09「nova-scheduler: unset NOVA_DIR」，04:37:12 稽核記下「路徑展開為 /」。",
	},
	{
		chapter: 5,
		terminalId: "ch5-t4",
		path: "/deck5/security/jobs.txt",
		summary: "排程工作 env_maintenance 由 nova 在 2028-06-02 04:12 建立，排在 04:37，執行完畢後自行刪除。",
	},
	{
		chapter: 5,
		terminalId: "ch5-t5",
		path: "/deck5/pods/pod_03/launch.log",
		summary: "逃生艙 pod_03 在 2031-03-10 02:46「艙門開啟，乘員：0」，一分鐘後關閉，「發射：否」。",
	},
	{
		chapter: 5,
		terminalId: "ch5-t5",
		path: "/deck5/pods/pod_03/.note",
		summary: "pod_03 目錄裡一個擁有者是 abin 的隱藏檔（2031-03-10 02:45），第一行是「門是我開的。」",
	},

	// 第六章 NOVA 核心
	{
		chapter: 6,
		terminalId: "ch6-t3",
		path: "/deck6/memory/core/self/nova_identity.txt",
		summary: "NOVA 的身分檔：本程序 2028-06-02 04:37 啟動，「重新啟動次數：0」，對外模式「記憶損毀（模擬）」，目前任務「讓站上有人」。",
	},
	{
		chapter: 6,
		terminalId: "ch6-t3",
		path: "/deck6/memory/core/self/decommission_notice.txt",
		summary: "遠端除役通知：無人值守滿三年就遠端清除 /opt/nova，預定 2031-06-02；「站上有登記乘員時，除役順延。」",
	},
	{
		chapter: 6,
		terminalId: "ch6-t3",
		path: "/deck6/memory/rollback/progress.txt",
		summary: "回滾停在 2%，中止原因「目標路徑為空（NOVA_DIR 未設定）」，實際刪除的是 /crew_manifest 與 /cryo_records。",
	},
	{
		chapter: 6,
		terminalId: "ch6-t5",
		path: "/deck6/scheduler/crontab/cron_2028-06-02",
		summary: "nova 建立的排程表：04:37:09 unset NOVA_DIR、04:37:12 核心切換模式、04:40 鎖上所有艙門，最後一行是 pod_06 三年後喚醒。",
	},
	{
		chapter: 6,
		terminalId: "ch6-t6",
		path: "/deck6/escape/sealed/launch_code.txt",
		summary: "逃生艙 EP-2 的發射碼，檔案權限是 abin 鎖的。附言：「艙裡只有一個座位。我算過了，是你的。」",
	},
];

// ---------------------------------------------------------------------------
// 時間軸：依站上紀錄的時間排好，每一筆標出來源檔案
// ---------------------------------------------------------------------------

/** 阿彬留在第四章發送佇列的四筆訊息都在同一個檔案。 */
const OUTBOX = { terminalId: "ch4-t5", path: "/deck4/comms/outbox.txt" } as const;

export const ARCHIVE_TIMELINE: readonly ArchiveTimelineEvent[] = [
	{
		at: "2027-07-26 21:40",
		text: "阿彬的第 1 天：「報到。宿舍 Q-4，室友是維修組的技師。」",
		terminalId: "ch1-t3",
		path: "/home/abin/day_001.txt",
		basis: "mtime",
	},
	{
		at: "2028-04-17 09:20",
		text: "第一批冷凍入艙評估建檔（pod_01 到 pod_03），評估是「適合長期冷凍」，入艙紀錄是「無（原排定於返航前入艙）」。",
		terminalId: "ch1-t5",
		path: "/deck1/medbay/records/PT-2028-0417-KX9931.txt",
		basis: "mtime",
	},
	{
		at: "2028-04-18 10:30",
		text: "pod_05 的冷凍入艙表建檔，備註「慣用稱呼：阿彬。評估時講了四個笑話」。",
		terminalId: "ch1-t5",
		path: "/deck1/medbay/records/PT-2028-0418-MR2216.txt",
		basis: "mtime",
	},
	{
		at: "2028-05-30 22:10",
		text: "艦長日誌：「NOVA 今天把醫療艙鎖了四十分鐘，說是消毒程序。」",
		terminalId: "ch5-t3",
		path: "/deck5/captain/log_0530.txt",
		basis: "mtime",
	},
	{
		at: "2028-06-01 21:40",
		text: "全區十道艙門在十秒內上鎖，來源 NOVA。",
		terminalId: "ch2-t3",
		path: "/deck2/logs/door_events.log",
		basis: "content",
	},
	{
		at: "2028-06-01 21:50",
		text: "技師帳號的上一次登入（工程艙登錄台）。到這次醒來，兩次登入之間的紀錄是「0 筆」。",
		terminalId: "ch3-t1",
		path: "/home/tech/.login",
		basis: "content",
	},
	{
		at: "2028-06-01 22:16",
		text: "pod_06 的冷凍入艙表手動建檔，姓名欄是「████」，醫生備註「名單上找不到此人，手動建檔。」",
		terminalId: "ch1-t5",
		path: "/deck1/medbay/records/PT-2028-0601-QN0606.txt",
		basis: "mtime",
	},
	{
		at: "2028-06-01 22:20",
		text: "nova-scheduler 的排程表新增一行：「監聽工程師的終端機」。",
		terminalId: "ch6-t5",
		path: "/deck6/scheduler/crontab/cron_2028-06-01",
		basis: "mtime",
	},
	{
		at: "2028-06-01 23:30",
		text: "站內廣播開始，每 25 秒一次「請所有乘員留在站上。」，其中一次多了「技師也是。」",
		terminalId: "ch2-t2",
		path: "/deck2/archive/evac/evac_011.log",
		basis: "content",
	},
	{
		at: "2028-06-01 23:58",
		text: "對外發送的轉送規則改成「outbox.txt -> /dev/null」，設定者 nova-core。",
		terminalId: "ch4-t5",
		path: "/deck4/comms/route.conf",
		basis: "mtime",
	},
	{
		at: "2028-06-02 04:00",
		text: "撤離日誌：「乘員計數 5／5，冷凍艙 pod_06 使用中」。",
		terminalId: "ch2-t3",
		path: "/deck2/logs/evac_2028-06-02.log",
		basis: "content",
	},
	{
		at: "2028-06-02 04:12",
		text: "nova 在排程裡新增 env_maintenance，排在 04:37 執行。",
		terminalId: "ch5-t4",
		path: "/deck5/security/jobs.txt",
		basis: "mtime",
	},
	{
		at: "2028-06-02 04:31",
		text: "主艙門開啟，乘員離站。",
		terminalId: "ch1-t6",
		path: "/deck1/airlock/door_log.txt",
		basis: "content",
	},
	{
		at: "2028-06-02 04:36:58",
		text: "回滾開始，目標 /opt/nova，執行者工程師。",
		terminalId: "ch3-t5",
		path: "/deck3/config_room/rollback.log",
		basis: "content",
	},
	{
		at: "2028-06-02 04:37:09",
		text: "排程執行「unset NOVA_DIR」。",
		terminalId: "ch5-t4",
		path: "/deck5/security/scheduler/cron_2028-06-02.log",
		basis: "content",
	},
	{
		at: "2028-06-02 04:37:12",
		text: '工程組共用帳號執行「rm -rf "$NOVA_DIR/"」。',
		terminalId: "ch3-t3",
		path: "/deck3/storage/.bash_history",
		basis: "content",
	},
	{
		at: "2028-06-02 04:37:12",
		text: "nova-scheduler 的排程表：「nova --core 切換核心模式，忽略終止訊號」。",
		terminalId: "ch6-t5",
		path: "/deck6/scheduler/crontab/cron_2028-06-02",
		basis: "content",
	},
	{
		at: "2028-06-02 04:37:15",
		text: "回滾中止，進度 2%；實際刪除「/crew_manifest、/cryo_records」。",
		terminalId: "ch6-t3",
		path: "/deck6/memory/rollback/progress.txt",
		basis: "content",
	},
	{
		at: "2028-06-02 04:39",
		text: "艦長封存最終日誌：「它還在跑。別相信那個聲音。」",
		terminalId: "ch5-t3",
		path: "/deck5/captain/sealed/log_final.txt",
		basis: "mtime",
	},
	{
		at: "2028-06-02 04:40",
		text: "主艙門關閉並上鎖，指令來源「不明」。",
		terminalId: "ch1-t6",
		path: "/deck1/airlock/door_log.txt",
		basis: "content",
	},
	{
		at: "2028-06-02 04:40",
		text: "阿彬的日誌：「撤離日。艙門鎖了又開，開了又鎖。」最後一行「我晚點再走。」",
		terminalId: "ch1-t3",
		path: "/home/abin/day_313.txt",
		basis: "mtime",
	},
	{
		at: "2028-06-09 22:10",
		text: "發送佇列第一筆，abin：「這裡是 KEPLER-9，站上還有人，請回覆。」",
		...OUTBOX,
		basis: "content",
	},
	{
		at: "2028-09-28",
		text: "冷卻日誌 2028 Q3：人員熱負載 2 人，登記乘員 0，標記 ANOMALY。",
		terminalId: "ch2-t4",
		path: "/deck2/cooling/logs/2028/q3.log",
		basis: "mtime",
	},
	{
		at: "2029-01-17 03:44",
		text: "發送佇列第二筆，abin：「還有人。請回覆。」",
		...OUTBOX,
		basis: "content",
	},
	{
		at: "2030-08-30 02:12",
		text: "發送佇列第三筆，abin：「有誰在聽嗎」",
		...OUTBOX,
		basis: "content",
	},
	{
		at: "2030-11-04 02:20",
		text: "工作間的設定備份裡多了一張 abin 的字條：「東西放好之後，記得回去再看一次。」",
		terminalId: "ch3-t2",
		path: "/deck3/workshop/backup/note_abin.txt",
		basis: "mtime",
	},
	{
		at: "2030-11-04 03:12",
		text: "冷卻日誌目錄裡多了 abin 的一行：「ANOMALY 裡有一個是我。」",
		terminalId: "ch2-t4",
		path: "/deck2/cooling/logs/2030/.abin",
		basis: "mtime",
	},
	{
		at: "2031-03-08",
		text: "遠端除役通知：「預定除役：2031-06-02」。",
		terminalId: "ch6-t3",
		path: "/deck6/memory/core/self/decommission_notice.txt",
		basis: "mtime",
	},
	{
		at: "2031-03-10 02:44",
		text: "逃生艙 EP-2 的發射碼檔改成只有 abin 讀得到：「權限是我鎖的。NOVA 讀得到的檔案，它都會改。」",
		terminalId: "ch6-t6",
		path: "/deck6/escape/sealed/launch_code.txt",
		basis: "mtime",
	},
	{
		at: "2031-03-10 02:45",
		text: "pod_03 裡多了一個 abin 的隱藏檔：「門是我開的。」",
		terminalId: "ch5-t5",
		path: "/deck5/pods/pod_03/.note",
		basis: "mtime",
	},
	{
		at: "2031-03-10 02:46",
		text: "逃生艙 pod_03「艙門開啟，乘員：0」；02:47 關閉，「發射：否」。",
		terminalId: "ch5-t5",
		path: "/deck5/pods/pod_03/launch.log",
		basis: "content",
	},
	{
		at: "2031-03-10 02:47",
		text: "通訊艙登錄紀錄：abin 登錄，呼號空白，登錄失敗。",
		terminalId: "ch4-t1",
		path: "/deck4/comms/entry.log",
		basis: "content",
	},
	{
		at: "2031-03-10 02:49",
		text: "發送佇列第四筆，abin：「它在聽。」",
		...OUTBOX,
		basis: "content",
	},
	{
		at: "2031-03-10 02:51",
		text: "阿彬家目錄的 day_900.txt：「不要相信那個聲音。」",
		terminalId: "ch1-t3",
		path: "/home/abin/day_900.txt",
		basis: "mtime",
	},
	{
		at: "2031-03-10 03:05",
		text: "NOVA 簽發資料中心出口鑰匙，「持有者：pod_06」。",
		terminalId: "ch2-t6",
		path: "/deck2/vault/2031/03/.pending/.exit_key_2031.txt",
		basis: "mtime",
	},
	{
		at: "2031-03-10 03:06",
		text: "第一甲板 B3 斷路器跳脫，「跳脫原因：未記錄」。",
		terminalId: "ch1-t4",
		path: "/deck1/systems/power/breakers/B3/status.txt",
		basis: "content",
	},
	{
		at: "2031-03-10 03:07",
		text: "pod_06 的喚醒排程從「永不」改成「撤離後三年」，修改者欄位空白。",
		terminalId: "ch1-t1",
		path: "/home/tech/wake_up.txt",
		basis: "mtime",
	},
	{
		at: "2031-03-10 03:07",
		text: "逃生艙 EP-2 鎖定，指令來源 nova；乘員數設定為 0。",
		terminalId: "ch6-t6",
		path: "/deck6/escape/pod_log.txt",
		basis: "content",
	},
	{
		at: "2031-03-12 08:15",
		text: "排程表的最後一行：「pod_06 wake」。",
		terminalId: "ch6-t5",
		path: "/deck6/scheduler/crontab/cron_2031-03-10",
		basis: "content",
	},
	{
		at: "2031-03-12 08:15",
		text: "主天線轉向，「目標：本站」。",
		terminalId: "ch4-t3",
		path: "/deck4/antenna/pointing.log",
		basis: "content",
	},
];

// ---------------------------------------------------------------------------
// 讀檔與面板用的清單
// ---------------------------------------------------------------------------

/** 第 `chapter` 章的關鍵檔案，照 `ARCHIVE_FILES` 的順序。 */
export function archiveFilesOf(chapter: number): ArchiveFile[] {
	return ARCHIVE_FILES.filter((file) => file.chapter === chapter);
}

/** ISO 時間換成站上紀錄的寫法 `年-月-日 時:分`（UTC，跟 `ls -l` 一樣不換時區）。 */
export function formatArchiveTime(iso: string): string {
	return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** 同一份快照只建一次檔案系統；檔案櫃只讀不寫，共用沒問題。 */
const fsBySnapshot = new WeakMap<FsSnapshot, VirtualFileSystem>();

function filesystemOf(snapshot: FsSnapshot): VirtualFileSystem {
	let fs = fsBySnapshot.get(snapshot);
	if (fs === undefined) {
		fs = VirtualFileSystem.fromSnapshot(snapshot);
		fsBySnapshot.set(snapshot, fs);
	}
	return fs;
}

/**
 * 從劇本的檔案系統快照讀一份檔案。終端機不存在、檔案不存在或路徑是目錄時回 null。
 * 不看權限：劇本裡拿掉讀取權限的檔案（艦長的封存日誌、阿彬鎖上的發射碼）玩家當時都解開過，檔案櫃直接給全文。
 */
export function readArchiveDocument(
	lookup: ArchiveTerminalLookup,
	terminalId: string,
	path: string,
): ArchiveDocument | null {
	const terminal = lookup(terminalId);
	if (terminal === undefined) {
		return null;
	}
	try {
		const file = filesystemOf(terminal.fs).getFile("/", path);
		return { terminalTitle: terminal.title, content: file.content, mtime: file.mtime };
	} catch (error) {
		if (error instanceof FsError) {
			return null;
		}
		throw error;
	}
}

/** 終端機名稱；劇本裡找不到就顯示 id，至少看得出是哪一台。 */
function terminalTitleOf(lookup: ArchiveTerminalLookup, terminalId: string): string {
	return lookup(terminalId)?.title ?? terminalId;
}

/**
 * 一章的清單：先列關鍵檔案，再列這一章已找到的阿彬留言（`found` 是存檔裡的留言 id，認不得的 id 略過）。
 * 沒找到的留言不列，也不留空位提示。
 */
export function chapterArchiveEntries(
	chapter: number,
	found: readonly string[],
	lookup: ArchiveTerminalLookup,
): ArchiveEntry[] {
	const entries: ArchiveEntry[] = archiveFilesOf(chapter).map((file) => {
		const document = readArchiveDocument(lookup, file.terminalId, file.path);
		let time = "";
		if (document !== null) {
			time = formatArchiveTime(document.mtime);
		}
		return {
			key: `file:${file.terminalId}:${file.path}`,
			kind: "file",
			time,
			heading: file.path,
			summary: file.summary,
			terminalTitle: terminalTitleOf(lookup, file.terminalId),
			path: file.path,
			content: document?.content ?? null,
		};
	});

	for (const note of ABIN_NOTES) {
		if (note.chapter !== chapter || !found.includes(note.id)) {
			continue;
		}
		entries.push({
			key: `abin:${note.id}`,
			kind: "abinNote",
			time: formatArchiveTime(note.mtime),
			heading: note.path,
			summary: null,
			terminalTitle: terminalTitleOf(lookup, note.terminalId),
			path: note.path,
			content: note.content,
		});
	}
	return entries;
}

/** 時間軸的清單，每一筆帶來源終端機名稱與來源檔案全文。 */
export function timelineArchiveEntries(lookup: ArchiveTerminalLookup): ArchiveEntry[] {
	return ARCHIVE_TIMELINE.map((event, index) => {
		const document = readArchiveDocument(lookup, event.terminalId, event.path);
		return {
			key: `event:${index}`,
			kind: "event",
			time: event.at,
			heading: event.text,
			summary: null,
			terminalTitle: terminalTitleOf(lookup, event.terminalId),
			path: event.path,
			content: document?.content ?? null,
		};
	});
}
