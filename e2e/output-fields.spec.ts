import { expect, test, type Page } from "@playwright/test";

/** 輸出欄位說明（設計文件 4.17）：多欄輸出旁的「[?] 欄位說明」，在練習模式打 ls -l、ps 驗證。 */

/** 在沙盒終端機打一行指令。 */
async function run(page: Page, command: string): Promise<void> {
	const input = page.getByLabel("指令輸入");
	await input.fill(command);
	await input.press("Enter");
}

test("ls -l 第一次自動展開欄位說明；滑鼠點不搶輸入框焦點，鍵盤也能開關；ps 各自展開一次，ps | grep 不標", async ({
	page,
}) => {
	await page.goto("/sandbox");
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();
	const log = page.getByRole("log");

	// 第一次看到 ls -l：自動展開，例子取自這次的輸出
	await run(page, "ls -l");
	const lsButtons = log.getByRole("button", { name: "ls -l 欄位說明" });
	await expect(lsButtons).toHaveCount(1);
	const firstButton = lsButtons.first();
	await expect(firstButton).toHaveText("[?] 欄位說明");
	await expect(firstButton).toHaveAttribute("aria-expanded", "true");
	const table = log.getByRole("table", { name: "ls -l 欄位說明" });
	await expect(table).toBeVisible();
	await expect(table.getByRole("row", { name: /^權限/ })).toContainText("-rw-r--r--");
	await expect(table.getByRole("row", { name: /^名稱/ })).toContainText("README.txt");
	await expect(input).toBeFocused();

	// 滑鼠點一下收合，焦點留在輸入框，可以直接繼續打字
	await firstButton.click();
	await expect(firstButton).toHaveAttribute("aria-expanded", "false");
	await expect(table).toHaveCount(0);
	await expect(input).toBeFocused();

	// 鍵盤：焦點在按鈕上按 Enter 展開、再按一次收合，焦點都留在按鈕上
	await firstButton.focus();
	await page.keyboard.press("Enter");
	await expect(firstButton).toHaveAttribute("aria-expanded", "true");
	await expect(table).toBeVisible();
	await expect(firstButton).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(firstButton).toHaveAttribute("aria-expanded", "false");
	await expect(firstButton).toBeFocused();

	// 第二次 ls -la 不再自動展開
	await run(page, "ls -la");
	await expect(lsButtons).toHaveCount(2);
	await expect(lsButtons.nth(1)).toHaveAttribute("aria-expanded", "false");
	await expect(log.getByRole("table")).toHaveCount(0);

	// ps 是另一種說明，第一次也自動展開；ps | grep 的輸出不標
	await run(page, "ps");
	await expect(log.getByRole("table", { name: "ps 欄位說明" })).toBeVisible();
	await run(page, "ps | grep init");
	await expect(log.getByRole("button", { name: "ps 欄位說明" })).toHaveCount(1);
	await expect(input).toBeFocused();
});
