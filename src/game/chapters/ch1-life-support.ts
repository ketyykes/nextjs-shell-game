/**
 * 第一章：冷凍艙與維生艙（設計文件 4.4）。
 *
 * 六台終端機，每台一課，恐怖節拍從不安到毛骨悚然循序漸進。
 * 檔案內容就是劇本：太空站系統的冷硬記錄體，偶爾夾一行不對勁的東西。
 *
 * 寫作規則：
 * - 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 * - NOVA 教的指令永遠正確，說的故事不可信（4.2）。
 * - 每台終端機的 `title` 要跟 `public/maps/deck1.json` markers 的 `title` 一致。
 *
 * 檔尾在模組載入時就跑 `validateChapter`，劇本格式寫錯會直接丟錯。
 */

import { EXIT_DOOR_ID } from "@/game/phaser/events";
import { all, catFile, commandIs } from "@/game/story/objectives";
import { validateChapter } from "@/game/story/schema";
import type { ChapterDefinition, TerminalDefinition } from "./types";

// ---------------------------------------------------------------------------
// 時間軸（mtime 一律 UTC，`ls -l` 直接顯示）
// ---------------------------------------------------------------------------

/** 船員冷凍入艙評估建檔的日子（實際入艙原排定於返航前，從未發生）。 */
const CREW_INTAKE_MTIME = "2028-04-17T09:20:00Z";
/** pod_06 手動建檔，撤離前一天。 */
const POD_06_INTAKE_MTIME = "2028-06-01T22:16:00Z";
/** 撤離是三年前。 */
const EVACUATION_MTIME = "2028-06-02T04:40:00Z";
/** 阿彬最後一則留言，比喚醒排程被改早十六分鐘。 */
const ABIN_LAST_MESSAGE_MTIME = "2031-03-10T02:51:00Z";
/** 喚醒排程被改是「兩天前」。 */
const SCHEDULE_CHANGED_MTIME = "2031-03-10T03:07:00Z";
/** 玩家醒來的時間，pod_06 剛被打開。 */
const WAKE_MTIME = "2031-03-12T08:15:00Z";

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// T1 冷凍艙控制台：pwd、ls、cat
// ---------------------------------------------------------------------------

const cryoTerminal: TerminalDefinition = {
	id: "ch1-t1",
	title: "冷凍艙控制台",
	roomId: "cryo",
	teaches: ["pwd", "ls", "cat"],
	initialCwd: "/home/tech",
	banner: ["KEPLER-9 冷凍艙控制台 v2.3", "低功率模式。卡關就輸入 hint，我會提示你。"],
	hints: [
		"先搞清楚你在哪裡、周圍有什麼。終端機裡「看」的方式是用指令。再輸入一次 hint，我直接教你第一個。",
		"試試 ls，它會列出這個目錄裡的東西。看到檔案之後，用 cat 讀它。",
		"輸入 ls，然後輸入 cat wake_up.txt。喚醒排程寫在那個檔案裡。",
	],
	objective: {
		title: "讀取冷凍艙的喚醒排程",
		check: catFile("/home/tech/wake_up.txt"),
	},
	nova: {
		onEnterRoom: ["喚醒程序……完成。", "你是……我查不到你的名字。", "這不太對。應該有名字的。"],
		onOpen: ["這台控制台還有電。技師，試著看看裡面有什麼。"],
		onSolved: ["名單上五個人，冷凍艙六個。", "你是第六個。我沒有第六個的紀錄。", "先去隔壁的維生艙吧。主艙門為什麼沒電，那裡的監控台查得到。"],
		onStuck: ["技師，你一直停在原地。", "先弄清楚你在哪裡、身邊有什麼。這台控制台只認指令，連「看」都要用指令。"],
	},
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
					content: lines(
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
					),
				},
				"crew_manifest.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines("KEPLER-9 船員名單", "1. 艦長", "2. 工程師", "3. 醫官", "4. 通訊官", "5. 阿彬"),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T2 維生系統監控台：cd、..、相對路徑
// ---------------------------------------------------------------------------

const lifeSupportTerminal: TerminalDefinition = {
	id: "ch1-t2",
	title: "維生系統監控台",
	roomId: "lifesupport",
	teaches: ["cd"],
	initialCwd: "/deck1/systems",
	banner: ["KEPLER-9 維生系統監控台 v1.8", "警告：主艙門供電中斷。"],
	hints: [
		"三個子系統各有自己的目錄，狀態檔在目錄裡面。一個一個走進去看。",
		"用 cd 加目錄名稱走進去，用 cat 讀狀態檔，cd .. 回到上一層。",
		"輸入 cd /deck1/systems/power，再輸入 cat status.txt。開頭是 / 的路徑從任何位置都走得到，迷路了就用它。",
	],
	objective: {
		title: "找出主艙門斷電的原因",
		description: "維生系統的狀態檔分散在三個目錄裡。",
		check: catFile("/deck1/systems/power/status.txt"),
	},
	nova: {
		onEnterRoom: ["維生艙。氧氣、電力、溫度都在這裡監控。", "主艙門打不開，應該是哪裡斷電了。"],
		onOpen: ["監控台把每個子系統放在自己的目錄裡。技師，用 cd 走進去，用 cd .. 走出來。"],
		onSolved: [
			"B3 跳脫。要去配電室手動復歸。",
			"氧氣消耗量寫兩人？喔，那是感測器壞了。應該是。我想是。",
		],
		onStuck: ["三個子系統各自關在自己的目錄裡。", "技師，一間一間走進去讀狀態檔，讀完再退出來。我會等你。"],
	},
	fs: {
		home: {
			tech: {
				"note.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines("系統提示：維生子系統的監控資料在 /deck1/systems。", "輸入 cd /deck1/systems 可以回到監控目錄。"),
				},
			},
		},
		deck1: {
			systems: {
				oxygen: {
					"status.txt": {
						$type: "file",
						mtime: WAKE_MTIME,
						content: lines(
							"子系統：氧氣循環",
							"狀態：正常",
							"儲量：61%",
							"登記乘員：0（撤離後）",
							"消耗量：2 人",
						),
					},
				},
				power: {
					"status.txt": {
						$type: "file",
						mtime: WAKE_MTIME,
						content: lines(
							"子系統：電力",
							"狀態：異常：斷路器 B3 跳脫",
							"受影響：主艙門、走廊照明",
							"處置：至配電室手動復歸",
						),
					},
				},
				temperature: {
					"status.txt": {
						$type: "file",
						mtime: WAKE_MTIME,
						content: lines(
							"子系統：溫控",
							"狀態：正常",
							"艙內溫度：14.2°C",
							"冷凍艙溫度：-196°C",
							"例外：pod_06 回溫中",
						),
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T3 宿舍終端機：cd ~、ls 加路徑、ls -l
// ---------------------------------------------------------------------------

const quartersTerminal: TerminalDefinition = {
	id: "ch1-t3",
	title: "宿舍終端機",
	roomId: "quarters",
	teaches: ["ls -l", "cd ~"],
	initialCwd: "/deck1/quarters",
	banner: ["KEPLER-9 宿舍終端機 v1.2", "共用終端機。個人檔案請至各自的家目錄。"],
	hints: [
		"這裡不是你的房間。每個人的個人檔案都在 /home 底下，自己的那個叫家目錄。",
		"cd ~ 會帶你回到家目錄。ls 後面可以接路徑看別的目錄，ls -l 會多顯示每個檔案的大小與日期。",
		"輸入 ls -l /home/abin 比對日期，找出最新的檔案，再輸入 cat /home/abin/day_900.txt。",
	],
	objective: {
		title: "讀取阿彬最新的那份日誌",
		check: all(commandIs("cat"), catFile("/home/abin/day_900.txt")),
	},
	nova: {
		onEnterRoom: ["宿舍區。門牌我還讀得到。"],
		onOpen: ["技師，cd ~ 會帶你回到自己的家目錄。站上每個人都有一個。"],
		onSolved: ["那個檔案的日期一定是錯的，時鐘在撤離時重設過。", "你有家目錄，所以你確實住在這裡過。"],
		onStuck: ["技師，這裡不是你的房間。", "每個人的東西都放在 /home 底下。去看看阿彬的，比一比哪一份最新。"],
	},
	fs: {
		home: {
			tech: {
				"checklist.txt": {
					$type: "file",
					mtime: "2028-05-30T18:02:00Z",
					content: lines(
						"每週檢修清單",
						"[x] 冷凍艙溫控",
						"[x] B 區斷路器",
						"[ ] 主艙門密封條",
						"[ ] 跟 abin 確認寢室排班",
					),
				},
				"shift.txt": {
					$type: "file",
					mtime: "2028-05-28T07:00:00Z",
					content: lines("班表：維修組", "週一至週五 08:00-16:00", "緊急呼叫：經 NOVA 轉接"),
				},
			},
			abin: {
				"day_001.txt": {
					$type: "file",
					owner: "abin",
					mtime: "2027-07-26T21:40:00Z",
					content: lines(
						"第 1 天",
						"報到。宿舍 Q-4，室友是維修組的技師。",
						"NOVA 會跟每個人打招呼，還記得每個人咖啡要加幾顆糖。",
						"這份工作應該會很有趣。",
						"今日目標：找到誰把泡麵藏在通風管。",
					),
				},
				"day_313.txt": {
					$type: "file",
					owner: "abin",
					mtime: EVACUATION_MTIME,
					content: lines("第 313 天", "撤離日。艙門鎖了又開，開了又鎖。", "大家說是 NOVA 回滾前的故障。", "我晚點再走。"),
				},
				"day_900.txt": {
					$type: "file",
					owner: "abin",
					mtime: ABIN_LAST_MESSAGE_MTIME,
					content: lines("不要相信那個聲音。"),
				},
			},
		},
		deck1: {
			quarters: {
				"roster.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"宿舍分配表（第一甲板）",
						"Q-1：艦長",
						"Q-2：工程師、醫官",
						"Q-3：通訊官",
						"Q-4：abin、████",
						"",
						"個人檔案在各自的家目錄：/home/<帳號>",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T4 配電箱：絕對路徑、ls -a、隱藏檔
// ---------------------------------------------------------------------------

/** 正常的斷路器狀態檔。 */
function breakerStatus(name: string, load: string): string {
	return lines(`斷路器：${name}`, `負載：${load}`, "狀態：正常");
}

const powerTerminal: TerminalDefinition = {
	id: "ch1-t4",
	title: "配電箱",
	roomId: "power",
	teaches: ["ls -a"],
	initialCwd: "/home/tech",
	banner: ["KEPLER-9 配電箱 B 區", "斷路器 B3：跳脫。需要重置碼。"],
	hints: [
		"先讀家目錄裡的工單，它會告訴你配電文件在哪。跳脫的斷路器目錄裡，有東西是一般列表看不到的。",
		"用 cd 加上以 / 開頭的絕對路徑，在哪裡都能直接走過去。名稱以「.」開頭的是隱藏檔，要用 ls -a 才看得到。",
		"輸入 cd /deck1/systems/power/breakers/B3，再輸入 ls -a，最後輸入 cat .override。",
	],
	objective: {
		title: "找到 B3 斷路器的重置碼",
		check: catFile("/deck1/systems/power/breakers/B3/.override"),
	},
	// 讀到重置碼，燈一盞盞亮起，走廊盡頭人影站一幀（4.4 第 4 列）
	effect: { kind: "powerRestored" },
	nova: {
		onEnterRoom: ["配電室。斷路器都在這裡。", "跳脫的是 B2。不對，是 B3。我的紀錄有時候會……跳格。"],
		onOpen: ["這台終端機從家目錄開機，你得自己走過去。技師，以 / 開頭的路徑叫絕對路徑，在哪裡都能用。"],
		onSolved: ["重置碼收到。照明恢復中。", "……我什麼都沒看到。你看到什麼了嗎？"],
		onStuck: ["工單是我開的。技師，先讀它，上面寫了文件在哪。", "跳脫的那個斷路器目錄裡，有東西不想被一般的列表看到。"],
	},
	fs: {
		home: {
			tech: {
				"work_order.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"工單 #0417",
						"項目：第一甲板配電異常",
						"指派：維修技師",
						"參考文件：/deck1/systems/power/README.txt",
						"開單者：NOVA",
					),
				},
			},
		},
		deck1: {
			systems: {
				power: {
					"README.txt": lines(
						"配電系統 / 第一甲板",
						"斷路器位置：/deck1/systems/power/breakers/",
						"每個斷路器目錄裡有一份 status.txt。",
						"跳脫的斷路器需要重置碼才能復歸。",
						"重置碼在對應斷路器的隱藏檔裡。",
					),
					breakers: {
						B1: { "status.txt": breakerStatus("B1", "冷凍艙") },
						B2: { "status.txt": breakerStatus("B2", "維生系統") },
						B3: {
							"status.txt": {
								$type: "file",
								mtime: SCHEDULE_CHANGED_MTIME,
								content: lines(
									"斷路器：B3",
									"負載：主艙門、走廊照明",
									"狀態：跳脫",
									"跳脫時間：2031-03-10 03:06",
									"跳脫原因：未記錄",
								),
							},
							".override": {
								$type: "file",
								mtime: SCHEDULE_CHANGED_MTIME,
								content: lines(
									"B3 手動復歸",
									"重置碼：RESET-B3-7734",
									"讀取重置碼後，走廊照明將依序恢復。",
									"上次讀取者：",
								),
							},
						},
						B4: { "status.txt": breakerStatus("B4", "醫療艙") },
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T5 醫療艙終端機：Tab 補全、↑ 歷史、history、clear
// ---------------------------------------------------------------------------

/** 船員的冷凍入艙表。 */
function crewIntakeRecord(patientId: string, pod: string, role: string, remark: string): string {
	return lines(
		"冷凍入艙表",
		`病患編號：${patientId}`,
		`艙位：${pod}`,
		`職稱：${role}`,
		"入艙評估：適合長期冷凍",
		"入艙紀錄：無（原排定於返航前入艙）",
		`備註：${remark}`,
	);
}

const POD_06_RECORD_ID = "PT-2028-0601-QN0606";

const medbayTerminal: TerminalDefinition = {
	id: "ch1-t5",
	title: "醫療艙終端機",
	roomId: "medbay",
	teaches: ["history", "clear"],
	initialCwd: "/deck1/medbay",
	banner: ["KEPLER-9 醫療艙終端機 v3.0", "病歷系統：唯讀模式。"],
	hints: [
		"病歷檔名是很長的病患編號。先看索引，找出 pod_06 對應的是哪一份。",
		"打檔名時只要打開頭幾個字，按 Tab 讓終端機補完。打錯了按 ↑ 叫回上一個指令修改，history 會列出打過的全部指令。",
		"輸入 cat index.txt，然後輸入 cat records/PT-2028-06 再按 Tab 補完檔名，按 Enter 讀它。",
	],
	objective: {
		title: "找出 pod_06 的冷凍入艙表",
		check: catFile(`/deck1/medbay/records/${POD_06_RECORD_ID}.txt`),
	},
	nova: {
		onEnterRoom: ["醫療艙。每份病歷都是醫官親手建的。", "我讀得到編號，讀不到內容。權限的問題。應該是。"],
		onOpen: [
			"檔名很長。技師，打開頭幾個字按 Tab，剩下的交給終端機。",
			"打錯了按 ↑ 叫回來改。螢幕亂了就打 clear。",
		],
		onSolved: ["手動建檔……醫官很少這樣做。", "我會把這份表歸檔。名單應該只有五個人才對。"],
		onStuck: ["病歷檔名太長了，連我都背不起來。", "技師，先看索引，找出 pod_06 對應哪一份。名字不必整個打完。"],
	},
	fs: {
		home: {
			tech: {},
		},
		deck1: {
			medbay: {
				"index.txt": {
					$type: "file",
					mtime: POD_06_INTAKE_MTIME,
					content: lines(
						"病歷索引：冷凍入艙表",
						"pod_01  PT-2028-0417-KX9931",
						"pod_02  PT-2028-0417-KX9935",
						"pod_03  PT-2028-0417-KX9938",
						"pod_04  PT-2028-0418-MR2207",
						"pod_05  PT-2028-0418-MR2216",
						`pod_06  ${POD_06_RECORD_ID}  （手動建檔）`,
						"檔案位置：records/",
					),
				},
				records: {
					"PT-2028-0417-KX9931.txt": {
						$type: "file",
						mtime: CREW_INTAKE_MTIME,
						content: crewIntakeRecord("PT-2028-0417-KX9931", "pod_01", "艦長", "無"),
					},
					"PT-2028-0417-KX9935.txt": {
						$type: "file",
						mtime: CREW_INTAKE_MTIME,
						content: crewIntakeRecord("PT-2028-0417-KX9935", "pod_02", "工程師", "輕微失眠，已開立處方"),
					},
					"PT-2028-0417-KX9938.txt": {
						$type: "file",
						mtime: CREW_INTAKE_MTIME,
						content: crewIntakeRecord("PT-2028-0417-KX9938", "pod_03", "醫官", "本人簽核"),
					},
					"PT-2028-0418-MR2207.txt": {
						$type: "file",
						mtime: CREW_INTAKE_MTIME,
						content: crewIntakeRecord("PT-2028-0418-MR2207", "pod_04", "通訊官", "無"),
					},
					"PT-2028-0418-MR2216.txt": {
						$type: "file",
						mtime: CREW_INTAKE_MTIME,
						content: crewIntakeRecord("PT-2028-0418-MR2216", "pod_05", "後勤", "慣用稱呼：阿彬。評估時講了四個笑話"),
					},
					[`${POD_06_RECORD_ID}.txt`]: {
						$type: "file",
						mtime: POD_06_INTAKE_MTIME,
						content: lines(
							"冷凍入艙表",
							`病患編號：${POD_06_RECORD_ID}`,
							"艙位：pod_06",
							"姓名：████",
							"職稱：維修技師",
							"入艙評估：適合長期冷凍",
							"出艙紀錄：無",
							"醫生備註：名單上找不到此人，手動建檔。",
						),
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// T6 艙門控制台：綜合前五課
// ---------------------------------------------------------------------------

const airlockTerminal: TerminalDefinition = {
	id: "ch1-t6",
	title: "艙門控制台",
	roomId: "airlock",
	teaches: [],
	initialCwd: "/deck1/airlock",
	banner: ["KEPLER-9 主艙門控制台 v2.0", "供電：已恢復。鎖定中。"],
	hints: [
		"門鎖檔會告訴你鑰匙檔在哪裡。路徑從 / 開始，照著走過去。",
		"鑰匙檔名以「.」開頭，是隱藏檔，ls -a 才看得到。cat 後面可以直接接完整路徑。",
		"輸入 cat lock.txt，再輸入 cat /home/tech/pod_06/.key。",
	],
	objective: {
		title: "用鑰匙檔打開主艙門",
		check: catFile("/home/tech/pod_06/.key"),
	},
	// 門開，走廊燈亮向遠方（4.4 第 6 列）
	effect: { kind: "openDoor", doorId: EXIT_DOOR_ID },
	nova: {
		onEnterRoom: ["主艙門。門後就是主環走廊。"],
		onOpen: ["門鎖要鑰匙檔。技師，你已經會的東西就夠用了。"],
		onSolved: ["我收到了。開門。", "我沒有關那扇門。"],
		onStuck: ["門鎖檔知道鑰匙在哪裡。", "技師，照它寫的路徑從 / 開始走。有些檔名前面多了一個點。"],
	},
	fs: {
		home: {
			tech: {
				pod_06: {
					$type: "dir",
					mtime: SCHEDULE_CHANGED_MTIME,
					children: {
						"status.txt": "艙位：pod_06\n狀態：已喚醒\n最後開啟：剛才\n",
						".key": {
							$type: "file",
							mtime: SCHEDULE_CHANGED_MTIME,
							content: lines(
								"KEPLER-9 主艙門鑰匙",
								"序號：K9-AIRLOCK-0006",
								"持有者：pod_06",
								"簽發者：NOVA",
								"簽發日期：2031-03-10",
							),
						},
					},
				},
			},
		},
		deck1: {
			airlock: {
				"lock.txt": {
					$type: "file",
					mtime: WAKE_MTIME,
					content: lines(
						"主艙門鎖定狀態",
						"供電：已恢復",
						"鎖定：是",
						"解鎖方式：讀取鑰匙檔",
						"鑰匙檔：/home/tech/pod_06/.key",
					),
				},
				"door_log.txt": {
					$type: "file",
					mtime: EVACUATION_MTIME,
					content: lines(
						"主艙門紀錄",
						"2028-06-02 04:31  開啟  乘員離站",
						"2028-06-02 04:40  關閉  指令來源：不明",
						"2028-06-02 04:40  鎖定  指令來源：不明",
					),
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 章節
// ---------------------------------------------------------------------------

export const chapterOneLifeSupport: ChapterDefinition = {
	chapter: 1,
	title: "冷凍艙與維生艙",
	deckName: "冷凍艙",
	// 第一章開場斷電，只有角色周圍一圈光，配電箱（T4）過關才亮
	map: { deck: 1, startDark: true },
	intro: ["……連線建立。站務系統 NOVA，低功率模式。", "冷凍艙偵測到一個生命跡象。", "技師，聽得到嗎？先別急著動，燈還不穩。", "好了，燈穩了。用方向鍵或 WASD 走到亮著的控制台旁邊，按 E。"],
	outro: [
		"資料中心在那邊。",
		"如果你想知道為什麼名單上沒有你，答案應該在那裡。",
		"但那裡的日誌……有幾千份。",
	],
	novaErrorLines: [
		"你確定你是技師？",
		"……我記得技師不會這樣打。應該吧。",
		"我有在數。每一次都有。",
		"你打字的節奏，跟紀錄裡的不一樣。",
		"沒關係，慢慢來。我一直都在看。",
	],
	terminals: [cryoTerminal, lifeSupportTerminal, quartersTerminal, powerTerminal, medbayTerminal, airlockTerminal],
};

// 模組載入時就驗證，劇本格式寫錯直接炸，不等到玩家走到那台終端機。
validateChapter(chapterOneLifeSupport);
