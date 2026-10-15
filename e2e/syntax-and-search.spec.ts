import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 第十九場的新語法與 Ctrl+R 歷史搜尋（設計文件 4.16）。
 * 在沙盒練習模式（/sandbox）測，不用走路；練習用檔案系統見 `src/game/sandbox/practice.ts`。
 */

/** 在終端機打一行指令。 */
async function run(page: Page, command: string): Promise<void> {
	const input = page.getByLabel("指令輸入");
	await input.fill(command);
	await input.press("Enter");
}

/** 最後一筆指令的輸出區塊。 */
function lastCommand(page: Page): Locator {
	return page.locator('[data-entry-kind="command"]').last();
}

/** 一筆指令區塊裡的每一行：第一行是提示符加指令，之後是輸出。 */
function rowsOf(block: Locator): Locator {
	return block.locator(":scope > div");
}

test.beforeEach(async ({ page }) => {
	await page.goto("/sandbox");
	await expect(page.getByLabel("指令輸入")).toBeFocused();
});

test("||、$( )、<、2>/dev/null 各打一行都照 bash 執行", async ({ page }) => {
	// || 接住失敗：錯誤訊息照印，但這一行不算錯（不是琥珀色），右邊有執行
	await run(page, "cat 不存在.txt || echo 沒有這個檔案");
	const caught = lastCommand(page);
	await expect(rowsOf(caught)).toHaveCount(3);
	await expect(rowsOf(caught).nth(2)).toHaveText("沒有這個檔案");
	await expect(caught.locator(".text-game-amber")).toHaveCount(0);

	// $( ) 在雙引號裡代入
	await run(page, 'echo "第一個數字是 $(head -n 1 practice/numbers.txt)"');
	await expect(rowsOf(lastCommand(page)).nth(1)).toHaveText("第一個數字是 42");

	// < 讀檔當輸入：wc 不知道檔名，只印行數
	await run(page, "wc -l < practice/numbers.txt");
	await expect(rowsOf(lastCommand(page)).nth(1)).toHaveText("8");

	// 2>/dev/null 丟掉錯誤訊息：只剩指令那一行，仍然算錯（沒有輸出可以標色，看不到任何訊息）
	await run(page, "cat 不存在.txt 2>/dev/null");
	await expect(rowsOf(lastCommand(page))).toHaveCount(1);
	await run(page, "ls /dev");
	await expect(lastCommand(page)).toContainText("找不到");
});

test("Ctrl+R 搜尋歷史：打字找最新的、再按找更舊的、找不到標 failed、Esc 帶回、Enter 執行", async ({ page }) => {
	await run(page, "cat README.txt | head -n 1");
	await run(page, "pwd");
	await run(page, "cat notes/todo.txt | wc -l");

	await page.getByLabel("指令輸入").press("Control+r");
	const search = page.getByLabel("歷史搜尋關鍵字");
	await expect(search).toBeFocused();
	await expect(page.getByText("(reverse-i-search)`", { exact: true })).toBeVisible();
	// 瀏覽器的重新整理被擋下來了：剛才的輸出都還在
	await expect(page.getByText("crew@kepler9:~$ pwd")).toBeVisible();

	await page.keyboard.type("cat");
	await expect(page.getByText("': cat notes/todo.txt | wc -l", { exact: true })).toBeVisible();
	await page.keyboard.press("Control+r");
	await expect(page.getByText("': cat README.txt | head -n 1", { exact: true })).toBeVisible();

	await page.keyboard.type("zzz");
	await expect(page.getByText("(failed reverse-i-search)`", { exact: true })).toBeVisible();
	for (let count = 0; count < 3; count += 1) {
		await page.keyboard.press("Backspace");
	}
	await expect(page.getByText("(reverse-i-search)`", { exact: true })).toBeVisible();
	await expect(page.getByText("': cat notes/todo.txt | wc -l", { exact: true })).toBeVisible();

	// Esc 只取消搜尋：不跳「離開練習模式」的確認，符合的那筆放回輸入列
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("confirm-panel")).toHaveCount(0);
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();
	await expect(input).toHaveValue("cat notes/todo.txt | wc -l");

	// Enter 照 bash 直接執行符合的那筆
	await input.fill("");
	await input.press("Control+r");
	await page.keyboard.type("pw");
	await page.keyboard.press("Enter");
	const executed = lastCommand(page);
	await expect(rowsOf(executed).first()).toHaveText("crew@kepler9:~$ pwd");
	await expect(rowsOf(executed).nth(1)).toHaveText("/home/tech");
	await expect(page.getByLabel("指令輸入")).toHaveValue("");
});
