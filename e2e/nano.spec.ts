import { expect, test, type Page } from "@playwright/test";

/** 第十九場 nano 編輯器（設計文件 4.22）：在練習模式開新檔、打字、^O 存檔、^X 離開，cat 看得到內容。 */

/** 在沙盒終端機打一行指令。 */
async function run(page: Page, command: string): Promise<void> {
	const input = page.getByLabel("指令輸入");
	await input.fill(command);
	await input.press("Enter");
}

test("nano 開新檔、打一行、Ctrl+O Enter 存檔、Ctrl+X 離開，cat 看得到那一行", async ({ page }) => {
	await page.goto("/sandbox");
	await expect(page.getByLabel("指令輸入")).toBeFocused();

	await run(page, "nano e2e_note.txt");
	const editor = page.getByRole("region", { name: "nano 編輯器" });
	await expect(editor).toBeVisible();
	await expect(editor.getByText("e2e_note.txt", { exact: true })).toBeVisible();
	await expect(page.getByRole("log")).toBeHidden();

	const text = page.getByRole("textbox", { name: "編輯內容" });
	await expect(text).toBeFocused();
	await page.keyboard.type("filter B3 replaced");
	await page.keyboard.insertText("，濾網已換");
	await expect(editor.getByText("已修改")).toBeVisible();

	await page.keyboard.press("Control+o");
	const fileNamePrompt = page.getByRole("textbox", { name: "要寫入的檔名" });
	await expect(fileNamePrompt).toBeFocused();
	await expect(fileNamePrompt).toHaveValue("e2e_note.txt");
	await page.keyboard.press("Enter");
	await expect(editor.getByRole("status")).toHaveText("[ 已寫入 1 行 ]");
	await expect(editor.getByText("已修改")).toHaveCount(0);

	await page.keyboard.press("Control+x");
	await expect(editor).toHaveCount(0);
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	await expect(page.getByRole("log")).toContainText("[ nano 已寫入 e2e_note.txt，1 行 ]");

	await run(page, "cat e2e_note.txt");
	await expect(page.getByText("filter B3 replaced，濾網已換", { exact: true })).toBeVisible();
});

test("有沒存的修改時 Esc 先問，N 不存；Esc 只離開編輯器、不會跳出練習模式的確認", async ({ page }) => {
	await page.goto("/sandbox");
	await run(page, "nano README.txt");
	const editor = page.getByRole("region", { name: "nano 編輯器" });
	await expect(page.getByRole("textbox", { name: "編輯內容" })).toBeFocused();

	await page.keyboard.type("不要存");
	await page.keyboard.press("Escape");
	await expect(editor.getByRole("status")).toHaveText("儲存修改過的緩衝區？");
	await page.keyboard.press("n");

	await expect(editor).toHaveCount(0);
	await expect(page.getByTestId("confirm-panel")).toHaveCount(0);
	await run(page, "grep -c 不要存 README.txt");
	await expect(page.getByRole("log").getByText("0", { exact: true })).toBeVisible();
});
