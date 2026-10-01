import { expect, test, type Page } from "@playwright/test";

/**
 * 第一章 happy path：標題 → 新遊戲 → 選角 → boot log → 地圖，照劇本順序走到六台終端機各解一關，
 * 看到章節結束畫面，回標題後存檔還在，整段沒有任何頁面錯誤。
 *
 * 走路策略：角色碰撞盒 20x14、速度 120 px/s，門只有一格寬，用計時走很容易偏。
 * 所以一律「貼牆滑行」：同時按住兩個方向鍵，被牆擋住的那一軸停住、另一軸繼續滑，
 * 滑到門口就自動進去；只有最後對齊終端機那一小段用計時（互動半徑 40 px，容錯夠大）。
 * 走廊上下兩排的門都在同一欄（x=6、18、30），所以進走廊後要先橫移一段再貼牆，不然會從對面的門鑽回去。
 */

const TOTAL_TERMINALS = 6;

/** 同時按住幾個鍵一段時間。 */
async function hold(page: Page, keys: string[], ms: number): Promise<void> {
	for (const key of keys) {
		await page.keyboard.down(key);
	}
	await page.waitForTimeout(ms);
	for (const key of keys) {
		await page.keyboard.up(key);
	}
}

/** 按住幾個鍵直到 HUD 右上角的艙區名變成指定艙區，超時就失敗。 */
async function holdUntilRoom(page: Page, keys: string[], room: string, timeout: number): Promise<void> {
	for (const key of keys) {
		await page.keyboard.down(key);
	}
	try {
		await expect(page.getByTestId("hud-room")).toHaveText(room, { timeout });
	} finally {
		for (const key of keys) {
			await page.keyboard.up(key);
		}
	}
}

/** 站在終端機旁按 E，打一串指令，確認目標數進到 solvedCount/6，再用 Esc 關掉。 */
async function solveTerminal(page: Page, title: string, commands: string[], solvedCount: number): Promise<void> {
	await expect(page.getByTestId("interact-hint")).toHaveText(`按 E 開啟 ${title}`);
	await page.keyboard.press("e");
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();
	for (const command of commands) {
		await input.fill(command);
		await input.press("Enter");
	}
	await expect(page.getByTestId("objective-progress")).toHaveText(`${solvedCount}/${TOTAL_TERMINALS}`);
	await expect(page.getByText("O2 100%")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("terminal-modal")).toBeHidden();
	// 關掉終端機的那一下 Esc 不該順便打開暫停選單
	await page.waitForTimeout(300);
	await expect(page.getByTestId("pause-menu")).toHaveCount(0);
}

test.describe("第一章 happy path", () => {
	test.setTimeout(180_000);

	test("從標題一路解完六台終端機，看到章節結束並回到標題", async ({ page }) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));

		await page.goto("/");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();

		// 標題 → 新遊戲 → 選角（往右選第二位）→ boot log（Enter 跳過、Enter 進地圖）
		await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
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
		await expect(page.getByTestId("hud-room")).toHaveText("冷凍艙");

		// T1 冷凍艙控制台：出生點在艙內中央，貼左上角再往右走到控制台正下方
		await hold(page, ["ArrowUp", "ArrowLeft"], 2500);
		await hold(page, ["ArrowRight"], 580);
		await solveTerminal(page, "冷凍艙控制台", ["cat wake_up.txt"], 1);

		// T2 維生系統監控台：貼上牆往右滑出冷凍艙門進走廊，橫移避開頭頂的宿舍門，再貼下牆往右滑進維生艙門
		await holdUntilRoom(page, ["ArrowUp", "ArrowRight"], "主走廊", 8000);
		await hold(page, ["ArrowUp"], 300);
		await hold(page, ["ArrowRight"], 400);
		await holdUntilRoom(page, ["ArrowDown", "ArrowRight"], "維生艙", 10000);
		await hold(page, ["ArrowDown", "ArrowRight"], 1500);
		await hold(page, ["ArrowUp"], 2200);
		await hold(page, ["ArrowLeft"], 583);
		await solveTerminal(page, "維生系統監控台", ["cd power", "cat status.txt"], 2);

		// T3 宿舍終端機：回走廊後往左橫移，貼上牆往左滑到宿舍門鑽上去，貼左上角再往右走
		await holdUntilRoom(page, ["ArrowUp", "ArrowLeft"], "主走廊", 8000);
		await hold(page, ["ArrowUp"], 300);
		await hold(page, ["ArrowLeft"], 400);
		await holdUntilRoom(page, ["ArrowUp", "ArrowLeft"], "宿舍", 12000);
		await hold(page, ["ArrowUp", "ArrowLeft"], 1500);
		await hold(page, ["ArrowRight"], 583);
		await solveTerminal(page, "宿舍終端機", ["cat /home/abin/day_900.txt"], 3);

		// T4 配電箱：先直直走到下牆（斜著走會在碰到下牆前就越過門口），貼下牆滑出宿舍門回走廊，
		// 往右橫移越過醫療艙門，再貼上牆往右滑到配電室門
		await hold(page, ["ArrowDown"], 1800);
		await holdUntilRoom(page, ["ArrowDown", "ArrowRight"], "主走廊", 8000);
		await hold(page, ["ArrowRight"], 3500);
		await holdUntilRoom(page, ["ArrowUp", "ArrowRight"], "配電室", 12000);
		await hold(page, ["ArrowUp", "ArrowRight"], 1500);
		await hold(page, ["ArrowLeft"], 583);
		await solveTerminal(page, "配電箱", ["cat /deck1/systems/power/breakers/B3/.override"], 4);

		// T5 醫療艙終端機：直走到下牆再貼牆滑出配電室門回走廊，往左橫移到醫療艙門右側，貼上牆往左滑進去
		await hold(page, ["ArrowDown"], 1800);
		await holdUntilRoom(page, ["ArrowDown", "ArrowLeft"], "主走廊", 8000);
		await hold(page, ["ArrowLeft"], 2300);
		await holdUntilRoom(page, ["ArrowUp", "ArrowLeft"], "醫療艙", 12000);
		await hold(page, ["ArrowUp", "ArrowLeft"], 1500);
		await hold(page, ["ArrowRight"], 1650);
		await solveTerminal(page, "醫療艙終端機", ["cat records/PT-2028-0601-QN0606.txt"], 5);

		// T6 艙門控制台：直走到下牆再貼牆滑出醫療艙門回走廊，一路往右走到走廊盡頭的主艙門區，貼右上角再往左退一點
		await hold(page, ["ArrowDown"], 1800);
		await holdUntilRoom(page, ["ArrowDown", "ArrowLeft"], "主走廊", 8000);
		await holdUntilRoom(page, ["ArrowRight"], "主艙門", 10000);
		await hold(page, ["ArrowUp", "ArrowRight"], 1500);
		await hold(page, ["ArrowLeft"], 320);
		await solveTerminal(page, "艙門控制台", ["cat /home/tech/pod_06/.key"], 6);

		// 章節結束：outro 逐句打字，Enter 跳過或前進，最後一句後進回顧卡
		const chapterEnd = page.getByTestId("chapter-end-screen");
		await expect(chapterEnd).toBeVisible();
		const recap = page.getByTestId("chapter-end-recap");
		for (let presses = 0; presses < 10 && !(await recap.isVisible()); presses += 1) {
			await page.keyboard.press("Enter");
			await page.waitForTimeout(300);
		}
		await expect(recap).toBeVisible();
		await expect(recap).toContainText("第 1 章 冷凍艙與維生艙 完成");
		await expect(recap.getByRole("list")).toContainText("ls -a");
		await recap.getByRole("button", { name: "繼續" }).click();
		await expect(page.getByTestId("chapter-end-done")).toBeVisible();
		await page.getByRole("button", { name: "回標題" }).click();

		// 回到標題：存檔還在，所以有「繼續」；整段沒有頁面錯誤
		await expect(page.getByRole("heading", { name: "KEPLER-9" })).toBeVisible();
		await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
		expect(pageErrors).toEqual([]);
	});
});
