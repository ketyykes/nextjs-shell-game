import { expect, test, type Page } from "@playwright/test";
import { enterPlay, seedSave, walkToTerminal } from "./helpers/deck";

/**
 * 阿彬的隱藏留言（設計文件 4.12）：第一章醫療艙用 ls -a 找到留言、cat 讀它，收進右側面板「阿彬的留言」，
 * 存檔記下找到的 id。`seedSave` 寫的是 v1，順便驗證 v1 一路升到 v4 的 migrate 在真瀏覽器跑得通。
 */

/** 讀 localStorage 的整份存檔。 */
async function readSave(page: Page): Promise<{ state: Record<string, unknown>; version: number }> {
	return page.evaluate(() => JSON.parse(window.localStorage.getItem("kepler9-save") ?? "{}"));
}

test("第一章醫療艙：ls -a 找到阿彬的留言、cat 讀它，終端機插一行系統行，面板計數從 0/8 變 1/8", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedSave(page, {
		chapter: 1,
		solvedTerminals: ["ch1-t1", "ch1-t2", "ch1-t3", "ch1-t4"],
		flags: ["ch1.introShown"],
		learnedCommands: ["pwd", "ls", "cat", "cd", "..", "ls -l", "~", "ls -a"],
	});
	await enterPlay(page);

	// 宿舍那台過關過，標籤已經出現；一則都還沒找到
	const panel = page.getByTestId("side-panel");
	await page.keyboard.press("Alt+KeyA");
	await expect(panel.getByRole("heading", { name: "阿彬的留言" })).toBeVisible();
	await expect(panel.getByTestId("abin-notes-count")).toHaveText("0/8");
	await expect(panel).toContainText("醫療艙的病歷系統裡");
	await page.keyboard.press("Alt+KeyA");
	await expect(panel).toBeHidden();

	await walkToTerminal(page, 4, "醫療艙終端機");
	await page.keyboard.press("e");
	const modal = page.getByTestId("terminal-modal");
	await expect(modal).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();
	for (const command of ["ls -a", "cat .abin_jokes.txt"]) {
		await input.fill(command);
		await input.press("Enter");
	}
	await expect(modal).toContainText("已收進「阿彬的留言」1/8");

	// 終端機開著也能開面板，輸入框焦點不動
	await page.keyboard.press("Alt+KeyA");
	await expect(panel.getByTestId("abin-notes-count")).toHaveText("1/8");
	await expect(panel).toContainText("冷凍入艙評估，講了四個笑話，醫官笑了一個。");
	await expect(input).toBeFocused();

	await expect.poll(async () => (await readSave(page)).version).toBe(4);
	expect((await readSave(page)).state.abinNotes).toEqual({ found: ["ch1-jokes"], reply: null });
	expect(pageErrors).toEqual([]);
});
