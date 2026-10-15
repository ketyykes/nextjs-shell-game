import { expect, type Page } from "@playwright/test";

/** 光敏確認面板的兩個選項（設計文件 4.20）。 */
export type FlickerChoice = "關閉閃爍效果" | "保留閃爍效果";

/**
 * 沒有存檔（或存檔還沒問過）的標題會先疊光敏確認，選完才能操作選單。
 * 預設選「保留閃爍效果」：其他測試照以前的設定跑，閃爍相關的演出不受影響。
 */
export async function answerFlickerPrompt(page: Page, choice: FlickerChoice = "保留閃爍效果"): Promise<void> {
	const prompt = page.getByRole("alertdialog", { name: "光敏提醒" });
	await expect(prompt).toBeVisible();
	await prompt.getByRole("button", { name: choice }).click();
	await expect(prompt).toHaveCount(0);
}
