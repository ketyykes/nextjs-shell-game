/**
 * 第一章：冷凍艙與維生艙。
 *
 * M2 階段只放 T1 冷凍艙控制台，讓 /play 頁面能打指令看結果；
 * T2 到 T6、目標判定、NOVA 台詞與觸發條件在 M5-2 補齊（設計文件 4.4）。
 * 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 */

import type { ChapterDefinition, TerminalDefinition } from "./types";

/** 撤離是三年前，喚醒排程被改是「兩天前」之前的事；mtime 用 UTC，`ls -l` 直接顯示。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
const SCHEDULE_CHANGED_MTIME = "2031-03-10T03:07:00Z";

const cryoTerminal: TerminalDefinition = {
	id: "ch1-t1",
	title: "冷凍艙控制台",
	teaches: ["pwd", "ls", "cat"],
	initialCwd: "/home/tech",
	banner: ["KEPLER-9 冷凍艙控制台 v2.3", "低功率模式。輸入 help 查看可用指令。"],
	hints: [
		"先搞清楚你在哪裡、周圍有什麼。終端機裡「看」的方式是用指令。",
		"試試 ls，它會列出這個目錄裡的東西。看到檔案之後，用 cat 讀它。",
		"輸入 ls，然後輸入 cat wake_up.txt。喚醒排程寫在那個檔案裡。",
	],
	fs: {
		home: {
			tech: {
				pod_01: {
					$type: "dir",
					mtime: EVACUATION_MTIME,
					children: {
						"status.txt": "艙位：pod_01\n狀態：空\n最後開啟：撤離日\n",
					},
				},
				pod_02: {
					$type: "dir",
					mtime: EVACUATION_MTIME,
					children: {
						"status.txt": "艙位：pod_02\n狀態：空\n最後開啟：撤離日\n",
					},
				},
				pod_03: {
					$type: "dir",
					mtime: EVACUATION_MTIME,
					children: {
						"status.txt": "艙位：pod_03\n狀態：空\n最後開啟：撤離日\n",
					},
				},
				pod_04: {
					$type: "dir",
					mtime: EVACUATION_MTIME,
					children: {
						"status.txt": "艙位：pod_04\n狀態：空\n最後開啟：撤離日\n",
					},
				},
				pod_05: {
					$type: "dir",
					mtime: EVACUATION_MTIME,
					children: {
						"status.txt": "艙位：pod_05\n狀態：空\n最後開啟：撤離日\n",
					},
				},
				pod_06: {
					$type: "dir",
					mtime: SCHEDULE_CHANGED_MTIME,
					children: {
						"status.txt": "艙位：pod_06\n狀態：已喚醒\n最後開啟：剛才\n",
					},
				},
				"wake_up.txt": {
					$type: "file",
					mtime: SCHEDULE_CHANGED_MTIME,
					content: [
						"冷凍艙喚醒排程",
						"================",
						"pod_01 到 pod_05：不適用（空艙）",
						"pod_06：",
						"  原始設定：永不",
						"  目前設定：撤離後三年",
						"  修改者：",
						"  修改時間：見檔案日期",
						"",
						"備註：船員名單共五人。",
						"",
					].join("\n"),
				},
				"crew_manifest.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: [
						"KEPLER-9 船員名單",
						"1. 艦長",
						"2. 工程師",
						"3. 醫官",
						"4. 通訊官",
						"5. 阿彬",
						"",
					].join("\n"),
				},
			},
		},
	},
};

export const chapterOneLifeSupport: ChapterDefinition = {
	chapter: 1,
	title: "冷凍艙與維生艙",
	terminals: [cryoTerminal],
};

/** 依 id 找終端機定義，找不到回傳 undefined。 */
export function findTerminal(id: string): TerminalDefinition | undefined {
	return chapterOneLifeSupport.terminals.find((terminal) => terminal.id === id);
}
