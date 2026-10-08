/**
 * 沙盒練習模式的資料（M14-3，設計文件 4.11）。
 *
 * 一組讓所有指令都有東西可以練的檔案系統、環境變數、程序清單，加上開場的歡迎行與 `hint` 的練習建議。
 * 設定成站上給技師用的「訓練模擬環境」，時間落在站點正常運作的 2027 年，不碰主線劇情。
 *
 * 寫作規則：
 * - 跟劇本一樣不指涉性別（不用「他」「她」，連「其他」都會被擋，改寫成「別的」）。
 * - 不劇透主線：不提 NOVA、阿彬、回滾、名單、冷凍艙、撤離。`practice.test.ts` 會檢查。
 * - 檔案數與大小不受劇本的 40 檔／20 KB 限制（沙盒不存檔），但測試仍設上限保持合理。
 */

import type { FsSnapshot, FsSnapshotFile, ProcessInfo } from "@/game/shell/types";
import { HOME_DIR } from "@/game/shell/types";

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/** 帶 mtime 的檔案，`ls -l` 的日期才有變化。 */
function file(content: string, mtime: string, mode?: string): FsSnapshotFile {
	if (mode === undefined) {
		return { $type: "file", content, mtime };
	}
	return { $type: "file", content, mtime, mode };
}

const LOG_DIR = `${HOME_DIR}/logs`;
const PRACTICE_DIR = `${HOME_DIR}/practice`;

// ---------------------------------------------------------------------------
// 日誌：head、tail、wc、grep、sort、uniq 的練習材料
// ---------------------------------------------------------------------------

/** 感測器日誌：30 行，INFO／WARN／ERROR 混在一起，grep 找得到東西。 */
const SENSORS_LOG = lines(
	"2027-08-14T06:00:02Z INFO  sensor=temp-d2 value=21.4C",
	"2027-08-14T06:00:02Z INFO  sensor=o2-d2 value=20.9%",
	"2027-08-14T06:05:02Z INFO  sensor=temp-d2 value=21.5C",
	"2027-08-14T06:05:02Z INFO  sensor=o2-d2 value=20.9%",
	"2027-08-14T06:10:02Z WARN  sensor=temp-d3 value=27.8C note=冷卻風扇轉速偏低",
	"2027-08-14T06:10:02Z INFO  sensor=o2-d3 value=20.8%",
	"2027-08-14T06:15:02Z INFO  sensor=temp-d3 value=26.1C",
	"2027-08-14T06:15:02Z INFO  sensor=hum-d1 value=41%",
	"2027-08-14T06:20:02Z ERROR sensor=pres-d4 value=--- note=讀值逾時",
	"2027-08-14T06:20:02Z INFO  sensor=temp-d1 value=20.7C",
	"2027-08-14T06:25:02Z INFO  sensor=pres-d4 value=101.2kPa",
	"2027-08-14T06:25:02Z INFO  sensor=hum-d1 value=42%",
	"2027-08-14T06:30:02Z WARN  sensor=hum-d5 value=68% note=濕度偏高",
	"2027-08-14T06:30:02Z INFO  sensor=temp-d5 value=22.0C",
	"2027-08-14T06:35:02Z INFO  sensor=o2-d5 value=20.9%",
	"2027-08-14T06:35:02Z INFO  sensor=temp-d2 value=21.6C",
	"2027-08-14T06:40:02Z ERROR sensor=temp-d6 value=--- note=感測器離線",
	"2027-08-14T06:40:02Z INFO  sensor=o2-d1 value=21.0%",
	"2027-08-14T06:45:02Z WARN  sensor=temp-d3 value=28.4C note=冷卻風扇轉速偏低",
	"2027-08-14T06:45:02Z INFO  sensor=hum-d2 value=39%",
	"2027-08-14T06:50:02Z INFO  sensor=pres-d4 value=101.3kPa",
	"2027-08-14T06:50:02Z INFO  sensor=temp-d6 value=19.9C",
	"2027-08-14T06:55:02Z WARN  sensor=o2-d4 value=19.6% note=接近下限",
	"2027-08-14T06:55:02Z INFO  sensor=temp-d4 value=21.1C",
	"2027-08-14T07:00:02Z ERROR sensor=pres-d4 value=--- note=讀值逾時",
	"2027-08-14T07:00:02Z INFO  sensor=o2-d4 value=20.4%",
	"2027-08-14T07:05:02Z WARN  sensor=hum-d5 value=71% note=濕度偏高",
	"2027-08-14T07:05:02Z INFO  sensor=temp-d3 value=24.9C",
	"2027-08-14T07:10:02Z ERROR sensor=temp-d6 value=--- note=感測器離線",
	"2027-08-14T07:10:02Z INFO  sensor=temp-d2 value=21.4C",
);

/** 艙門存取紀錄：同一扇門被同一個帳號開好幾次，`sort | uniq -c` 數得出次數。 */
const ACCESS_LOG = lines(
	"door=lab-a user=tech action=open",
	"door=galley user=ops03 action=open",
	"door=lab-a user=tech action=open",
	"door=airlock-2 user=eng01 action=open",
	"door=galley user=tech action=open",
	"door=medbay user=med02 action=open",
	"door=lab-a user=sci04 action=open",
	"door=galley user=ops03 action=open",
	"door=lab-a user=tech action=open",
	"door=airlock-2 user=eng01 action=denied",
	"door=airlock-2 user=eng01 action=open",
	"door=galley user=tech action=open",
	"door=medbay user=med02 action=open",
	"door=storage user=tech action=open",
	"door=galley user=ops03 action=open",
	"door=lab-a user=sci04 action=open",
	"door=storage user=tech action=denied",
	"door=storage user=tech action=open",
	"door=galley user=med02 action=open",
	"door=lab-a user=tech action=open",
	"door=airlock-2 user=eng01 action=open",
	"door=galley user=ops03 action=open",
);

/** 電力日誌：短一點，練 cat 與 tail -n。 */
const POWER_LOG = lines(
	"2027-08-14T05:00:00Z 主匯流排 A 輸出 98%",
	"2027-08-14T05:00:00Z 主匯流排 B 輸出 97%",
	"2027-08-14T06:00:00Z 主匯流排 A 輸出 98%",
	"2027-08-14T06:00:00Z 主匯流排 B 輸出 91% 備註=例行切換測試",
	"2027-08-14T07:00:00Z 主匯流排 A 輸出 99%",
	"2027-08-14T07:00:00Z 主匯流排 B 輸出 97%",
	"2027-08-14T08:00:00Z 太陽翼 3 號角度校正完成",
	"2027-08-14T09:00:00Z 主匯流排 A 輸出 98%",
	"2027-08-14T09:00:00Z 主匯流排 B 輸出 98%",
	"2027-08-14T10:00:00Z 例行檢查結束，沒有異常",
);

// ---------------------------------------------------------------------------
// 檔案系統
// ---------------------------------------------------------------------------

const README = lines(
	"Kepler-9 技師訓練模擬環境",
	"========================",
	"這是一台練習機，裡面的檔案都可以隨便看、隨便改、隨便刪。",
	"改壞了也沒關係，按畫面上方的「重置」就會還原成剛進來的樣子。",
	"",
	"家目錄裡有：",
	"  notes/     幾份筆記（裡面還藏了一份草稿，ls -a 才看得到）",
	"  logs/      感測器、艙門、電力三份日誌，練 head、tail、wc、grep、sort、uniq",
	"  practice/  排序與比對用的小檔案",
	"  archive/   一層一層的週報資料夾，練 cd 與 find",
	"  locked/    一份讀不到的檔案，練 ls -l 與 chmod",
	"  trash/     一堆暫存檔，練 rm 與萬用字元 *",
	"",
	"家目錄本身也有隱藏檔，用 ls -a 找找看。",
	"站上的程序用 ps 或 top 看，環境變數用 env 看。",
	"不知道下一步練什麼，就輸入 hint。",
);

const ARCHIVE_STAMP = "2027-08-01T09:00:00Z";

export const SANDBOX_FS: FsSnapshot = {
	home: {
		tech: {
			"README.txt": file(README, "2027-08-14T05:30:00Z"),
			".welcome": file(
				lines("找到隱藏檔了！", "檔名用 . 開頭的檔案平常不會列出來，要用 ls -a 才看得到。"),
				"2027-08-14T05:30:00Z",
			),
			".config": {
				"terminal.conf": file(
					lines("# 終端機設定（練習用）", "prompt_color=steel-blue", "history_size=200", "bell=off"),
					"2027-07-02T12:00:00Z",
				),
			},
			notes: {
				"todo.txt": file(
					lines(
						"[ ] 校正第三甲板的溫度感測器",
						"[x] 更換廚房的濾網",
						"[ ] 檢查 2 號氣閘的密封條",
						"[ ] 整理 trash 裡的暫存檔",
						"[x] 備份感測器日誌",
					),
					"2027-08-13T21:10:00Z",
				),
				"supply_request.txt": file(
					lines("補給申請（下一趟補給船）", "- 濾網 x4", "- 密封條 x2", "- 咖啡豆 x10"),
					"2027-08-12T15:45:00Z",
				),
				".draft.txt": file(
					lines("草稿：值班交接時記得提醒下一班，第三甲板的冷卻風扇還沒換。"),
					"2027-08-13T22:02:00Z",
				),
			},
			logs: {
				"sensors.log": file(SENSORS_LOG, "2027-08-14T07:10:02Z"),
				"access.log": file(ACCESS_LOG, "2027-08-14T07:30:00Z"),
				"power.log": file(POWER_LOG, "2027-08-14T10:00:00Z"),
			},
			practice: {
				"samples.txt": file(
					lines("冰晶", "硫磺", "矽酸鹽", "冰晶", "鐵鎳", "硫磺", "冰晶", "橄欖石", "矽酸鹽", "冰晶"),
					"2027-08-10T11:00:00Z",
				),
				"numbers.txt": file(lines("42", "7", "108", "3", "65", "21", "9", "250"), "2027-08-10T11:05:00Z"),
				"inventory.csv": file(
					lines(
						"item,deck,qty",
						"濾網,2,12",
						"密封條,4,3",
						"保險絲,1,40",
						"螺絲組,3,25",
						"冷卻液,3,6",
						"手電筒,1,8",
					),
					"2027-08-11T09:30:00Z",
				),
				compare: {
					"config_old.conf": file(
						lines("fan_speed=1200", "alarm=on", "log_level=info", "backup=daily"),
						"2027-07-20T08:00:00Z",
					),
					"config_new.conf": file(
						lines("fan_speed=1500", "alarm=on", "log_level=debug", "backup=daily"),
						"2027-08-14T08:00:00Z",
					),
				},
			},
			archive: {
				"2027": {
					q2: {
						week_14: {
							"report.txt": file(
								lines("第 14 週週報", "完成：更換廚房排風扇。", "待辦：第三甲板溫度偏高，觀察中。"),
								ARCHIVE_STAMP,
							),
						},
					},
					q3: {
						week_31: {
							"report.txt": file(
								lines("第 31 週週報", "完成：太陽翼 3 號角度校正。", "待辦：2 號氣閘密封條老化。"),
								ARCHIVE_STAMP,
							),
						},
						week_32: {
							"report.txt": file(
								lines("第 32 週週報", "完成：感測器日誌備份。", "待辦：第六甲板溫度感測器離線，要派人去看。"),
								ARCHIVE_STAMP,
							),
							"photo_list.txt": file(lines("airlock-2_seal_01.png", "airlock-2_seal_02.png"), ARCHIVE_STAMP),
						},
					},
				},
			},
			locked: {
				"how_to_open.txt": file(
					lines(
						"vault.txt 現在誰都讀不到。",
						"1. 先用 ls -l 看它的權限欄（開頭那串 r、w、x 和 -）。",
						"2. 用 chmod 把讀取權限打開，例如 chmod 644 vault.txt 或 chmod u+r vault.txt。",
						"3. 再 cat 一次。",
					),
					"2027-08-14T05:30:00Z",
				),
				"vault.txt": file(
					lines(
						"打開了！",
						"chmod 644 的意思：擁有者可讀可寫（6），群組與別的使用者只能讀（4）。",
						"再 ls -l 一次，看看權限欄變成什麼樣子。",
					),
					"2027-08-14T05:30:00Z",
					"---------",
				),
			},
			trash: {
				"build_001.tmp": file("暫存\n", "2027-08-09T03:00:00Z"),
				"build_002.tmp": file("暫存\n", "2027-08-09T03:01:00Z"),
				"build_003.tmp": file("暫存\n", "2027-08-09T03:02:00Z"),
				"cache.tmp": file("暫存\n", "2027-08-09T03:05:00Z"),
				"keep_me.txt": file(lines("這份不是暫存檔，rm *.tmp 不會刪到它。"), "2027-08-09T03:10:00Z"),
			},
		},
	},
	etc: {
		hostname: "kepler9-training\n",
		motd: lines("Kepler-9 技師訓練模擬環境", "練習機的變更不會影響站上的真實系統。"),
	},
	var: {
		log: {
			"system.log": file(
				lines(
					"2027-08-14T05:29:58Z 訓練環境開機",
					"2027-08-14T05:30:00Z 載入練習檔案",
					"2027-08-14T05:30:01Z 技師帳號 tech 登入",
				),
				"2027-08-14T05:30:01Z",
			),
		},
	},
	tmp: {},
};

// ---------------------------------------------------------------------------
// 環境變數與程序
// ---------------------------------------------------------------------------

/** 練習用的環境變數，`HOME`、`USER`、`PWD` 由 shell 自己補。 */
export const SANDBOX_ENV: Record<string, string> = {
	STATION: "Kepler-9",
	DECK: "training",
	LOG_DIR,
	PRACTICE_DIR,
	GREETING: "歡迎來到練習模式",
};

const BOOT_TIME = "2027-08-14T05:29:58Z";
const DRILL_TIME = "2027-08-14T05:31:00Z";

/** 程序清單：init 殺不掉、stubborn_job 要 kill -9，其餘一般的 kill 就會結束。 */
export const SANDBOX_PROCESSES: ProcessInfo[] = [
	{ pid: 1, user: "root", cpu: 0.0, mem: 0.1, started: BOOT_TIME, command: "/sbin/init", protected: true },
	{ pid: 214, user: "root", cpu: 0.4, mem: 0.6, started: BOOT_TIME, command: "/usr/sbin/sensor-poll" },
	{ pid: 230, user: "root", cpu: 0.1, mem: 0.3, started: BOOT_TIME, command: "/usr/sbin/door-ctl" },
	{ pid: 880, user: "tech", cpu: 63.5, mem: 1.2, started: DRILL_TIME, command: "/opt/drill/fan_test --loop" },
	{
		pid: 881,
		user: "tech",
		cpu: 4.2,
		mem: 0.8,
		started: DRILL_TIME,
		command: "/opt/drill/stubborn_job",
		ignoresTerm: true,
	},
	{ pid: 902, user: "tech", cpu: 12.7, mem: 0.4, started: DRILL_TIME, command: "/opt/drill/log_spammer" },
];

// ---------------------------------------------------------------------------
// 開場與 hint
// ---------------------------------------------------------------------------

/** 進沙盒與重置後，輸出區最上面的系統行。 */
export const SANDBOX_BANNER: string[] = [
	"Kepler-9 技師訓練模擬環境",
	"這裡的檔案都是練習用的，隨便看、隨便改、隨便刪；不存檔，也不扣氧氣。",
	"所有指令都已開放：help 列出全部，man <指令> 看說明，hint 給練習建議。",
	"不知道從哪裡開始？先輸入 cat README.txt。",
];

/** `hint` 輪流給的練習建議，依難度大致由淺到深。 */
export const SANDBOX_TIPS: string[] = [
	"先 cat README.txt，再用 ls -a 找出家目錄的隱藏檔。",
	"cd logs 之後，用 head 和 tail 看 sensors.log 的開頭與結尾，再用 wc -l 數它有幾行。",
	"grep ERROR logs/sensors.log 找出錯誤；加 -c 只數次數，加 -i 不分大小寫。",
	"sort logs/access.log | uniq -c 數每一行出現幾次，最後再接 | sort -n 由少排到多。",
	"find . -name report.txt 找出 archive 裡的週報，再用 cd 一層一層走進去，pwd 確認自己在哪。",
	"locked/vault.txt 讀不到：先 ls -l locked 看權限，再用 chmod 把讀取權限打開。",
	"mkdir、touch、cp、mv、rm 都可以隨便試；trash 裡的 .tmp 可以用 rm trash/*.tmp 一次刪掉。",
	"echo 文字 > 檔名 會寫進檔案（覆蓋），>> 則接在後面；寫完用 cat 確認。",
	"env 列出環境變數，echo $GREETING 印出其中一個，cd $LOG_DIR 直接跳到日誌目錄，export NAME=值 自己設一個。",
	"ps 看程序清單，top 看誰最吃 CPU，用 kill 加 PID 結束它；不聽話的試試 kill -9。",
];
