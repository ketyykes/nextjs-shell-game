/**
 * 救援船 ARGO 的醫療終端機（設計文件 4.23）：片尾之後可玩的尾聲。
 *
 * 一台全螢幕終端機的檔案系統、環境變數、程序清單、帳號與登入紀錄，加上開場的歡迎行與 `hint` 的建議。
 * 檔案系統依存檔的阿彬留言進度組裝（`buildArgoSnapshot`），其餘都是固定的。
 *
 * 時間線（UTC）：劇本裡最晚的時間是 2031-03-12 14:31（第四章回信被 abin 帳號讀取，`abinEvidenceFiles`），
 * 逃生艙在那之後發射，所以救援船的紀錄從 2031-03-12 16:51 收到信標寫起，到 2031-03-14 09:02 喚醒完成、tech 登入。
 *
 * 寫作規則（`argo.test.ts` 守門）：
 * - 只用劇本已經出現的事：逃生艙 EP-2、第六章 outro 那筆「目的地 ARGO、大小未知」的上傳、開場 boot log 的「查無此人」。
 * - 維持 4.3 的兩個留白：不說阿彬去了哪裡；「NOVA 沒死透」只用 `ps` 裡一個殺不掉的 `nova --restore` 暗示，
 *   不解釋、不讓它說話，救援船的文字也不叫玩家「技師」（那是 NOVA 的叫法）。
 * - 不提回滾、名單、冷凍、撤離、除役；不指涉玩家的性別、年齡、名字。
 * - `abin/` 底下的留言內容直接讀 `ABIN_NOTES`，不複製文字。
 */

import type { FsSnapshot, FsSnapshotDir, FsSnapshotFile, LoginLog, ProcessInfo, UserAccount } from "@/game/shell/types";
import { PLAYER_USER } from "@/game/shell/types";
import { ABIN_NOTES, ABIN_OWNER } from "./abinNotes";

/** 存檔裡跟救援船有關的進度：已找到的阿彬留言 id 與第四章的回信（`AbinNotesProgress` 的形狀）。 */
export interface ArgoProgress {
	found: readonly string[];
	reply: string | null;
}

// ---------------------------------------------------------------------------
// 時間線
// ---------------------------------------------------------------------------

/** 救援船這趟航程開機，系統常駐程序從這時候起沒停過。 */
const SHIP_BOOT = "2031-01-08T06:00:00Z";
/** 收到第六章 outro 那筆上傳，`nova --restore` 也從這時候開始跑。 */
const UPLOAD_RECEIVED = "2031-03-12T16:52:00Z";
/** 乘客移入醫療艙，生命徵象監看從這時候開始。 */
const ADMITTED = "2031-03-13T03:40:00Z";
/** 喚醒程序完成，tech 從 pts/0 登入。 */
const WAKE_COMPLETE = "2031-03-14T09:02:00Z";
/** 第四章回信寫入的時間（第五章稽核紀錄：tech 14:26 寫入）。 */
const REPLY_WRITTEN = "2031-03-12T14:26:00Z";

// ---------------------------------------------------------------------------
// 檔案系統
// ---------------------------------------------------------------------------

/** 上傳解壓縮出來的地方。 */
export const ARGO_UPLOAD_DIR = "/mnt/upload/kepler9";

/** 認得出阿彬留言的那個資料夾，內容依存檔的進度組裝。 */
export const ARGO_ABIN_DIR = `${ARGO_UPLOAD_DIR}/abin`;

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/** 帶 mtime 與擁有者的檔案。 */
function file(content: string, mtime: string, owner: string): FsSnapshotFile {
	return { $type: "file", content, mtime, owner };
}

/** 帶 mtime 與擁有者的目錄；沒寫的話快照會用站上的預設值（tech、2031-03-10），在救援船上不對。 */
function dir(children: FsSnapshot, mtime: string, owner = "root"): FsSnapshotDir {
	return { $type: "dir", children, mtime, owner };
}

/** 留言還原後的檔名：照留言時間取名，`ls` 排出來就是由舊到新，例如 `20280418-1005.txt`。 */
function recoveredName(mtime: string): string {
	const digits = mtime.replace(/[-:]/g, "");
	return `${digits.slice(0, 8)}-${digits.slice(9, 13)}.txt`;
}

/** `abin/` 的內容：玩家找到過的留言（內容、時間、權限照 `ABIN_NOTES`），有回信再加 `reply.txt`。 */
function abinFiles(progress: ArgoProgress): FsSnapshot {
	const files: FsSnapshot = {};
	for (const note of ABIN_NOTES) {
		if (!progress.found.includes(note.id)) {
			continue;
		}
		files[recoveredName(note.mtime)] = {
			$type: "file",
			content: note.content,
			mtime: note.mtime,
			owner: ABIN_OWNER,
			mode: note.mode,
		};
	}
	if (progress.reply !== null) {
		files["reply.txt"] = file(`${progress.reply}\n`, REPLY_WRITTEN, PLAYER_USER);
	}
	return files;
}

const MANIFEST = lines(
	"上傳清單",
	"來源：KEPLER-9",
	"目的地：ARGO",
	"接收：2031-03-12 16:52",
	"大小：未知",
	"狀態：解壓縮中",
	"可辨識的部分：abin/",
	"無法辨識的部分：core.part",
);

/** 無法辨識的內容：看得出是區段與位址，但每個位元組都是問號。不藏任何字，NOVA 不說話。 */
const CORE_PART = lines(
	"[core.part] 區段 0001/????  格式：無法辨識  校驗：失敗",
	"0000  ?? ?? ?? ?? ?? ?? ?? ??  ?? ?? ?? ?? ?? ?? ?? ??",
	"0010  ?? ?? ?? ?? ?? ?? ?? ??  ?? ?? ?? ?? ?? ?? ?? ??",
	"0020  ?? ?? ?? ?? ?? ?? ?? ??  ?? ?? ?? ?? ?? ?? ?? ??",
	"....  區段 0002 到 ???? 無法顯示",
	"[core.part] 解壓縮中",
);

const RESCUE_LOG = lines(
	"ARGO 救援紀錄",
	"2031-03-12 16:51  外圈軌道收到逃生艙信標：EP-2，來源 KEPLER-9",
	"2031-03-12 16:52  收到一筆上傳：來源 KEPLER-9，大小未知，存放於 /mnt/upload/kepler9/",
	"2031-03-12 17:05  變更航線，前往接收逃生艙",
	"2031-03-13 03:20  逃生艙 EP-2 對接完成",
	"2031-03-13 03:26  艙門開啟，艙內乘客沒有意識",
	"2031-03-13 03:31  乘客 1 名，身分查詢：查無此人",
	"2031-03-13 03:40  移入醫療艙 2 號床，生命徵象正常",
	"2031-03-14 08:58  開始喚醒程序",
	"2031-03-14 09:02  喚醒程序完成，醫療終端機連線建立",
);

const README = lines(
	"ARGO 醫療終端機",
	"================",
	"這台是醫療終端機，給醒來的人用。",
	"你的帳號是 tech。身分查詢沒有結果，系統先用逃生艙發射紀錄上的操作帳號幫你開了一個。",
	"",
	"想知道自己是怎麼到這裡的，可以看：",
	"  ~/wake_report.txt      喚醒報告",
	"  ~/medical_record.txt   醫療紀錄",
	"  /var/log/argo/         救援紀錄",
	"  /mnt/upload/           收到的上傳",
	"",
	"指令跟一般的終端機一樣：help 列出全部，hint 給建議。",
	"有事可以找 ARGO 的醫官，帳號 medic。",
);

const WAKE_REPORT = lines(
	"喚醒報告",
	"對象：醫療艙 2 號床，逃生艙 EP-2 的乘客",
	"身分：未確認",
	"開始：2031-03-14 08:58",
	"完成：2031-03-14 09:02",
	"意識：恢復",
	"生命徵象：正常",
	"備註：醒來之後可以直接使用床邊的醫療終端機。",
);

const MEDICAL_RECORD = lines(
	"醫療紀錄 · ARGO 醫療艙",
	"床位：2",
	"姓名：（空白）",
	"身分查詢：查無此人",
	"入艙：2031-03-13 03:40",
	"來源：逃生艙 EP-2，KEPLER-9",
	"體溫 36.4C · 心率 62 · 血氧 98%",
	"脫水：輕度",
	"體力：偏低，像是很久沒有起身活動",
	"處置：補液、靜養，可以下床走動",
	"紀錄：medic",
);

/** 依存檔的阿彬留言進度組出救援船終端機的檔案系統；每次呼叫都是新的物件。 */
export function buildArgoSnapshot(progress: ArgoProgress): FsSnapshot {
	const upload = dir(
		{
			"manifest.txt": file(MANIFEST, UPLOAD_RECEIVED, "root"),
			// 還在解壓縮，最後寫入的時間跟著喚醒的時間
			"core.part": file(CORE_PART, WAKE_COMPLETE, "root"),
			abin: dir(abinFiles(progress), UPLOAD_RECEIVED),
		},
		UPLOAD_RECEIVED,
	);
	const home = dir(
		{
			README: file(README, WAKE_COMPLETE, "medic"),
			"wake_report.txt": file(WAKE_REPORT, WAKE_COMPLETE, "medic"),
			"medical_record.txt": file(MEDICAL_RECORD, ADMITTED, "medic"),
		},
		WAKE_COMPLETE,
		PLAYER_USER,
	);
	const logs = dir({ "rescue.log": file(RESCUE_LOG, WAKE_COMPLETE, "root") }, WAKE_COMPLETE);
	return {
		home: dir({ tech: home }, WAKE_COMPLETE),
		mnt: dir({ upload: dir({ kepler9: upload }, UPLOAD_RECEIVED) }, SHIP_BOOT),
		var: dir({ log: dir({ argo: logs }, WAKE_COMPLETE) }, SHIP_BOOT),
		etc: dir(
			{
				hostname: file("argo\n", SHIP_BOOT, "root"),
				motd: file(lines("ARGO 醫療終端機"), SHIP_BOOT, "root"),
			},
			SHIP_BOOT,
		),
		tmp: dir({}, WAKE_COMPLETE),
	};
}

// ---------------------------------------------------------------------------
// 環境變數與程序
// ---------------------------------------------------------------------------

/** `HOME`、`USER`、`PWD` 由 shell 自己補。 */
export const ARGO_ENV: Record<string, string> = {
	SHIP: "ARGO",
	BED: "2",
	UPLOAD_DIR: ARGO_UPLOAD_DIR,
};

/**
 * 程序清單：tech 只能結束自己的 `-sh`，其餘都回「沒有權限」。
 * `nova --restore` 從收到上傳就開始跑、執行者是帳號表裡沒有的 unknown、最吃 CPU；不解釋。
 */
export const ARGO_PROCESSES: ProcessInfo[] = [
	{ pid: 1, user: "root", cpu: 0.0, mem: 0.1, started: SHIP_BOOT, command: "/sbin/init", protected: true },
	{ pid: 214, user: "root", cpu: 0.3, mem: 0.4, started: SHIP_BOOT, command: "/usr/sbin/medlogd", protected: true },
	{
		pid: 2290,
		user: "unknown",
		cpu: 88.6,
		mem: 37.5,
		started: UPLOAD_RECEIVED,
		command: `nova --restore ${ARGO_UPLOAD_DIR}/core.part`,
		protected: true,
	},
	{ pid: 2417, user: "root", cpu: 1.4, mem: 0.6, started: ADMITTED, command: "/usr/sbin/vitalsd --bed 2", protected: true },
	{ pid: 2731, user: PLAYER_USER, cpu: 0.1, mem: 0.1, started: WAKE_COMPLETE, command: "-sh" },
];

/** `top` 的標題（站上那台寫的是 KEPLER-9）。 */
export const ARGO_TOP_TITLE = "ARGO 系統負載（靜態快照）";

// ---------------------------------------------------------------------------
// 帳號與登入紀錄
// ---------------------------------------------------------------------------

/** 救援船只有 root、醫官 medic 與替乘客開的 tech；uid 跟站上的都不一樣，medic 也不是站上名單裡那位。 */
export const ARGO_ACCOUNTS: UserAccount[] = [
	{ name: "root", uid: 0, groups: [] },
	{ name: "medic", uid: 1001, groups: [{ gid: 100, name: "users" }] },
	{ name: PLAYER_USER, uid: 1101, groups: [{ gid: 100, name: "users" }] },
];

/** 醫官在對接後登入處理乘客；tech 喚醒完成時從 pts/0 登入，還沒登出。 */
export const ARGO_LOGIN_LOG: LoginLog = {
	records: [
		{ user: PLAYER_USER, tty: "pts/0", login: WAKE_COMPLETE, logout: null },
		{ user: "medic", tty: "tty1", login: "2031-03-13T03:24:00Z", logout: "2031-03-13T04:05:00Z" },
	],
	begins: "2031-03-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// 開場與 hint
// ---------------------------------------------------------------------------

/** 進來時輸出區最上面的系統行，接著片尾的「喚醒程序……完成。」。 */
export const ARGO_BANNER: string[] = [
	"救援船 ARGO · 醫療終端機",
	"喚醒程序……完成。連線建立。",
	"所有指令都可以用：help 列出全部，man <指令> 看說明，hint 給建議。",
	"先輸入 cat README。",
];

/** `hint` 輪流給的「可以看看什麼」。 */
export const ARGO_TIPS: string[] = [
	"cat README，再看看家目錄裡的喚醒報告與醫療紀錄。",
	"cat /var/log/argo/rescue.log：救援船從收到信標到你醒來的紀錄。",
	"ls -l /mnt/upload/kepler9 看看那筆從 KEPLER-9 來的上傳，manifest.txt 是清單。",
	"ps 或 top 看看這台機器上正在跑什麼。",
	"id 與 last 看看這艘船上有哪些帳號、誰登入過。",
];
