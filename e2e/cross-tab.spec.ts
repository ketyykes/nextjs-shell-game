import { expect, test, type Page } from "@playwright/test";
import { enterPlay, seedSave } from "./helpers/deck";

/**
 * 4.21 兩個分頁同時開遊戲（審計 G3）：同一個 browser context 的兩個 page 共用 localStorage，
 * 別的分頁寫了存檔，舊分頁就停止存檔並在頂端提示，之後的動作不會把存檔蓋回舊進度；按「重新載入」接續最新進度。
 *
 * 兩邊都用切換設定寫存檔（每切一次寫一次），舊分頁停在暫停選單或標題，不會自己累計遊玩時間寫檔，先後順序是確定的。
 */

interface StoredSave {
	state: { settings: Record<string, unknown> };
}

/** 讀 localStorage 的整份存檔。 */
async function readSave(page: Page): Promise<StoredSave> {
	return page.evaluate(() => JSON.parse(window.localStorage.getItem("kepler9-save") ?? "{}"));
}

/** /play 按 Esc 開暫停選單。 */
async function openPauseMenu(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("pause-menu")).toBeVisible();
}

/** 從暫停選單打開設定。 */
async function openSettingsFromPause(page: Page): Promise<void> {
	await page.getByRole("dialog", { name: "暫停選單" }).getByText("設定", { exact: true }).click();
	await expect(page.getByTestId("settings-menu")).toBeVisible();
}

/** 切換設定裡的一個開關，等畫面顯示新值（切換就會寫一次存檔）。 */
async function toggleSetting(page: Page, label: string): Promise<void> {
	await page.getByRole("button", { name: `${label}：開` }).click();
	await expect(page.getByRole("button", { name: `${label}：關` })).toBeVisible();
}

test("舊分頁在 /play：新分頁寫了存檔後提示停止存檔，之後改設定也不蓋回去，重新載入接續最新進度", async ({ context, page }) => {
	const oldTab = page;
	await seedSave(oldTab, { chapter: 1, flags: ["ch1.introShown"] });
	await enterPlay(oldTab);
	// 停在暫停選單：遊玩時間不累計，舊分頁不會自己寫檔
	await openPauseMenu(oldTab);

	const newTab = await context.newPage();
	await enterPlay(newTab);
	await openPauseMenu(newTab);
	await openSettingsFromPause(newTab);
	await toggleSetting(newTab, "CRT 掃描線");
	expect((await readSave(newTab)).state.settings.scanlinesEnabled).toBe(false);

	// 舊分頁出現提示；新分頁自己的寫入不會被誤判
	const notice = oldTab.getByTestId("save-status-notice");
	await expect(notice).toContainText("另一個分頁改了存檔");
	await expect(newTab.getByTestId("save-status-notice")).toHaveCount(0);

	// 舊分頁再改設定：畫面照常切換，但存檔仍是新分頁寫的內容
	await openSettingsFromPause(oldTab);
	await toggleSetting(oldTab, "暗角");
	expect((await readSave(oldTab)).state.settings).toMatchObject({ scanlinesEnabled: false, vignetteEnabled: true });

	// 重新載入：讀到新分頁寫的存檔，提示消失
	await notice.getByRole("button", { name: "重新載入" }).click();
	await expect(oldTab.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await expect(oldTab.getByTestId("save-status-notice")).toHaveCount(0);
	await oldTab.locator("canvas").click();
	await openPauseMenu(oldTab);
	await openSettingsFromPause(oldTab);
	await expect(oldTab.getByRole("button", { name: "CRT 掃描線：關" })).toBeVisible();
	await expect(oldTab.getByRole("button", { name: "暗角：開" })).toBeVisible();
});

test("舊分頁停在標題：新分頁寫了存檔後標題也提示，768 寬時提示整條停在音效提示（176 px）以上", async ({ context, page }) => {
	const oldTab = page;
	await oldTab.setViewportSize({ width: 768, height: 1024 });
	await seedSave(oldTab, { chapter: 1, flags: ["ch1.introShown"] });
	// 標題重新讀一次種好的存檔（v1 讀檔時升級並寫回，這是舊分頁自己的寫入）
	await oldTab.reload();
	await expect(oldTab.getByRole("button", { name: "繼續" })).toBeVisible();

	const newTab = await context.newPage();
	await enterPlay(newTab);
	await openPauseMenu(newTab);
	await openSettingsFromPause(newTab);
	await toggleSetting(newTab, "CRT 掃描線");

	const notice = oldTab.getByTestId("save-status-notice");
	await expect(notice).toContainText("另一個分頁改了存檔");
	await expect(newTab.getByTestId("save-status-notice")).toHaveCount(0);
	// 跟 /play 的音效提示（AssetLoadErrorNotice，top-44）同時出現時不重疊
	const box = await notice.boundingBox();
	expect(box).not.toBeNull();
	expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(176);

	// 標題的設定改了也不寫回去
	await oldTab.getByRole("button", { name: "設定" }).click();
	await expect(oldTab.getByTestId("settings-menu")).toBeVisible();
	await toggleSetting(oldTab, "暗角");
	expect((await readSave(oldTab)).state.settings).toMatchObject({ scanlinesEnabled: false, vignetteEnabled: true });

	await notice.getByRole("button", { name: "重新載入" }).click();
	await expect(oldTab.getByRole("button", { name: "繼續" })).toBeVisible();
	await expect(oldTab.getByTestId("save-status-notice")).toHaveCount(0);
});
