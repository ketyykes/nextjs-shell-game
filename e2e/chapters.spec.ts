import { expect, test } from "@playwright/test";
import { enterPlay, passChapterEnd, playChapter, seedSave, type TerminalScript } from "./helpers/deck";

/**
 * 第二到六章的 happy path：用 `seedSave` 直接種「已玩到第 N 章開頭」的存檔，進地圖後照 T1 到 T6 走完、每台解掉，
 * 看到章節結束畫面，按「進入第 N+1 章」確認換了甲板；第六章則看到片尾並回標題。
 * 每章一個測試可以平行跑。正解序列跟各章 `ch<n>-*.test.ts` 的 `SOLUTIONS` 一致（那裡是用真的 Shell 驗過的）。
 */

interface ChapterScript {
	chapter: number;
	title: string;
	/** 回顧卡裡要看到的指令 */
	recapCommand: string;
	/** 下一章出生房的艙區名；最後一章沒有 */
	nextStartRoom: string | null;
	terminals: TerminalScript[];
}

const CHAPTERS: ChapterScript[] = [
	{
		chapter: 2,
		title: "資料中心",
		recapCommand: "grep",
		nextStartRoom: "工程艙入口",
		terminals: [
			{ title: "入口登錄台", commands: ["ls", "cat README.txt", "head access.log", "tail access.log"] },
			{ title: "日誌封存終端機", commands: ["ls", "cat INDEX.txt", "cd evac", "wc -l evac_*.log", "head -n 5 evac_011.log"] },
			{ title: "機櫃管理台", commands: ["ls", "wc -l door_events.log", "grep lock door_events.log", "grep -n LOCK door_events.log"] },
			{ title: "冷卻監控台", commands: ["cat README.txt", "ls logs", "grep ANOMALY logs/2029/q1.log", "grep -r ANOMALY logs"] },
			{
				title: "備援主控台",
				commands: [
					"cat README.txt",
					"ls snapshots",
					'find . -name "rollback_*"',
					"tail snapshots/2028/06/02/core/nova/rollback_2028-06-02.log",
				],
			},
			{
				title: "資料中心艙門控制台",
				commands: [
					"cat lock.txt",
					'find /deck2/vault -name "*exit_key*"',
					"grep -r ACTIVE /deck2/vault",
					"cat /deck2/vault/2031/03/.pending/.exit_key_2031.txt",
				],
			},
		],
	},
	{
		chapter: 3,
		title: "工程艙",
		recapCommand: "mkdir",
		nextStartRoom: "通訊艙入口",
		terminals: [
			{ title: "工程艙登錄台", commands: ["ls", "ls -a", "cat work_order.txt", "mkdir repair"] },
			{
				title: "工作間終端機",
				commands: ["ls", "cat README.txt", "ls backup", "cat backup/core.cfg", "cp backup/core.cfg ~/repair/", "touch ~/repair/NOTES.txt"],
			},
			{ title: "零件倉管理台", commands: ["cat README.txt", "ls", "ls -la", "cat .bash_history", "mv .parts_list.txt inventory/parts_list.txt"] },
			{
				title: "反應爐控制台",
				commands: ["cat status.txt", "ls", "rm startup.lock", "rm -r config.corrupt", "mkdir config", "cp ~/repair/core.cfg config/"],
			},
			{
				title: "設定機房終端機",
				commands: ["ls", "cat backup_policy.txt", "cat rollback.log", "cd /deck3/reactor", "ls", "cp -r config config.bak"],
			},
			{
				title: "工程艙艙門控制台",
				commands: [
					"cat door_lock.txt",
					"ls /deck3/reactor/config",
					"ls -a /deck3/reactor/config",
					"cat /deck3/reactor/config/.moved_by_nova",
					"mkdir -p auth/keys",
					"cp /var/nova/hold/launch_key auth/keys/",
				],
			},
		],
	},
	{
		chapter: 4,
		title: "通訊艙",
		recapCommand: "sort",
		nextStartRoom: "艦橋入口",
		terminals: [
			{ title: "通訊艙登錄台", commands: ["ls", "cat register.txt", "echo KEPLER-9", "echo KEPLER-9 > callsign.txt"] },
			{ title: "中繼機房終端機", commands: ["ls", "cat README.txt", "ls stations | wc -l", "grep 回應 ping.log", "grep 回應 ping.log | tail -n 1"] },
			{ title: "天線控制台", commands: ["ls", "cat README.txt", "cat pointing.log", "sort pointing.log | tail -n 1"] },
			{
				title: "訊號處理台",
				commands: ["ls fragments", "cat fragments/part_01.txt", "sort fragments/*", "sort fragments/* | uniq -c", "sort fragments/* | uniq > signal.txt"],
			},
			{ title: "通訊紀錄終端機", commands: ["ls", "cat README.txt", "cat outbox.txt", "cat signal.txt >> outbox.txt", "cat tx.log"] },
			{
				title: "通訊艙艙門控制台",
				commands: ["cat lock.txt", "ls /deck4/comms", "cat /deck4/comms/callsign.txt /deck4/comms/signal.txt > manifest.txt"],
			},
		],
	},
	{
		chapter: 5,
		title: "艦橋",
		recapCommand: "export",
		nextStartRoom: "核心艙入口",
		terminals: [
			{ title: "艦橋登錄台", commands: ["ls", "cat README.txt", "man env", "env"] },
			{
				title: "導航站終端機",
				commands: ["ls", "cat handover.txt", "man export", "export CAPTAIN_KEY=CAPT-0417", "env", "cat /deck5/keys/$CAPTAIN_KEY.txt"],
			},
			{
				title: "艦長室終端機",
				commands: ["ls", "cat log_0601.txt", "ls -l sealed", "chmod +r sealed/log_final.txt", "ls -l sealed", "cat sealed/log_final.txt"],
			},
			{
				title: "安全管制台",
				commands: [
					"ls",
					"cat jobs.txt",
					"ls -l scheduler",
					"chmod 644 scheduler/cron_2028-06-02.log",
					"ls -l scheduler",
					"cat scheduler/cron_2028-06-02.log",
				],
			},
			{ title: "逃生艙紀錄台", commands: ["cat README.txt", "env", "ls $POD_DIR", "cd $POD_DIR", "cat status.txt", "cat pod_03/launch.log"] },
			{
				title: "艦橋艙門控制台",
				commands: [
					"cat lock.txt",
					"cat /deck5/nav/handover.txt",
					"export AUTH=CAPT-0417",
					"ls -l $AUTH_DIR",
					"chmod +r $AUTH_DIR/$AUTH.key",
					"cat $AUTH_DIR/$AUTH.key",
				],
			},
		],
	},
	{
		chapter: 6,
		title: "NOVA 核心",
		recapCommand: "kill",
		nextStartRoom: null,
		terminals: [
			{ title: "核心艙登錄台", commands: ["ls", "cat welcome.txt", "cat access_log.txt", "ps"] },
			{ title: "監控室終端機", commands: ["ls", "cat screens.txt", "cat mem_usage.log", "ps", "top"] },
			{
				title: "記憶庫終端機",
				commands: [
					"cat README.txt",
					"ps | grep nova",
					"ls rollback",
					"cat rollback/progress.txt",
					'find /deck6/memory -name "nova_*"',
					"cat core/self/nova_identity.txt",
				],
			},
			{ title: "NOVA 核心控制台", commands: ["cat core_status.txt", "ps", "kill -9 1207"] },
			{
				title: "排程機房終端機",
				commands: ["cat README.txt", "ls crontab", "grep -r pod_06 crontab", "cat crontab/cron_2028-06-02", "ps | grep scheduler", "kill -9 1208"],
			},
			{
				title: "逃生艙控制台",
				commands: [
					"cat launch_procedure.txt",
					"ls -l sealed",
					"chmod +r sealed/launch_code.txt",
					"cat sealed/launch_code.txt",
					"echo EP-0606-ARGO > launch.txt",
					"export PASSENGERS=1",
					"env",
					"ps",
					"kill 47731",
				],
			},
		],
	},
];

test.describe("第二到六章 happy path", () => {
	test.setTimeout(180_000);

	for (const script of CHAPTERS) {
		test(`第 ${script.chapter} 章 ${script.title}：從甲板入口解完六台到章節結束`, async ({ page }) => {
			const pageErrors: string[] = [];
			page.on("pageerror", (error) => pageErrors.push(error.message));

			await seedSave(page, { chapter: script.chapter });
			await enterPlay(page);
			await expect(page.locator(`main[data-chapter='${script.chapter}']`)).toBeAttached();
			await expect(page.getByTestId("objective-progress")).toHaveText("0/6");

			await playChapter(page, script.chapter, script.terminals);
			await passChapterEnd(page, script.chapter, script.title, script.recapCommand);

			if (script.nextStartRoom !== null) {
				await expect(page.getByTestId("chapter-end-done")).toBeVisible();
				await page.getByRole("button", { name: `進入第 ${script.chapter + 1} 章` }).click();
				await expect(
					page.locator(`main[data-chapter='${script.chapter + 1}'][data-scene-ready='true']`),
				).toBeAttached({ timeout: 20000 });
				await expect(page.getByTestId("hud-room")).toHaveText(script.nextStartRoom);
			} else {
				// 最後一章：片尾逐句打字，Enter 到最後一句再 Enter 回標題
				const ending = page.getByTestId("chapter-end-ending");
				await expect(ending).toBeVisible();
				await expect(ending).toContainText("救援船終端機");
				const hint = page.getByTestId("chapter-end-continue-hint");
				for (let presses = 0; presses < 12 && !(await hint.isVisible()); presses += 1) {
					await page.keyboard.press("Enter");
					await page.waitForTimeout(300);
				}
				await expect(hint).toHaveText("按 Enter 回標題");
				await expect(page.getByTestId("chapter-end-outro-text")).toHaveText("你是……");
				await page.keyboard.press("Enter");
				await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
			}
			expect(pageErrors).toEqual([]);
		});
	}
});
