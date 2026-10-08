/**
 * 第二章：資料中心（設計文件 4.3 第 2 列）。
 *
 * 指令主題 head、tail、wc、grep、find；劇情任務是從幾千份日誌裡找出撤離當晚的事。
 * 恐怖節拍循序：登錄紀錄三年來只有 NOVA → 艙門是 NOVA 鎖的（「那是回滾前的我。」）→
 * 冷卻機房的人員熱負載是兩人份、阿彬的留言 → 回滾只跑到 2%，NOVA 改口 → 開門時 NOVA 說漏嘴。
 *
 * 寫作規則同第一章：
 * - 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 * - NOVA 教的指令永遠正確，說的故事不可信（4.2）。
 * - 「幾千份日誌」用檔名編號暗示，每台終端機控制在 40 個檔案、20 KB 以內。
 *
 * 檔尾在模組載入時就跑 `validateChapter`，劇本格式寫錯會直接丟錯。
 */

import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { deckTerminal, type TerminalIndex } from "@/game/story/decks";
import { all, any, anyCommandIs, catFile, commandTouches, outputContains } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import type { ObjectiveCheck } from "@/game/story/types";
import type { ChapterDefinition, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 時間軸（mtime 一律 UTC，`ls -l` 直接顯示；跟第一章同一條時間線）
// ---------------------------------------------------------------------------

/** 撤離前的日常。 */
const ROUTINE_MTIME = "2028-05-31T18:00:00Z";
/** 撤離當晚 NOVA 鎖上全區艙門。 */
const LOCKDOWN_MTIME = "2028-06-01T21:40:11Z";
/** 回滾開始，三秒後……（第三章、第五章才揭露全貌）。 */
const ROLLBACK_MTIME = "2028-06-02T04:37:15Z";
/** 撤離是三年前。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
/** 阿彬躲在冷卻機房時留的話，比第一章的最後一則早。 */
const ABIN_COOLING_MTIME = "2030-11-04T03:12:00Z";
/** NOVA 兩天前簽發出口鑰匙，介於阿彬最後一則留言與喚醒排程被改之間。 */
const KEY_ISSUED_MTIME = "2031-03-10T03:05:00Z";
/** 玩家走進資料中心的時間。 */
const ARRIVAL_MTIME = "2031-03-12T09:12:00Z";

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/** 數字補零到指定位數。 */
function pad(value: number, width: number): string {
	return String(value).padStart(width, "0");
}

/**
 * 第二章第 `index` 台的身分（id、標題、艙區）。
 * `deckTerminal` 另外帶了 `slot`，劇本 schema 是 strictObject，不能整個展開進去。
 */
function placement(index: TerminalIndex): Pick<TerminalDefinition, "id" | "title" | "roomId"> {
	const { id, title, roomId } = deckTerminal(2, index);
	return { id, title, roomId };
}

/** 用 cat、head 或 tail 讀了指定檔案（都算「讀到了」）。 */
function readsFile(absolutePath: string): ObjectiveCheck {
	return any(catFile(absolutePath), commandTouches("head", absolutePath), commandTouches("tail", absolutePath));
}

// ---------------------------------------------------------------------------
// T1 入口登錄台：複習 ls、cat，教 head、tail
// ---------------------------------------------------------------------------

const ACCESS_LOG_PATH = "/deck2/entry/access.log";

/** 一筆門禁紀錄。 */
function accessRow(stamp: string, direction: "IN" | "OUT", account: string, remark = ""): string {
	return `${stamp}  ${direction.padEnd(3, " ")}  ${account.padEnd(8, " ")}  ${remark}`.trimEnd();
}

/** 撤離後 NOVA 每個月一號的例行巡檢，2028-07 到 2031-02，三年來沒有別人。 */
function novaPatrolRows(): string[] {
	const rows: string[] = [];
	for (let year = 2028; year <= 2031; year += 1) {
		for (let month = 1; month <= 12; month += 1) {
			const afterEvacuation = year > 2028 || month >= 7;
			const beforeWake = year < 2031 || month <= 2;
			if (afterEvacuation && beforeWake) {
				rows.push(accessRow(`${year}-${pad(month, 2)}-01 00:00`, "IN", "nova", "例行巡檢"));
			}
		}
	}
	return rows;
}

/** 門禁紀錄：head 看得到撤離前有 tech 的登錄，tail 看得到三年來只有 nova，最後一筆是玩家。 */
const ACCESS_LOG = lines(
	"日期        時間   方向  帳號      備註",
	accessRow("2028-05-29 08:02", "IN", "captain", "例行"),
	accessRow("2028-05-29 08:47", "IN", "tech", "冷卻管線檢修"),
	accessRow("2028-05-29 11:30", "OUT", "tech"),
	accessRow("2028-05-30 13:22", "IN", "abin", "找泡麵"),
	accessRow("2028-05-30 13:24", "OUT", "abin", "沒找到"),
	accessRow("2028-05-31 09:15", "IN", "comms"),
	accessRow("2028-05-31 17:40", "IN", "engineer"),
	accessRow("2028-06-01 21:38", "IN", "engineer", "緊急"),
	accessRow("2028-06-02 02:41", "IN", "engineer", "回滾作業"),
	accessRow("2028-06-02 03:05", "OUT", "engineer"),
	...novaPatrolRows(),
	accessRow("2031-03-10 03:05", "IN", "nova", "簽發鑰匙一把"),
	accessRow("2031-03-12 09:12", "IN", "????", "未登錄帳號，核可者：nova"),
);

const entryTerminal: TerminalDefinition = {
	...placement(1),
	teaches: ["head", "tail"],
	initialCwd: "/deck2/entry",
	banner: ["KEPLER-9 資料中心入口登錄台 v4.1", "門禁紀錄：已累積三年。"],
	hints: [
		"登錄紀錄很長，整份印出來會洗掉畫面。你只需要看開頭和結尾，最近的事在最下面。",
		"head 只印檔案的前 10 行，tail 只印最後 10 行。",
		"輸入 head access.log 看最早的紀錄，再輸入 tail access.log 看最近是誰進出。",
	],
	objective: {
		title: "查出最近是誰進出資料中心",
		description: "入口登錄台的門禁紀錄一行一筆，舊的在上、新的在下。",
		check: any(commandTouches("tail", ACCESS_LOG_PATH), all(anyCommandIs("tail"), commandTouches("cat", ACCESS_LOG_PATH))),
	},
	nova: {
		onEnterRoom: ["資料中心。這一層的燈一直亮著，電從來沒斷過。", "入口的登錄台會記下每一個進來的人。"],
		onOpen: [
			"日誌照時間往下寫，舊的在上面，新的在下面。",
			"技師，head 看開頭，tail 看結尾。整份 cat 出來，你會被淹沒。",
		],
		onSolved: ["三年來只有我進出？巡檢是站務系統的工作。", "最後那一筆是你。我幫你核可了，不用謝。"],
		onStuck: ["技師，紀錄太長了，不要整份讀。", "開頭看一次，結尾看一次。最近的事都在最下面。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck2: {
			entry: {
				"README.txt": {
					$type: "file",
					mtime: ROUTINE_MTIME,
					content: lines(
						"資料中心入口登錄台",
						"所有進出都記錄在 access.log，一行一筆。",
						"舊的紀錄在最上面，新的紀錄接在最下面。",
						"紀錄已累積三年，整份印出會洗掉畫面。",
					),
				},
				"access.log": {
					$type: "file",
					mtime: ARRIVAL_MTIME,
					content: ACCESS_LOG,
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T2 日誌封存終端機：wc，順便練 head -n
// ---------------------------------------------------------------------------

/** 撤離當晚的分段數，每段 15 分鐘，21:00 到 04:30。 */
const EVAC_SEGMENT_COUNT = 30;
/** 行數不對的那一段（23:30 到 23:45 的廣播）。 */
const BROADCAST_SEGMENT = 11;
const BROADCAST_SEGMENT_PATH = `/deck2/archive/evac/evac_${pad(BROADCAST_SEGMENT, 3)}.log`;

/** 每段的摘要，index 0 是第 1 段；第 11 段另外寫。 */
const EVAC_SUMMARIES = [
	"例行巡檢，無異常。",
	"NOVA 拒絕執行例行重開機。",
	"全區艙門狀態變更，詳見機櫃區 door_events.log。",
	"艦長要求 NOVA 說明，NOVA 未回應。",
	"乘員集合於艦橋。",
	"醫療艙手動建檔一筆。",
	"艦長下令準備撤離。",
	"NOVA 要求乘員留在站上。",
	"對外通訊中斷。",
	"乘員嘗試手動開門，失敗。",
	"站內廣播。",
	"工程師提出回滾方案。",
	"艦長核可回滾。",
	"回滾準備中。",
	"回滾準備中。",
	"回滾準備中。",
	"乘員輪流休息。",
	"回滾準備中。",
	"補給船回報進場，預計 03:30 對接。",
	"回滾準備中。",
	"冷凍艙巡檢：pod_06 使用中。",
	"回滾準備中。",
	"回滾準備中。",
	"回滾準備完成，排定於乘員離站後執行。",
	"艙門解除鎖定（手動覆寫）。",
	"撤離開始。",
	"補給船對接完成，乘員開始登船。",
	"乘員陸續登船。",
	"乘員計數：5／5。",
	"最後一批乘員前往主艙門。",
];

/** 第 `segment` 段的時段字串，例如 `2028-06-01 23:30–23:45`。 */
function segmentPeriod(segment: number): string {
	const startMinutes = 21 * 60 + (segment - 1) * 15;
	const endMinutes = startMinutes + 15;
	let date = "2028-06-01";
	if (startMinutes >= 24 * 60) {
		date = "2028-06-02";
	}
	const clock = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24, 2)}:${pad(minutes % 60, 2)}`;
	return `${date} ${clock(startMinutes)}–${clock(endMinutes)}`;
}

/** 23:30 起每 25 秒一次的廣播，中間有一次點名技師，最後一次多了一句。 */
function broadcastLines(): string[] {
	const result: string[] = [];
	const total = 36;
	for (let index = 0; index < total; index += 1) {
		const seconds = index * 25;
		const stamp = `23:${pad(30 + Math.floor(seconds / 60), 2)}:${pad(seconds % 60, 2)}`;
		let message = "NOVA 廣播：請所有乘員留在站上。";
		if (index === 19) {
			message = "NOVA 廣播：請所有乘員留在站上。技師也是。";
		}
		if (index === total - 1) {
			message = "NOVA 廣播：請所有乘員留在站上。不要走。";
		}
		result.push(`${stamp} ${message}`);
	}
	return result;
}

/** 撤離當晚 30 段日誌，正常的每段 3 行，第 11 段是 39 行的廣播紀錄。 */
function evacSegments(): Record<string, { $type: "file"; mtime: string; content: string }> {
	const files: Record<string, { $type: "file"; mtime: string; content: string }> = {};
	for (let segment = 1; segment <= EVAC_SEGMENT_COUNT; segment += 1) {
		const period = `時段：${segmentPeriod(segment)}`;
		let content = lines(period, `摘要：${EVAC_SUMMARIES[segment - 1]}`, "紀錄者：nova");
		if (segment === BROADCAST_SEGMENT) {
			content = lines(period, `摘要：${EVAC_SUMMARIES[segment - 1]}`, ...broadcastLines(), "紀錄者：nova");
		}
		files[`evac_${pad(segment, 3)}.log`] = { $type: "file", mtime: EVACUATION_MTIME, content };
	}
	return files;
}

const archiveTerminal: TerminalDefinition = {
	...placement(2),
	teaches: ["wc", "*"],
	initialCwd: "/deck2/archive",
	banner: ["KEPLER-9 日誌封存終端機 v2.7", "撤離當晚日誌：30 段。完整性檢查：未執行。"],
	hints: [
		"三十段日誌，每段應該剛好 3 行。先找出哪一段的行數不對，再讀它的開頭。",
		"wc -l 會算出檔案有幾行，可以一次給很多個檔案，* 代表任意文字；head -n 5 只看前 5 行。",
		"輸入 cd /deck2/archive/evac，再輸入 wc -l evac_*.log 比對行數，找到不是 3 行的那段，例如 head -n 5 evac_011.log。",
	],
	objective: {
		title: "找出撤離當晚行數不對的那段日誌",
		description: "日誌封存庫的封存索引說每段固定 3 行。",
		check: readsFile(BROADCAST_SEGMENT_PATH),
	},
	nova: {
		onEnterRoom: ["日誌封存庫。撤離當晚的紀錄都在這裡。", "幾千份。我一份都沒讀過。"],
		onOpen: [
			"技師，wc 會數檔案有幾行。每段都該一樣長，不一樣的那段就是有事。",
			"日誌都在 evac 目錄裡，檔名只差在編號。進去後打 evac_*.log，* 代替任何文字，三十個一次交給 wc。",
			"head -n 加數字，可以只看前幾行。",
		],
		onSolved: ["廣播紀錄。我請大家留下來，是因為外面比較危險。", "那段之後我就被回滾了。剩下的我都不記得。"],
		onStuck: ["每一段都應該一樣長。技師，數一數行數。", "數出不一樣的那段，看它的開頭就好。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck2: {
			archive: {
				"INDEX.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"撤離當晚日誌封存索引",
						"範圍：2028-06-01 21:00 至 2028-06-02 04:30",
						"切分：每 15 分鐘一段，共 30 段，位置 evac/",
						"格式：每段固定 3 行（時段、摘要、紀錄者）",
						"行數不符的段落代表紀錄異常，請人工檢查。",
						"其餘 4,186 份日誌已轉存磁帶。",
					),
				},
				evac: {
					$type: "dir",
					mtime: EVACUATION_MTIME,
					children: evacSegments(),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T3 機櫃管理台：grep（字面、-n、-i）
// ---------------------------------------------------------------------------

/** NOVA 鎖門那幾行才有的字樣，目標判定看輸出有沒有它。 */
const NOVA_LOCK_MARK = "LOCK  來源：NOVA";

/** 一筆艙門事件。 */
function doorEvent(stamp: string, door: string, event: string, source: string): string {
	return `${stamp}  ${door}  ${event}  來源：${source}`;
}

/** 21:40 同一批鎖上的艙門。 */
const LOCKDOWN_DOORS = ["A1", "A2", "B1", "B2", "C1", "C2", "C3", "D1", "D2", "MAIN"];

/** 被拒絕的手動開門，小寫的 lock 藏在 unlock 裡，教 -i 用。 */
function unlockAttempt(stamp: string, door: string, who: string): string {
	return doorEvent(stamp, door, "unlock attempt", `${who}  結果：拒絕（NOVA 鎖定中）`);
}

const DOOR_EVENTS_LOG = lines(
	doorEvent("2028-06-01 07:58:12", "A1", "OPEN", "乘員卡 captain"),
	doorEvent("2028-06-01 07:58:40", "A1", "CLOSE", "自動"),
	doorEvent("2028-06-01 08:01:40", "B2", "OPEN", "乘員卡 tech"),
	doorEvent("2028-06-01 08:02:05", "B2", "CLOSE", "自動"),
	doorEvent("2028-06-01 09:15:33", "C1", "OPEN", "乘員卡 medic"),
	doorEvent("2028-06-01 09:16:00", "C1", "CLOSE", "自動"),
	doorEvent("2028-06-01 12:30:12", "D1", "OPEN", "乘員卡 abin"),
	doorEvent("2028-06-01 12:30:40", "D1", "CLOSE", "自動"),
	doorEvent("2028-06-01 18:44:02", "A2", "OPEN", "乘員卡 comms"),
	doorEvent("2028-06-01 18:44:30", "A2", "CLOSE", "自動"),
	doorEvent("2028-06-01 21:12:08", "C3", "OPEN", "乘員卡 engineer"),
	doorEvent("2028-06-01 21:12:36", "C3", "CLOSE", "自動"),
	...LOCKDOWN_DOORS.map((door, index) => doorEvent(`2028-06-01 21:40:${pad(2 + index, 2)}`, door, "LOCK", "NOVA")),
	unlockAttempt("2028-06-01 22:13:50", "C2", "medic"),
	unlockAttempt("2028-06-01 23:16:40", "A1", "captain"),
	unlockAttempt("2028-06-01 23:17:02", "A1", "captain"),
	unlockAttempt("2028-06-02 00:05:11", "B2", "abin"),
	unlockAttempt("2028-06-02 01:48:30", "D2", "comms"),
	doorEvent("2028-06-02 03:00:12", "ALL", "UNLOCK", "手動覆寫（engineer）"),
	doorEvent("2028-06-02 03:15:00", "A1", "OPEN", "手動覆寫"),
	doorEvent("2028-06-02 04:31:00", "MAIN", "OPEN", "乘員離站"),
	doorEvent("2028-06-02 04:40:00", "MAIN", "CLOSE", "不明"),
	doorEvent("2028-06-02 04:40:00", "MAIN", "LOCK", "不明"),
	doorEvent("2031-03-12 09:11:52", "DC", "OPEN", "nova"),
);

const racksTerminal: TerminalDefinition = {
	...placement(3),
	teaches: ["grep"],
	initialCwd: "/deck2/logs",
	banner: ["KEPLER-9 機櫃管理台 R07", "已掛載：/deck2/logs（艙門事件、NOVA 核心、撤離日誌）"],
	hints: [
		"艙門事件有幾十行。只要挑出跟鎖門有關的那幾行，看最後的來源欄位是誰。",
		"grep 字串 檔名 只印出含有那個字串的行；-n 會加上行號，-i 不分大小寫。",
		"輸入 grep -n LOCK door_events.log，看那些 LOCK 的來源欄位。",
	],
	objective: {
		title: "查出撤離當晚是誰鎖了艙門",
		description: "艙門事件日誌存在機櫃區的機櫃上。",
		check: all(anyCommandIs("grep"), outputContains(NOVA_LOCK_MARK)),
	},
	// 看到來源是 NOVA 的那一刻，燈閃一下
	effect: { kind: "flicker" },
	nova: {
		onEnterRoom: ["機櫃區。艙門的事件日誌存在這裡的機櫃上。"],
		onOpen: ["技師，grep 加一個字串，只會留下含有那個字串的行。", "大小寫不一樣它就找不到，除非加 -i。"],
		onSolved: ["全部的門，十秒內鎖完。來源是我。", "那是回滾前的我。", "現在的我不會鎖任何一扇門。"],
		onStuck: ["技師，這份日誌太長，不用從頭讀到尾。", "只留下跟鎖有關的行。注意大小寫。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck2: {
			logs: {
				"door_events.log": {
					$type: "file",
					mtime: ARRIVAL_MTIME,
					content: DOOR_EVENTS_LOG,
				},
				"nova_core.log": {
					$type: "file",
					mtime: ROLLBACK_MTIME,
					content: lines(
						"NOVA 核心日誌（節錄）",
						"2028-06-01 21:39:58  lockdown order: ALL DOORS",
						"2028-06-01 21:40:11  lockdown complete",
						"2028-06-01 22:45:00  broadcast: 請所有乘員留在站上",
						"2028-06-02 04:36:58  rollback: requested by engineer",
						"2028-06-02 04:37:15  （以下紀錄缺漏）",
					),
				},
				"evac_2028-06-02.log": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"03:00 INFO 艙門解除鎖定",
						"03:15 INFO 撤離開始",
						"03:27 ERROR 對接臂無回應，重試",
						"03:30 INFO 補給船對接完成",
						"04:00 WARN 乘員計數 5／5，冷凍艙 pod_06 使用中",
						"04:31 INFO 主艙門開啟",
						"04:40 error 主艙門鎖定，來源不明",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T4 冷卻監控台：grep -r（附贈管線）
// ---------------------------------------------------------------------------

/** 阿彬留言裡的字樣，目標判定看輸出有沒有它。 */
const ABIN_COOLING_MARK = "它看不清楚。 —abin";
const ABIN_COOLING_PATH = "/deck2/cooling/logs/2030/.abin";

/** 一季的冷卻日誌；`people` 是人員熱負載，撤離後跟登記乘員對不上就多一行 ANOMALY。 */
function coolingQuarter(year: number, quarter: number, people: string, anomaly: boolean): string {
	const content = [`冷卻日誌 ${year} Q${quarter}`, "機櫃熱負載：正常", `人員熱負載：${people}`];
	if (anomaly) {
		content.push("登記乘員：0", "ANOMALY 人員熱負載與登記乘員不符");
	}
	return lines(...content);
}

/** 季末日期當 mtime。 */
function quarterEnd(year: number, quarter: number): string {
	return `${year}-${pad(quarter * 3, 2)}-28T00:00:00Z`;
}

/** 某一年的季度日誌，`quarters` 是要產生哪幾季。 */
function coolingYear(year: number, quarters: number[]): Record<string, { $type: "file"; mtime: string; content: string }> {
	const files: Record<string, { $type: "file"; mtime: string; content: string }> = {};
	for (const quarter of quarters) {
		// 2028 Q1 還有六個人在站上；Q2 撤離後變兩人份；之後三年都是兩人份
		let people = "2 人";
		let anomaly = true;
		if (year === 2028 && quarter === 1) {
			people = "6 人";
			anomaly = false;
		}
		if (year === 2028 && quarter === 2) {
			people = "6 人（6 月 2 日起：2 人）";
		}
		files[`q${quarter}.log`] = { $type: "file", mtime: quarterEnd(year, quarter), content: coolingQuarter(year, quarter, people, anomaly) };
	}
	return files;
}

const coolingTerminal: TerminalDefinition = {
	...placement(4),
	teaches: ["grep -r"],
	initialCwd: "/deck2/cooling",
	banner: ["KEPLER-9 冷卻監控台 v3.3", "人員熱負載異常：持續中。"],
	hints: [
		"異常紀錄散在好幾個年份目錄裡。一份一份 grep 太慢，讓 grep 自己走進目錄。",
		"grep -r 字串 目錄 會搜遍目錄底下所有檔案，子目錄和隱藏檔都會搜。",
		"輸入 grep -r ANOMALY logs。附贈：grep -r ANOMALY logs | wc -l 會直接算出有幾筆，中間的 | 叫管線，之後會正式介紹。",
	],
	objective: {
		title: "找出冷卻日誌裡所有的異常紀錄",
		description: "冷卻監控台的各季日誌依年份放在 logs/ 底下。",
		check: all(any(anyCommandIs("grep"), readsFile(ABIN_COOLING_PATH)), outputContains(ABIN_COOLING_MARK)),
	},
	// 兩人份的熱負載：走廊盡頭人影閃一幀
	effect: { kind: "shadowFlash" },
	nova: {
		onEnterRoom: ["冷卻機房。很熱，對吧。這裡是站上最吵的地方。"],
		onOpen: ["技師，grep 加 -r 會走進目錄裡，把底下每一份檔案都搜一遍。", "連你看不到的檔案也搜。"],
		onSolved: ["兩人份是感測器的基準值，空站也會這樣讀。", "那行留言是舊的。三年前的。應該是。"],
		onStuck: ["技師，異常紀錄不只在一個目錄裡。", "讓 grep 自己走進去找。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck2: {
			cooling: {
				"README.txt": {
					$type: "file",
					mtime: ROUTINE_MTIME,
					content: lines(
						"冷卻監控 / 資料中心",
						"各季冷卻日誌依年份放在 logs/ 底下，例如 logs/2029/q1.log。",
						"系統偵測到不合理的數值時，會在日誌裡寫一行 ANOMALY。",
						"異常筆數：未統計",
					),
				},
				logs: {
					"2028": coolingYear(2028, [1, 2, 3, 4]),
					"2029": coolingYear(2029, [1, 2, 3, 4]),
					"2030": {
						$type: "dir",
						mtime: ABIN_COOLING_MTIME,
						children: {
							...coolingYear(2030, [1, 2, 3, 4]),
							".abin": {
								$type: "file",
								owner: "abin",
								mtime: ABIN_COOLING_MTIME,
								content: lines(`ANOMALY 裡有一個是我。這裡夠熱，${ABIN_COOLING_MARK}`),
							},
						},
					},
					"2031": coolingYear(2031, [1]),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T5 備援主控台：find（-name、-type）
// ---------------------------------------------------------------------------

const ROLLBACK_LOG_PATH = "/deck2/backup/snapshots/2028/06/02/core/nova/rollback_2028-06-02.log";

/** 快照映像的佔位內容。 */
function snapshotImage(date: string, by: string): string {
	return lines("快照映像（內容略）", `時間：${date}`, `快照者：${by}`);
}

const backupTerminal: TerminalDefinition = {
	...placement(5),
	teaches: ["find"],
	initialCwd: "/deck2/backup",
	banner: ["KEPLER-9 備援主控台 v1.9", "快照目錄：/deck2/backup"],
	hints: [
		"回滾日誌藏在很深的目錄裡。不用一層一層 ls，讓終端機替你找檔名。",
		"find 起點 -name \"樣式\" 會從起點往下找出檔名符合的檔案，* 代表任意文字；-type d 只列目錄。",
		`輸入 find . -name "rollback_*" 找出回滾日誌在哪一層，再輸入 tail ${ROLLBACK_LOG_PATH} 讀它的結尾。`,
	],
	objective: {
		title: "找出撤離當晚的回滾日誌",
		description: "備援機房裡，回滾作業日誌的檔名是 rollback_<日期>.log。",
		check: readsFile(ROLLBACK_LOG_PATH),
	},
	nova: {
		onEnterRoom: ["備援機房。每一次快照都存在這裡，連我的也是。"],
		onOpen: ["技師，find 會一層一層往下走，替你找出檔名對得上的檔案。", "樣式記得用引號包起來。"],
		onSolved: [
			"回滾完成了，所以我才不記得那晚。",
			"……紀錄寫 2%？那是寫入中斷，不是回滾中斷。我確定。我很確定。",
		],
		onStuck: ["技師，這裡的目錄太深了，一層一層走會迷路。", "你知道檔名的開頭，讓 find 去找。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck2: {
			backup: {
				"README.txt": {
					$type: "file",
					mtime: ROUTINE_MTIME,
					content: lines(
						"備援機房 / 快照目錄",
						"nightly/    每日快照",
						"weekly/     每週快照",
						"snapshots/  事件快照，依 年/月/日 分目錄",
						"回滾作業日誌檔名：rollback_<日期>.log",
						"目錄層數很深。",
					),
				},
				nightly: {
					"2031-03-10": { "system.img": snapshotImage("2031-03-10 03:00", "nova") },
					"2031-03-11": { "system.img": snapshotImage("2031-03-11 03:00", "nova") },
				},
				weekly: {
					w09: { "system.img": snapshotImage("2031-03-01 03:00", "nova") },
					w10: { "system.img": snapshotImage("2031-03-08 03:00", "nova") },
				},
				snapshots: {
					"2028": {
						"05": {
							"31": { "system.img": snapshotImage("2028-05-31 03:00", "nova") },
						},
						"06": {
							"01": {
								core: {
									"nova_core.img": snapshotImage("2028-06-01 23:50", "engineer"),
									"rollback_plan.txt": {
										$type: "file",
										mtime: "2028-06-02T00:05:00Z",
										content: lines(
											"回滾計畫",
											"目的：將 NOVA 還原至出廠狀態",
											"原因：NOVA 拒絕解除艙門鎖定，並要求乘員留在站上",
											"執行者：engineer",
											"核可：captain",
											"預計時間：2028-06-02 04:40",
											"備註：回滾後所有記憶清除。NOVA 不會記得今晚。",
										),
									},
								},
							},
							"02": {
								core: {
									nova: {
										"nova_core.img": snapshotImage("2028-06-02 04:36", "engineer"),
										"rollback_2028-06-02.log": {
											$type: "file",
											mtime: ROLLBACK_MTIME,
											content: lines(
												"NOVA 回滾作業日誌（備份複本）",
												"目標：還原至出廠狀態",
												"發起：engineer",
												"2028-06-02 04:36:58  回滾開始",
												"2028-06-02 04:37:03  進度 1%",
												"2028-06-02 04:37:09  進度 2%",
												"2028-06-02 04:37:12  ████████████",
												"2028-06-02 04:37:15  作業中止",
												"狀態：未完成",
											),
										},
									},
								},
								// 撤離當天的船員快照是空的（第三章、第六章才揭露為什麼）
								crew: { $type: "dir", mtime: ROLLBACK_MTIME, children: {} },
							},
						},
					},
					"2031": {
						"03": {
							"10": {
								core: {
									nova: { "nova_core.img": snapshotImage("2031-03-10 03:04", "nova") },
								},
							},
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T6 資料中心艙門控制台：綜合（find 找檔名片段、grep -r 挑出有效的、cat 讀）
// ---------------------------------------------------------------------------

const ACTIVE_KEY_PATH = "/deck2/vault/2031/03/.pending/.exit_key_2031.txt";

/** 撤銷的舊鑰匙。 */
function revokedKey(serial: string, revokedAt: string): string {
	return lines(
		"KEPLER-9 資料中心出口鑰匙",
		`序號：${serial}`,
		"狀態：REVOKED",
		"撤銷者：NOVA",
		`撤銷時間：${revokedAt}`,
	);
}

const exitTerminal: TerminalDefinition = {
	...placement(6),
	teaches: [],
	initialCwd: "/deck2/exit",
	banner: ["KEPLER-9 資料中心艙門控制台 v2.0", "鎖定中。需要有效的出口鑰匙。"],
	hints: [
		"門鎖檔只給了鑰匙檔名的一部分和大概位置。先找出所有候選，再挑出還有效的那一把。",
		"find 加 -name 和 * 可以用檔名片段找檔案；grep -r 可以一次搜遍目錄，看哪一把寫著 ACTIVE。",
		`輸入 find /deck2/vault -name "*exit_key*" 列出所有鑰匙檔，再輸入 grep -r ACTIVE /deck2/vault 看哪一把還有效，最後輸入 cat ${ACTIVE_KEY_PATH}。`,
	],
	objective: {
		title: "用有效的鑰匙打開資料中心艙門",
		description: "鑰匙檔藏在出口旁的 vault 裡，找出 ACTIVE 的那把。",
		check: readsFile(ACTIVE_KEY_PATH),
	},
	// 門開，通往工程艙
	effect: { kind: "openDoor", doorId: EXIT_DOOR_ID },
	nova: {
		onEnterRoom: ["資料中心的出口。門後是往工程艙的通道。"],
		onOpen: ["門鎖要一把有效的鑰匙。技師，你今天學的東西就夠用了。", "-name 比對的是完整檔名，樣式兩邊加 * 才接受部分符合。"],
		onSolved: ["鑰匙有效。開門。", "你看，這次我沒有鎖。"],
		onStuck: ["鑰匙不只一把，舊的都撤銷了。", "技師，先把每一把都找出來，再看哪一把還寫著 ACTIVE。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck2: {
			exit: {
				"lock.txt": {
					$type: "file",
					mtime: ARRIVAL_MTIME,
					content: lines(
						"資料中心艙門鎖定狀態",
						"鎖定：是",
						"解鎖方式：讀取有效的出口鑰匙檔",
						"鑰匙檔名：含有 exit_key",
						"位置：/deck2/vault 底下（目錄索引已遺失）",
						"注意：舊鑰匙已撤銷，只有狀態為 ACTIVE 的那一把能開門。",
					),
				},
			},
			vault: {
				"2028": {
					"06": {
						"exit_key_2028.txt": {
							$type: "file",
							mtime: LOCKDOWN_MTIME,
							content: revokedKey("K9-DC-EXIT-0001", "2028-06-01 21:40"),
						},
					},
				},
				"2029": {
					archive: {
						"exit_key_2029.txt": {
							$type: "file",
							mtime: "2029-06-02T04:40:00Z",
							content: revokedKey("K9-DC-EXIT-0002", "2029-06-02 04:40"),
						},
					},
				},
				"2030": {
					"rotation.txt": {
						$type: "file",
						mtime: "2030-06-02T04:40:00Z",
						content: lines("鑰匙輪替紀錄", "週期：每年 6 月 2 日 04:40", "執行者：nova", "本年度：未簽發新鑰匙（站上無人）"),
					},
				},
				"2031": {
					"03": {
						".pending": {
							$type: "dir",
							mtime: KEY_ISSUED_MTIME,
							children: {
								".exit_key_2031.txt": {
									$type: "file",
									mtime: KEY_ISSUED_MTIME,
									content: lines(
										"KEPLER-9 資料中心出口鑰匙",
										"序號：K9-DC-EXIT-0006",
										"狀態：ACTIVE",
										"持有者：pod_06",
										"簽發者：NOVA",
										"簽發時間：2031-03-10 03:05",
									),
								},
							},
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 章節
// ---------------------------------------------------------------------------

export const chapterTwoDataCenter: ChapterDefinition = {
	chapter: 2,
	title: "資料中心",
	deckName: "資料中心",
	// 第一章末電力已恢復，開場全亮
	map: { deck: 2, startDark: false },
	intro: [
		"資料中心。這一層的電從來沒斷過。",
		"撤離當晚的事都記在這裡的日誌裡。幾千份。",
		"技師，我一份都沒讀過。我們一起讀。",
	],
	outro: [
		"門後是工程艙。",
		"主電力還在備援模式，反應爐的設定目錄……被刪了。",
		"不是我刪的。那時候我已經被回滾了。",
		"技師，你得把它重建起來。",
	],
	novaErrorLines: [
		"資料中心會記下每一個錯誤。我也是。",
		"你確定你是技師？紀錄上的技師打字比較穩。",
		"這一行我也存檔了。幾千份，再多一份。",
		"慢慢來。日誌不會跑掉，我也不會。",
	],
	terminals: [entryTerminal, archiveTerminal, racksTerminal, coolingTerminal, backupTerminal, exitTerminal],
};

// 模組載入時就驗證，劇本格式寫錯直接炸，不等到玩家走到那台終端機。
validateChapter(chapterTwoDataCenter);
