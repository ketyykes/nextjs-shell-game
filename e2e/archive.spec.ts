import { expect, test, type Page } from "@playwright/test";
import { seedSave } from "./helpers/deck";

/**
 * 劇情檔案櫃（設計文件 4.24）：通關後標題選單多一項「檔案櫃」，分章列關鍵檔案、時間軸，展開看全文。
 * 種子寫 v1、帶第六章的片尾旗標，讀檔時 migrate 直接算已通關；再補一則已找到的阿彬留言（v4 的欄位，migrate 會保留）。
 */

/** 在已寫進 localStorage 的種子存檔補上已找到的阿彬留言。 */
async function seedFoundAbinNotes(page: Page, found: string[]): Promise<void> {
	await page.evaluate((ids) => {
		const save = JSON.parse(window.localStorage.getItem("kepler9-save") ?? "{}");
		save.state.abinNotes = { found: ids, reply: null };
		window.localStorage.setItem("kepler9-save", JSON.stringify(save));
	}, found);
}

test("通關後打開檔案櫃：第一章展開喚醒排程看到全文，已找到的阿彬留言也在，Esc 一路回標題", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	await seedSave(page, { chapter: 6, flags: ["ch6.introShown", "ch6.outroShown"] });
	await seedFoundAbinNotes(page, ["ch1-jokes"]);
	await page.reload();
	await expect(page.getByTestId("title-subtitle")).toHaveText("已逃離 Kepler-9");

	await page.getByRole("button", { name: "檔案櫃" }).click();
	const archive = page.getByRole("dialog", { name: "檔案櫃" });
	await expect(archive).toBeVisible();
	await expect(archive.getByRole("button", { name: /第六章 NOVA 核心/ })).toBeVisible();

	// 鍵盤：Enter 打開第一章，再 Enter 展開第一份檔案（喚醒排程）
	await page.keyboard.press("Enter");
	const wakeUp = archive.getByRole("button", { name: /\/home\/tech\/wake_up\.txt/ });
	await expect(wakeUp).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(wakeUp).toHaveAttribute("aria-expanded", "true");
	await expect(archive.getByTestId("archive-entry-content")).toContainText("原始設定：永不");
	await expect(archive.getByTestId("archive-entry-content")).toContainText("目前設定：撤離後三年");

	// 已找到的留言接在檔案後面，點一下展開
	const note = archive.getByRole("button", { name: /\.abin_jokes\.txt/ });
	await expect(note).toContainText("阿彬的留言");
	await note.click();
	await expect(archive.getByTestId("archive-entry-content")).toContainText("冷凍入艙評估，講了四個笑話");

	// Esc 回章節清單，選取停在第一章；時間軸最後一筆是喚醒那一刻
	await page.keyboard.press("Escape");
	await expect(archive.getByRole("button", { name: /第一章 冷凍艙/ })).toHaveAttribute("aria-current", "true");
	await archive.getByRole("button", { name: /時間軸/ }).click();
	await expect(archive.getByRole("button", { name: /2027-07-26 21:40/ })).toBeVisible();
	await expect(archive.getByRole("button", { name: /2031-03-12 08:15/ }).last()).toContainText("pointing.log");

	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");
	await expect(archive).toHaveCount(0);
	await expect(page.getByRole("button", { name: "檔案櫃" })).toBeVisible();
	expect(pageErrors).toEqual([]);
});

test("還沒通關的存檔沒有「檔案櫃」", async ({ page }) => {
	await seedSave(page, { chapter: 3 });
	await page.reload();
	await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect(page.getByRole("button", { name: "檔案櫃" })).toHaveCount(0);
});
