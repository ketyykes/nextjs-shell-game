import { expect, test, type Page } from "@playwright/test";
import { seedSave } from "./helpers/deck";

/** M14-3 沙盒練習模式（設計文件 4.11）：標題進沙盒、打指令、重置、回標題，存檔不受影響。 */

const SAVE_KEY = "kepler9-save";

async function readSave(page: Page): Promise<string | null> {
	return page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
}

/** 在沙盒終端機打一行指令。 */
async function run(page: Page, command: string): Promise<void> {
	const input = page.getByLabel("指令輸入");
	await input.fill(command);
	await input.press("Enter");
}

/** 練習模式是標題選單的最後一項：從第一項按 ↑ 繞到最後。 */
async function enterSandboxByKeyboard(page: Page): Promise<void> {
	await page.keyboard.press("ArrowUp");
	await expect(page.getByRole("button", { name: "練習模式" })).toHaveAttribute("data-selected", "true");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/sandbox$/);
	await expect(page.getByLabel("指令輸入")).toBeFocused();
}

test("沒有存檔也能進練習模式：所有指令開放、可重置、Esc 確認後回標題，不會產生存檔", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => window.localStorage.clear());
	await page.reload();
	await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();

	await enterSandboxByKeyboard(page);
	await expect(page.getByRole("heading", { name: "練習模式" })).toBeVisible();
	await expect(page.getByText("Kepler-9 技師訓練模擬環境").first()).toBeVisible();
	// 不載 Phaser：沒有地圖畫布、沒有氧氣 HUD
	await expect(page.locator("canvas")).toHaveCount(0);
	await expect(page.getByText(/O2 \d+%/)).toHaveCount(0);

	await run(page, "ls -a");
	await expect(page.getByText(".welcome", { exact: true })).toBeVisible();
	await run(page, "wc -l logs/sensors.log");
	await expect(page.getByRole("log")).toContainText(/30\s+logs\/sensors\.log/);
	await run(page, "cat locked/vault.txt");
	await run(page, "chmod 644 locked/vault.txt && cat locked/vault.txt");
	await expect(page.getByText("打開了！")).toBeVisible();
	await run(page, "hint");
	await expect(page.getByText(/練習建議 1\/\d+/)).toBeVisible();
	await run(page, "mkdir e2e_scratch && cd e2e_scratch");
	await expect(page.getByText("crew@kepler9:~/e2e_scratch$")).toBeVisible();

	// Alt+R 重置：輸出區、工作目錄、檔案系統都回到剛進來的樣子
	await page.keyboard.press("Alt+KeyR");
	await expect(page.getByText("練習環境已重置", { exact: false })).toBeVisible();
	await expect(page.getByText("mkdir e2e_scratch && cd e2e_scratch")).toHaveCount(0);
	await expect(page.getByLabel("指令輸入")).toHaveValue("");
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	await run(page, "ls");
	await expect(page.getByText("README.txt", { exact: true })).toBeVisible();
	await expect(page.getByText("e2e_scratch/", { exact: true })).toHaveCount(0);

	// Esc 先確認，預設「取消」，Enter 留在沙盒、焦點回輸入框
	await page.getByLabel("指令輸入").press("Escape");
	await expect(page.getByTestId("confirm-panel")).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("confirm-panel")).toHaveCount(0);
	await expect(page).toHaveURL(/\/sandbox$/);
	await expect(page.getByLabel("指令輸入")).toBeFocused();

	// 再按 Esc，← 選「回標題」
	await page.getByLabel("指令輸入").press("Escape");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("button", { name: "新遊戲" })).toBeVisible();
	await expect(page.getByRole("button", { name: "繼續" })).toHaveCount(0);
	expect(await readSave(page)).toBeNull();
});

test("有存檔時進練習模式亂改一通再回標題，存檔一個字都沒變、「繼續」照常", async ({ page }) => {
	await seedSave(page, { chapter: 3 });
	await page.reload();
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect(page.getByTestId("title-subtitle")).toContainText("第三章");
	// 讀檔時舊版存檔會被 migrate 寫回一次，等它寫完再拍快照
	await expect.poll(async () => JSON.parse((await readSave(page)) ?? "{}").version).toBe(2);
	const before = await readSave(page);

	await page.getByRole("button", { name: "練習模式" }).click();
	await expect(page).toHaveURL(/\/sandbox$/);
	await run(page, "rm -r logs");
	await run(page, "kill 902");
	await run(page, "export PRACTICE=1");
	await run(page, "nonexistent_command");
	await expect(page.getByText("找不到指令", { exact: false })).toBeVisible();
	await page.getByRole("button", { name: /重置/ }).click();
	await expect(page.getByText("練習環境已重置", { exact: false })).toBeVisible();
	await run(page, "rm README.txt");

	await page.getByRole("button", { name: "關閉終端機" }).click();
	await page.getByRole("button", { name: "回標題" }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect(page.getByTestId("title-subtitle")).toContainText("第三章");
	expect(await readSave(page)).toBe(before);

	// 重新整理直接進 /sandbox，練習內容不會保留
	await page.goto("/sandbox");
	await run(page, "ls");
	await expect(page.getByText("README.txt", { exact: true })).toBeVisible();
	expect(await readSave(page)).toBe(before);
});
