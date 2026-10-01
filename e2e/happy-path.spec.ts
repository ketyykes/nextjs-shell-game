import { expect, test } from "@playwright/test";
import { passChapterEnd, playChapter, type TerminalScript } from "./helpers/deck";

/**
 * 第一章 happy path：標題 → 新遊戲 → 選角 → boot log → 地圖，照劇本順序走到六台終端機各解一關，
 * 看到章節結束畫面，按「進入第 2 章」後地圖換成資料中心，回標題後存檔還在，整段沒有任何頁面錯誤。
 * 走路與解謎的共用工具在 `helpers/deck.ts`，第二章以後的 happy path 在 `chapters.spec.ts`。
 */

const CHAPTER_ONE: TerminalScript[] = [
	{ title: "冷凍艙控制台", commands: ["cat wake_up.txt"] },
	{ title: "維生系統監控台", commands: ["cd power", "cat status.txt"] },
	{ title: "宿舍終端機", commands: ["cat /home/abin/day_900.txt"] },
	{ title: "配電箱", commands: ["cat /deck1/systems/power/breakers/B3/.override"] },
	{ title: "醫療艙終端機", commands: ["cat records/PT-2028-0601-QN0606.txt"] },
	{ title: "艙門控制台", commands: ["cat /home/tech/pod_06/.key"] },
];

test.describe("第一章 happy path", () => {
	test.setTimeout(180_000);

	test("從標題一路解完六台終端機，進入第二章後回標題", async ({ page }) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));

		await page.goto("/");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();

		// 標題 → 新遊戲 → 選角（往右選第二位）→ boot log（Enter 跳過、Enter 進地圖）
		await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
		await expect(page.getByTestId("title-subtitle")).toHaveText("冷凍艙 · 第一章");
		await page.keyboard.press("Enter");
		await expect(page.getByText("選擇外觀")).toBeVisible();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await expect(page.getByText("冷凍艙喚醒程序")).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(page.getByText("查無此人").first()).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/play$/);
		await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
		await page.locator("canvas").click();
		await page.waitForTimeout(300);

		await playChapter(page, 1, CHAPTER_ONE);

		// 章節結束：outro → 回顧卡（有 ls -a）→ 進入第 2 章 → 頁面重載成資料中心
		await passChapterEnd(page, 1, "冷凍艙與維生艙", "ls -a");
		await expect(page.getByTestId("chapter-end-done")).toBeVisible();
		await page.getByRole("button", { name: "進入第 2 章" }).click();
		await expect(page.locator("main[data-chapter='2'][data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
		await expect(page.getByTestId("hud-room")).toHaveText("資料中心入口");
		await expect(page.getByTestId("objective-progress")).toHaveText("0/6");

		// 回到標題：副標變成第二章，存檔還在所以有「繼續」；整段沒有頁面錯誤
		await page.waitForTimeout(300);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-menu")).toBeVisible();
		await page.getByRole("dialog", { name: "暫停選單" }).getByText("回標題").click();
		await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
		await expect(page.getByTestId("title-subtitle")).toHaveText("資料中心 · 第二章");
		await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
		expect(pageErrors).toEqual([]);
	});
});
