import { expect, test } from "@playwright/test";
import {
	enterPlay,
	passChapterEnd,
	playChapter,
	seedSave,
	TERMINALS_PER_CHAPTER,
	terminalScripts,
	type TerminalScript,
} from "./helpers/deck";

/**
 * 第二到六章的 happy path：用 `seedSave` 直接種「已玩到第 N 章開頭」的存檔，進地圖後照 T1 到 T6 走完、每台解掉，
 * 看到章節結束畫面，按「進入第 N+1 章」確認換了甲板；第六章則看到片尾並回標題。
 * 每章一個測試可以平行跑。正解序列由 `terminalScripts` 從 `src/game/chapters/solutions.ts` 取，跟單元測試共用同一份（那裡是用真的 Shell 驗過的）。
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
		terminals: terminalScripts(2, [
			"入口登錄台",
			"日誌封存終端機",
			"機櫃管理台",
			"冷卻監控台",
			"備援主控台",
			"資料中心艙門控制台",
		]),
	},
	{
		chapter: 3,
		title: "工程艙",
		recapCommand: "mkdir",
		nextStartRoom: "通訊艙入口",
		terminals: terminalScripts(3, [
			"工程艙登錄台",
			"工作間終端機",
			"零件倉管理台",
			"反應爐控制台",
			"設定機房終端機",
			"工程艙艙門控制台",
		]),
	},
	{
		chapter: 4,
		title: "通訊艙",
		recapCommand: "sort",
		nextStartRoom: "艦橋入口",
		terminals: terminalScripts(4, [
			"通訊艙登錄台",
			"中繼機房終端機",
			"天線控制台",
			"訊號處理台",
			"通訊紀錄終端機",
			"通訊艙艙門控制台",
		]),
	},
	{
		chapter: 5,
		title: "艦橋",
		recapCommand: "export",
		nextStartRoom: "核心艙入口",
		terminals: terminalScripts(5, [
			"艦橋登錄台",
			"導航站終端機",
			"艦長室終端機",
			"安全管制台",
			"逃生艙紀錄台",
			"艦橋艙門控制台",
		]),
	},
	{
		chapter: 6,
		title: "NOVA 核心",
		recapCommand: "kill",
		nextStartRoom: null,
		terminals: terminalScripts(6, [
			"核心艙登錄台",
			"監控室終端機",
			"記憶庫終端機",
			"NOVA 核心控制台",
			"排程機房終端機",
			"逃生艙控制台",
		]),
	},
];

test.describe("章節結束畫面的回訪", () => {
	test.setTimeout(120_000);

	test("看過結尾回標題後再繼續，仍能從回顧卡進入下一章", async ({ page }) => {
		// 全部解完、outro 也播過（玩家在結束畫面選了「回標題」）的存檔
		const solved: string[] = [];
		for (let chapter = 1; chapter <= 2; chapter += 1) {
			for (let index = 1; index <= TERMINALS_PER_CHAPTER; index += 1) {
				solved.push(`ch${chapter}-t${index}`);
			}
		}
		await seedSave(page, { chapter: 2, solvedTerminals: solved, flags: ["ch2.introShown", "ch2.outroShown"] });
		await page.goto("/play");
		await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });

		// outro 已播過：結束畫面直接從回顧卡開始，不重播台詞，玩家仍能進入下一章
		await expect(page.getByTestId("chapter-end-recap")).toBeVisible();
		await expect(page.getByTestId("chapter-end-outro")).toHaveCount(0);
		await page.getByTestId("chapter-end-recap").getByRole("button", { name: "繼續" }).click();
		await page.getByRole("button", { name: "進入第 3 章" }).click();
		await expect(page.locator("main[data-chapter='3'][data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
		await expect(page.getByTestId("hud-room")).toHaveText("工程艙入口");
	});
});

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
