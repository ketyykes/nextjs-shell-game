import { expect, type Page } from "@playwright/test";

/** 光敏確認面板的兩個選項（設計文件 4.20）。 */
export type FlickerChoice = "關閉閃爍效果" | "保留閃爍效果";

/**
 * 沒有存檔（或存檔還沒問過）的標題會先疊光敏確認，選完才能操作選單。
 * 預設選「保留閃爍效果」：其他測試照以前的設定跑，閃爍相關的演出不受影響。
 *
 * 用鍵盤選，不用滑鼠點：點完游標會停在畫面中央，面板一收、或接著打開設定選單時，
 * 游標底下的選項會被 hover 選走，後面的方向鍵就從那一項開始算。
 */
export async function answerFlickerPrompt(page: Page, choice: FlickerChoice = "保留閃爍效果"): Promise<void> {
	const prompt = page.getByRole("alertdialog", { name: "光敏提醒" });
	await expect(prompt).toBeVisible();
	if (choice === "保留閃爍效果") {
		await page.keyboard.press("ArrowRight");
	}
	await expect(prompt.getByRole("button", { name: choice })).toHaveAttribute("data-selected", "true");
	await page.keyboard.press("Enter");
	await expect(prompt).toHaveCount(0);
}
