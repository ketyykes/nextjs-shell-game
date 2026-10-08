import { expect, test } from "@playwright/test";
import { enterPlay, seedSave } from "./helpers/deck";

/**
 * 右側面板組（已學指令、對話紀錄）：Alt 快捷鍵與標籤開關，對話紀錄收得到 NOVA 的地圖台詞。
 * 台詞內容不寫死，從畫面上的對話框讀，劇本改字不會讓這裡壞掉。
 */

test("對話紀錄：地圖上 Alt+L 開關，NOVA 播完的台詞留在紀錄裡", async ({ page }) => {
	// 沒有 introShown 旗標，進地圖後 NOVA 會說開場台詞
	await seedSave(page, { chapter: 1 });
	await enterPlay(page);

	const dialogue = page.getByTestId("nova-dialogue");
	await expect(dialogue).toBeVisible();
	const firstLine = (await dialogue.locator(".sr-only").textContent()) ?? "";
	expect(firstLine).not.toBe("");

	const panel = page.getByTestId("side-panel");
	await page.keyboard.press("Alt+KeyL");
	await expect(panel).toBeVisible();
	await expect(panel.getByRole("heading", { name: "對話紀錄" })).toBeVisible();
	// 第一句播完（打字、停留、淡出）後才進紀錄
	await expect(page.getByTestId("nova-log-panel")).toContainText(firstLine, { timeout: 15000 });

	await page.keyboard.press("Alt+KeyL");
	await expect(panel).toBeHidden();

	// 滑鼠點標籤一樣能開關
	const logTab = page.getByRole("button", { name: /對話紀錄/ });
	await logTab.click();
	await expect(panel).toBeVisible();
	await logTab.click();
	await expect(panel).toBeHidden();
});
