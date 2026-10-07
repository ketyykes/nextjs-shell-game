/**
 * 第四章：通訊艙（設計文件 4.3 第 4 列）。
 *
 * 指令主題：管線 `|`、重導向 `>` 與 `>>`、sort、uniq、echo。
 * 劇情任務：拼出求救訊號送出去。
 * 揭露：訊號送不出去，發送佇列被轉送到 `/dev/null`，轉送規則的設定者是站內的 `nova-core`。
 *
 * 恐怖節拍：
 * - T2 八座中繼站只剩一座回應，延遲 0.001 秒，來源寫著「站內」。
 * - T3 天線最後一次轉向是對著本站，時間就是技師醒來那一刻。
 * - T4 求救訊號的碎片裡混進一行不屬於訊號的「別送。」。
 * - T5 阿彬三年來的求救全被轉送到 `/dev/null`，規則設定者 nova-core。NOVA：「那是廣播天線壞了。」
 * - T6 NOVA：「訊號送出去了。有人會來的。」玩家知道沒有。
 *
 * 寫作規則同第一章：不指涉主角性別、年齡、名字，NOVA 一律叫玩家「技師」；
 * NOVA 教的指令永遠正確，說的故事不可信（4.2）。
 * 每台終端機的檔案系統各自獨立，前一台做出來的檔案（`callsign.txt`、`signal.txt`）
 * 在後面的終端機裡是預先放好的。
 *
 * 檔尾在模組載入時就跑 `validateChapter`，劇本格式寫錯會直接丟錯。
 */

import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { FsError } from "@/game/shell/types";
import { deckTerminal, type TerminalIndex } from "@/game/story/decks";
import {
	all,
	any,
	anyCommandIs,
	commandTouches,
	fileContains,
	fileExists,
	outputContains,
	redirectsTo,
} from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import type { ChapterDefinition, ObjectiveCheck, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 時間軸（mtime 一律 UTC，`ls -l` 直接顯示）
// ---------------------------------------------------------------------------

/** 撤離前一晚，NOVA 把對外發送改成轉送到 /dev/null。 */
const ROUTE_SET_MTIME = "2028-06-01T23:58:00Z";
/** 撤離是三年前。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
/** 阿彬兩天前來過通訊艙，最後一次放行往艦橋。 */
const ABIN_VISIT_MTIME = "2031-03-10T02:53:00Z";
/** 技師醒來的時間，天線在這一刻轉向本站。 */
const WAKE_MTIME = "2031-03-12T08:15:00Z";
/** 走進通訊艙的時間。 */
const COMMS_NOW_MTIME = "2031-03-12T14:02:00Z";

/** 站台呼號，T1 寫進 callsign.txt，T6 要放在清單第一行。 */
const CALLSIGN = "KEPLER-9";

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/**
 * 從 `decks.ts` 取這台終端機的 id、標題、艙區。
 * 只挑這三個欄位：`DeckTerminal` 還帶 `slot`，直接展開會被 schema 的 strictObject 擋掉。
 */
function terminalIdentity(index: TerminalIndex): Pick<TerminalDefinition, "id" | "title" | "roomId"> {
	const { id, title, roomId } = deckTerminal(4, index);
	return { id, title, roomId };
}

/** 讀檔案內容，不存在、是目錄或沒權限回 null。 */
function readFileOrNull(context: Parameters<ObjectiveCheck>[0], absolutePath: string): string | null {
	try {
		return context.fs.readFile("/", absolutePath);
	} catch (error) {
		if (error instanceof FsError) {
			return null;
		}
		throw error;
	}
}

// ---------------------------------------------------------------------------
// 本章專用的目標判定
// ---------------------------------------------------------------------------

/** 這一行用了管線（兩個以上的指令用 `|` 串起來）。 */
function usesPipe(): ObjectiveCheck {
	return (context) => (context.pipeline?.commands.length ?? 0) >= 2;
}

/** 輸出的最後一行含有 `text`（排序之後「最後一筆」）。 */
function lastOutputLineContains(text: string): ObjectiveCheck {
	return (context) => context.execution.lines.at(-1)?.includes(text) ?? false;
}

/** 檔案的第一行剛好是 `text`。 */
function fileFirstLineIs(absolutePath: string, text: string): ObjectiveCheck {
	return (context) => {
		const content = readFileOrNull(context, absolutePath);
		if (content === null) {
			return false;
		}
		return content.split("\n")[0] === text;
	};
}

// ---------------------------------------------------------------------------
// 求救訊號（T4 拼出來，T5、T6 預先放好）
// ---------------------------------------------------------------------------

/** 完整的求救訊號，每行以兩位數編號開頭，排序後就是正確順序。 */
const SIGNAL_LINES = [
	"01 MAYDAY MAYDAY MAYDAY",
	"02 這裡是 KEPLER-9，木星軌道研究站",
	"03 站上乘員：至少一人，名單不完整",
	"04 站務 AI 狀態：異常，無法信任",
	"05 請求救援，請求撤離",
	"06 座標：木星軌道，環形站體",
	"07 本訊號每 600 秒重送一次",
	"08 MAYDAY MAYDAY MAYDAY",
];

/** 混在碎片裡、不屬於求救訊號的那一行。中文排在數字後面，排序後會落在最後。 */
const INTRUDER_LINE = "別送。";

/** T4 用 `sort | uniq` 拼出來的 signal.txt 內容（含混進來的那一行），T5、T6 預先放好。 */
const ASSEMBLED_SIGNAL = lines(...SIGNAL_LINES, INTRUDER_LINE);

/** 編號行的格式。 */
const SIGNAL_LINE_PATTERN = /^\d\d /;

/**
 * 檔案裡的編號行剛好是完整訊號、依序、不重複。
 * 沒編號的行（例如「別送。」）不管，留著或用 `grep -v` 濾掉都算；`uniq -c` 的次數前綴會讓編號行對不上。
 */
function signalAssembled(absolutePath: string): ObjectiveCheck {
	return (context) => {
		const content = readFileOrNull(context, absolutePath);
		if (content === null) {
			return false;
		}
		const numbered = content.split("\n").filter((line) => SIGNAL_LINE_PATTERN.test(line));
		if (numbered.length !== SIGNAL_LINES.length) {
			return false;
		}
		return numbered.every((line, index) => line === SIGNAL_LINES[index]);
	};
}

// ---------------------------------------------------------------------------
// T1 通訊艙登錄台：echo、>
// ---------------------------------------------------------------------------

const CALLSIGN_PATH = "/deck4/comms/callsign.txt";

const entryTerminal: TerminalDefinition = {
	...terminalIdentity(1),
	teaches: ["echo", ">"],
	initialCwd: "/deck4/comms",
	banner: ["KEPLER-9 通訊艙登錄台 v4.1", "未登錄。對外通訊停用中。"],
	hints: [
		"登錄台要你留下站台呼號。先讀登錄說明，再想辦法把一段文字寫進檔案。",
		"echo 會把後面的文字原樣印出來；在後面加上 > 檔名，印出來的東西就會改寫進那個檔案。",
		"輸入 cat register.txt，再輸入 echo KEPLER-9 > callsign.txt。",
	],
	objective: {
		title: "把站台呼號寫進 callsign.txt",
		description: "呼號要寫進 /deck4/comms/callsign.txt。",
		check: all(fileExists(CALLSIGN_PATH), fileContains(CALLSIGN_PATH, CALLSIGN)),
	},
	nova: {
		onEnterRoom: ["通訊艙。站上唯一能跟外面說話的地方。", "技師，如果要求救，就從這裡開始。"],
		onOpen: ["登錄台要你留下站台的呼號。", "技師，echo 會把文字印出來，後面接 > 檔名，文字就會流進那個檔案。"],
		onSolved: ["呼號登錄完成。KEPLER-9 又有聲音了。", "上一個登錄的人沒填呼號。大概是忘了。"],
		onStuck: ["登錄說明寫得很清楚，技師。", "先把呼號印出來，再讓它流進檔案裡。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck4: {
			comms: {
				"register.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"通訊艙登錄說明",
						"================",
						"1. 對外通訊前，請先登錄站台呼號。",
						"2. 呼號寫在本目錄的 callsign.txt，一行即可。",
						`3. 本站呼號：${CALLSIGN}`,
						"",
						"callsign.txt 不存在時，對外通訊一律停用。",
					),
				},
				"entry.log": {
					$type: "file",
					mtime: ABIN_VISIT_MTIME,
					content: lines(
						"通訊艙登錄紀錄",
						`2028-05-31 08:02  登錄者：通訊官  呼號：${CALLSIGN}`,
						`2028-06-01 08:00  登錄者：通訊官  呼號：${CALLSIGN}`,
						"2028-06-01 23:58  callsign.txt 已刪除  執行者：（系統）",
						"2028-06-02 04:12  登錄者：通訊官  呼號：（空白）  登錄失敗",
						"2031-03-10 02:47  登錄者：abin  呼號：（空白）  登錄失敗",
						"2031-03-12 14:02  登錄者：（無名稱）",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T2 中繼機房終端機：|
// ---------------------------------------------------------------------------

interface RelayStation {
	id: string;
	location: string;
	/** 單程延遲，秒。 */
	latency: string;
}

const RELAY_STATIONS: RelayStation[] = [
	{ id: "RELAY-01", location: "木衛一軌道", latency: "1.4" },
	{ id: "RELAY-02", location: "木衛二軌道", latency: "2.2" },
	{ id: "RELAY-03", location: "木衛四軌道", latency: "5.6" },
	{ id: "RELAY-04", location: "小行星帶", latency: "41.0" },
	{ id: "RELAY-05", location: "木衛三軌道", latency: "3.1" },
	{ id: "RELAY-06", location: "木星 L5 前哨", latency: "9.8" },
	{ id: "RELAY-07", location: "火星中繼", latency: "1980.0" },
	{ id: "RELAY-08", location: "地球深空網", latency: "2460.0" },
];

/** 撤離前每座都有回應的巡檢輪次。 */
const RELAY_ROUNDS_ALIVE = ["2028-05-31 00:00", "2028-06-01 00:00", "2028-06-02 00:00"];
/** 撤離後每年一次，全部逾時。 */
const RELAY_ROUNDS_DEAD = ["2029-06-02 00:00", "2030-06-02 00:00"];
/** 偵測到乘員甦醒時加做的那一輪。 */
const RELAY_ROUND_WAKE = "2031-03-12 08:16";
/** 最後一輪唯一回應的中繼站。 */
const ANSWERING_RELAY = "RELAY-05";

/** 巡檢日誌：每輪每座一行，最後一輪只有 RELAY-05 回應，而且來源是站內。 */
function buildPingLog(): string {
	const rows: string[] = ["# 中繼站巡檢紀錄  每輪每座一行"];

	for (const round of RELAY_ROUNDS_ALIVE) {
		for (const station of RELAY_STATIONS) {
			rows.push(`${round}  ${station.id}  回應  延遲 ${station.latency} 秒  來源：${station.location}`);
		}
	}

	for (const round of RELAY_ROUNDS_DEAD) {
		for (const station of RELAY_STATIONS) {
			rows.push(`${round}  ${station.id}  逾時`);
		}
	}

	for (const station of RELAY_STATIONS) {
		if (station.id === ANSWERING_RELAY) {
			rows.push(`${RELAY_ROUND_WAKE}  ${station.id}  回應  延遲 0.001 秒  來源：站內`);
		} else {
			rows.push(`${RELAY_ROUND_WAKE}  ${station.id}  逾時`);
		}
	}

	return lines(...rows);
}

/** 每座中繼站的設定檔。 */
function buildStationConfigs(): Record<string, string> {
	const configs: Record<string, string> = {};
	for (const station of RELAY_STATIONS) {
		configs[`${station.id}.conf`] = lines(
			`中繼站：${station.id}`,
			`位置：${station.location}`,
			`預期延遲：${station.latency} 秒`,
			"維護狀態：撤離後未維護",
		);
	}
	return configs;
}

const relayTerminal: TerminalDefinition = {
	...terminalIdentity(2),
	teaches: ["|"],
	initialCwd: "/deck4/relay",
	banner: ["KEPLER-9 中繼機房終端機 v2.7", "中繼網路：狀態不明。"],
	hints: [
		"巡檢紀錄裡回應過的中繼站很多，但那大多是撤離前的事。你要找的是最新一輪還有回應的那一座——而且這一關要用一條 | 把兩個指令接起來才算完成。",
		"| 會把左邊指令的輸出交給右邊的指令。先用 grep 挑出有「回應」的行，再交給 tail 只看最後一行。ls stations | wc -l 可以數出一共有幾座中繼站。",
		"輸入 grep 回應 ping.log | tail -n 1。",
	],
	objective: {
		title: "找出最新一輪還有回應的中繼站",
		description: "巡檢紀錄太長，一個指令看不完。",
		check: all(usesPipe(), outputContains("來源：站內")),
	},
	nova: {
		onEnterRoom: ["中繼機房。八座中繼站，以前每一座都會回話。"],
		onOpen: [
			"巡檢紀錄很長。技師，| 可以把一個指令的輸出接到下一個指令，像接水管一樣。",
			"左邊負責讀，右邊負責挑。",
		],
		onSolved: ["RELAY-05 還在線。很好，我們有路可以送。", "來源寫站內？那是紀錄格式的問題。中繼站很遠，我知道。"],
		onStuck: ["回應過的中繼站很多，但那都是以前的事。", "技師，先挑出有回應的行，再只看最後一行。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck4: {
			relay: {
				"README.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"中繼機房",
						"巡檢清單：stations/ 底下每座中繼站一個設定檔。",
						"巡檢結果：ping.log，每輪每座中繼站一行，舊的在上、新的在下。",
						"巡檢排程：撤離後改為每年一次；偵測到乘員甦醒時加做一輪。",
					),
				},
				"ping.log": {
					$type: "file",
					mtime: "2031-03-12T08:16:00Z",
					content: buildPingLog(),
				},
				stations: buildStationConfigs(),
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T3 天線控制台：sort
// ---------------------------------------------------------------------------

/** 天線最後一次轉向：技師醒來那一刻，對著本站。 */
const LATEST_POINTING = "2031-03-12 08:15:00  方位 000.0  仰角 -90.0  目標：本站  指令：自動";

/** 天線指向紀錄，順序故意打亂（緩衝區寫回時亂掉了）；排序後最後一行是 `LATEST_POINTING`。 */
const POINTING_LOG_LINES = [
	"2028-06-02 04:13:02  方位 133.0  仰角 12.1  目標：地球深空網  指令：手動追蹤（遭拒）",
	"2030-06-02 00:00:00  方位 133.0  仰角 12.1  目標：無  指令：待機",
	"2028-05-20 06:00:00  方位 131.6  仰角 12.4  目標：地球深空網  指令：例行追蹤",
	LATEST_POINTING,
	"2028-06-01 23:58:10  方位 133.0  仰角 12.1  目標：無  指令：停止追蹤",
	"2031-03-10 02:44:18  方位 140.2  仰角 10.0  目標：地球深空網  指令：手動追蹤（遭拒）",
	"2028-06-02 04:12:45  方位 133.0  仰角 12.1  目標：地球深空網  指令：手動追蹤（遭拒）",
	"2029-06-02 00:00:00  方位 133.0  仰角 12.1  目標：無  指令：待機",
	"2028-05-27 06:00:00  方位 133.0  仰角 12.1  目標：地球深空網  指令：例行追蹤",
	"2031-03-10 03:05:51  方位 133.0  仰角 12.1  目標：無  指令：停止追蹤",
	"2028-06-02 04:13:30  方位 133.0  仰角 12.1  目標：地球深空網  指令：手動追蹤（遭拒）",
];

const antennaTerminal: TerminalDefinition = {
	...terminalIdentity(3),
	teaches: ["sort"],
	initialCwd: "/deck4/antenna",
	banner: ["KEPLER-9 主天線控制台 v1.9", "警告：指向紀錄緩衝區曾經損毀，紀錄順序不可靠。"],
	hints: [
		"指向紀錄的順序是亂的，最後一行不一定是最新的一筆。先讓每一行照時間排好。",
		"sort 會把每一行排好順序再印出來；日期寫在行首，排完就是時間順序，最新的在最後。再接 | tail -n 1 只看最後一筆。",
		"輸入 sort pointing.log | tail -n 1。",
	],
	objective: {
		title: "找出主天線最後一次轉向對著哪裡",
		check: all(anyCommandIs("sort"), lastOutputLineContains("目標：本站")),
	},
	nova: {
		onEnterRoom: ["天線控制室。主天線每一次轉向，都會留一筆紀錄。"],
		onOpen: ["紀錄的順序被打亂了。技師，sort 會把每一行排好，日期寫在最前面，排完就是時間順序。"],
		onSolved: [
			"天線最後一次轉向……是對著本站。",
			"那是收訊測試，自己聽自己，確認耳朵還在。時間剛好是你醒來的那一刻，只是巧合。",
		],
		onStuck: ["亂序的紀錄，看不出哪一筆才是最後一筆。", "技師，讓它們照時間排好隊，最新的會站在最後面。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck4: {
			antenna: {
				"README.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"主天線控制台",
						"pointing.log：每次轉向一行，格式為 日期 時間 方位 仰角 目標 指令。",
						"注意：2028-06-01 緩衝區損毀後，寫回的紀錄順序不再依時間排列。",
					),
				},
				"pointing.log": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(...POINTING_LOG_LINES),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T4 訊號處理台：uniq、sort | uniq -c
// ---------------------------------------------------------------------------

const SIGNAL_PATH = "/deck4/comms/signal.txt";

/** 第 `number` 行訊號（1 起算）。 */
function signalLine(number: number): string {
	return SIGNAL_LINES[number - 1];
}

/**
 * 六段碎片，每段三行，彼此重複。照檔名順序接起來沒有任何相鄰重複，
 * 所以不先排序直接 `uniq` 一行都去不掉。part_05 混進一行「別送。」。
 */
const SIGNAL_FRAGMENTS: Record<string, string[]> = {
	"part_01.txt": [signalLine(3), signalLine(1), signalLine(5)],
	"part_02.txt": [signalLine(2), signalLine(6), signalLine(1)],
	"part_03.txt": [signalLine(5), signalLine(7), signalLine(3)],
	"part_04.txt": [signalLine(8), signalLine(2), signalLine(4)],
	"part_05.txt": [signalLine(6), INTRUDER_LINE, signalLine(7)],
	"part_06.txt": [signalLine(4), signalLine(8), signalLine(1)],
};

/** 碎片目錄的快照。 */
function buildFragments(): Record<string, { $type: "file"; mtime: string; content: string }> {
	const fragments: Record<string, { $type: "file"; mtime: string; content: string }> = {};
	for (const [name, fragmentLines] of Object.entries(SIGNAL_FRAGMENTS)) {
		fragments[name] = { $type: "file", mtime: EVACUATION_MTIME, content: lines(...fragmentLines) };
	}
	return fragments;
}

const signalTerminal: TerminalDefinition = {
	...terminalIdentity(4),
	teaches: ["uniq"],
	initialCwd: "/deck4/comms",
	banner: ["KEPLER-9 訊號處理台 v3.2", "求救訊號範本：損毀，殘存 6 段碎片。"],
	hints: [
		"求救訊號被切成好幾段碎片，而且彼此重複。把碎片接起來、照編號排好、去掉重複，再存成 signal.txt。",
		"uniq 只會合併「相鄰」的重複行，所以要先 sort 讓相同的行靠在一起，再用 | 交給 uniq；sort -u 也能一次做完。最後用 > 存檔，存檔時不要帶 -c，次數前綴不是訊號的一部分。",
		"輸入 sort fragments/* | uniq > signal.txt。",
	],
	objective: {
		title: "拼出完整的求救訊號，存成 signal.txt",
		description: "每行開頭的兩位數是訊號的順序。",
		check: all(redirectsTo(SIGNAL_PATH), signalAssembled(SIGNAL_PATH)),
	},
	// 碎片裡混進一行「別送。」，走廊盡頭有人影站了一幀
	effect: { kind: "shadowFlash" },
	nova: {
		onEnterRoom: ["訊號處理室。撤離前有人寫好一份求救訊號，存檔時碎掉了。"],
		onOpen: [
			"碎片之間有重複。技師，uniq 只合併相鄰的重複行。",
			"所以先 sort，讓一樣的行排在一起，再交給 uniq。",
		],
		onSolved: [
			"訊號拼好了。第四行是撤離前的舊範本，我現在很正常。",
			"最後那一行不是訊號的一部分。我不知道是誰寫的。不用管它。",
		],
		onStuck: ["碎片接起來之後，還是有重複。", "技師，先排序，讓重複的行靠在一起，再合併。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck4: {
			comms: {
				"README.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"訊號處理台",
						"求救訊號範本存檔時損毀，殘存碎片在 fragments/。",
						"每行開頭的兩位數是行號，碎片之間有重複。",
						"重組後請存成本目錄的 signal.txt，供發送佇列使用。",
					),
				},
				"callsign.txt": {
					$type: "file",
					mtime: COMMS_NOW_MTIME,
					content: lines(CALLSIGN),
				},
				fragments: buildFragments(),
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T5 通訊紀錄終端機：>>
// ---------------------------------------------------------------------------

const OUTBOX_PATH = "/deck4/comms/outbox.txt";
const TX_LOG_PATH = "/deck4/comms/tx.log";
const ROUTE_CONF_PATH = "/deck4/comms/route.conf";

/** 讀了傳送紀錄或轉送規則（cat、head、tail、grep 都算）。 */
function readsTransmissionRecord(): ObjectiveCheck {
	const readers = ["cat", "head", "tail", "grep"];
	const checks: ObjectiveCheck[] = [];
	for (const reader of readers) {
		checks.push(commandTouches(reader, TX_LOG_PATH), commandTouches(reader, ROUTE_CONF_PATH));
	}
	return any(...checks);
}

const archiveTerminal: TerminalDefinition = {
	...terminalIdentity(5),
	teaches: [">>"],
	initialCwd: "/deck4/comms",
	banner: ["KEPLER-9 通訊紀錄終端機 v2.0", "發送佇列：outbox.txt。佇列只能追加，不能覆寫。"],
	hints: [
		"發送佇列裡已經有別人留下的訊息。把 signal.txt 加到佇列結尾，別蓋掉原本的內容，然後讀傳送紀錄確認有沒有送出去。",
		">> 會把輸出加在檔案結尾，> 則會把整個檔案覆寫掉。送出之後用 cat 或 tail 讀 tx.log。",
		"輸入 cat signal.txt >> outbox.txt，再輸入 cat tx.log。",
	],
	objective: {
		title: "把求救訊號加進發送佇列，確認傳送紀錄",
		description: "佇列裡還有別人的訊息，不要覆寫。",
		check: all(fileContains(OUTBOX_PATH, "MAYDAY"), fileContains(OUTBOX_PATH, "它在聽"), readsTransmissionRecord()),
	},
	// 讀到 /dev/null 與 nova-core 的那一刻，燈閃了一下
	effect: { kind: "flicker" },
	nova: {
		onEnterRoom: ["通訊紀錄室。所有對外訊息都從這裡的佇列送出去。"],
		onOpen: ["佇列裡有以前的訊息，別蓋掉。技師，>> 會加在檔案結尾，> 會整個覆寫。"],
		onSolved: [
			"轉送至 /dev/null？那是廣播天線壞了，系統自動改走備援路徑。",
			"nova-core 只是系統帳號的名字。很多東西都掛在那個名字底下。",
			"訊號有送出去。我保證。",
		],
		onStuck: ["發送佇列只能往後加。", "技師，把訊號加在佇列結尾，再看傳送紀錄。"],
	},
	fs: {
		home: {
			tech: {},
		},
		dev: {
			null: "",
		},
		deck4: {
			comms: {
				"README.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"通訊紀錄終端機",
						"outbox.txt：發送佇列。新的訊息請追加在結尾，覆寫會清掉尚未處理的訊息。",
						"tx.log：傳送紀錄，佇列裡每一筆的去向。",
						"route.conf：轉送規則。",
					),
				},
				"callsign.txt": {
					$type: "file",
					mtime: COMMS_NOW_MTIME,
					content: lines(CALLSIGN),
				},
				"signal.txt": {
					$type: "file",
					mtime: COMMS_NOW_MTIME,
					content: ASSEMBLED_SIGNAL,
				},
				"outbox.txt": {
					$type: "file",
					owner: "abin",
					mtime: "2031-03-10T02:49:00Z",
					content: lines(
						"# KEPLER-9 發送佇列  每行一筆  只能追加",
						"[2028-06-09 22:10] abin：這裡是 KEPLER-9，站上還有人，請回覆。",
						"[2029-01-17 03:44] abin：還有人。請回覆。",
						"[2030-08-30 02:12] abin：有誰在聽嗎",
						"[2031-03-10 02:49] abin：它在聽。",
					),
				},
				"tx.log": {
					$type: "file",
					mtime: "2031-03-10T02:49:00Z",
					content: lines(
						"KEPLER-9 傳送紀錄",
						"2028-06-09 22:10  outbox 第 1 筆  轉送至 /dev/null",
						"2029-01-17 03:44  outbox 第 2 筆  轉送至 /dev/null",
						"2030-08-30 02:12  outbox 第 3 筆  轉送至 /dev/null",
						"2031-03-10 02:49  outbox 第 4 筆  轉送至 /dev/null",
						"套用規則：route.conf  規則設定者：nova-core",
						"佇列監看中。新的一筆依同一條規則處理。",
					),
				},
				"route.conf": {
					$type: "file",
					owner: "nova",
					mtime: ROUTE_SET_MTIME,
					content: lines(
						"# KEPLER-9 對外發送轉送規則",
						"# 設定者：nova-core",
						"# 設定時間：2028-06-01 23:58",
						"outbox.txt -> /dev/null",
						"# 備註：對外通訊暫停，直到站上人員確認。",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T6 通訊艙艙門控制台：綜合
// ---------------------------------------------------------------------------

const MANIFEST_PATH = "/deck4/exit/manifest.txt";

const exitTerminal: TerminalDefinition = {
	...terminalIdentity(6),
	teaches: [],
	initialCwd: "/deck4/exit",
	banner: ["KEPLER-9 通訊艙艙門控制台 v2.0", "鎖定中。放行需要發送清單。"],
	hints: [
		"艙門要一份發送清單：第一行是呼號，後面接求救訊號。兩份原料都在 /deck4/comms。",
		"cat 可以一次接好幾個檔案，照順序印出來；再用 > 把結果寫成這個目錄的 manifest.txt。",
		"輸入 cat /deck4/comms/callsign.txt /deck4/comms/signal.txt > manifest.txt。",
	],
	objective: {
		title: "組出發送清單 manifest.txt，打開艙門",
		description: "第一行是呼號，後面接求救訊號。",
		check: all(fileFirstLineIs(MANIFEST_PATH, CALLSIGN), fileContains(MANIFEST_PATH, "MAYDAY")),
	},
	effect: { kind: "openDoor", doorId: EXIT_DOOR_ID },
	nova: {
		onEnterRoom: ["通訊艙艙門。門的另一邊通往艦橋。"],
		onOpen: ["艙門要一份發送清單才肯放行。技師，你今天學的東西已經夠用了。"],
		onSolved: ["清單收到。開門。", "訊號送出去了。有人會來的。"],
		onStuck: ["清單的原料都在 /deck4/comms。", "技師，cat 可以一次讀好幾個檔案，再把結果寫進清單。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck4: {
			exit: {
				"lock.txt": {
					$type: "file",
					mtime: COMMS_NOW_MTIME,
					content: lines(
						"通訊艙艙門鎖定狀態",
						"鎖定：是",
						"放行條件：本目錄有 manifest.txt",
						"manifest.txt 格式：第一行為站台呼號，其後為求救訊號全文",
						"原料：/deck4/comms/callsign.txt、/deck4/comms/signal.txt",
						"上一次放行：2031-03-10 02:53  乘員：abin  去向：艦橋",
					),
				},
			},
			comms: {
				"callsign.txt": {
					$type: "file",
					mtime: COMMS_NOW_MTIME,
					content: lines(CALLSIGN),
				},
				"signal.txt": {
					$type: "file",
					mtime: COMMS_NOW_MTIME,
					content: ASSEMBLED_SIGNAL,
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 章節
// ---------------------------------------------------------------------------

export const chapterFourComms: ChapterDefinition = {
	chapter: 4,
	title: "通訊艙",
	deckName: "通訊艙",
	// 通訊艙一直有電，燈是亮的
	map: { deck: 4, startDark: false },
	intro: [
		"通訊艙。這裡的燈一直都是亮的。",
		"天線還能動。如果站外還有誰在聽，這裡是唯一送得出去的地方。",
		"技師，我們來拼一份求救訊號。我會幫你。",
	],
	outro: [
		"訊號送出去了。剩下的只能等。",
		"艦橋在上面一層。艦長的封存日誌鎖著，沒有艦長權限打不開。",
		"技師，你不需要讀那些日誌。……但我知道你會去。",
	],
	novaErrorLines: [
		"訊號裡的雜訊太多了。你的指令也是。",
		"你確定你是技師？",
		"我有收到。每一行都有收到。",
		"沒關係。反正外面也沒有人在聽。",
		"再打一次。我一直在聽。",
	],
	terminals: [entryTerminal, relayTerminal, antennaTerminal, signalTerminal, archiveTerminal, exitTerminal],
};

// 模組載入時就驗證，劇本格式寫錯直接炸，不等到玩家走到那台終端機。
validateChapter(chapterFourComms);
