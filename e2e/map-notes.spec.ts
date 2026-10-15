import { expect, test } from "@playwright/test";
import { ROOM_NAMES } from "../src/game/phaser/events";
import { findMapNote } from "../src/game/story/mapNotes";
import { enterPlay, seedSave, walkToCorridor, walkToMapNote } from "./helpers/deck";

/**
 * 地圖便條（設計文件 4.19）跨 Phaser 與 React 的整條流程：
 * 走到便條前按 E（Phaser 發 note:open、暫停場景）→ 閱讀視窗 → Esc 或 E 關掉（React 發 note:close、場景恢復）→ 還能走路。
 * 走路用 deck.ts 的閉環工具，不計時。
 */

test("第二章入口的公告欄：按 E 讀得到標題與內容，Esc 只關便條，關掉後還能走路", async ({ page }) => {
	const note = findMapNote("ch2-entry-notice");
	if (note === undefined) {
		throw new Error("找不到 ch2-entry-notice");
	}
	await seedSave(page, { chapter: 2 });
	await enterPlay(page);

	await walkToMapNote(page, note);
	await page.keyboard.press("e");
	const reader = page.getByRole("dialog", { name: note.objectName });
	await expect(reader).toBeVisible();
	await expect(reader.getByRole("heading", { name: note.objectName })).toBeVisible();
	for (const line of note.lines) {
		await expect(reader).toContainText(line);
	}
	// 便條不是終端機：沒有終端機彈窗，目標面板也沒被換掉
	await expect(page.getByTestId("terminal-modal")).toHaveCount(0);

	await page.keyboard.press("Escape");
	await expect(page.getByTestId("map-note-reader")).toHaveCount(0);
	// 關掉便條的那一下 Esc 不該順便打開暫停選單
	await page.waitForTimeout(300);
	await expect(page.getByTestId("pause-menu")).toHaveCount(0);

	// 再打開一次，這次用 E 關：關掉之後不會被同一個 E 立刻再打開
	await page.keyboard.press("e");
	await expect(reader).toBeVisible();
	await page.keyboard.press("e");
	await expect(page.getByTestId("map-note-reader")).toHaveCount(0);
	await page.waitForTimeout(300);
	await expect(page.getByTestId("map-note-reader")).toHaveCount(0);

	// 場景恢復了：走得到走廊
	await walkToCorridor(page, 600);
	await expect(page.getByTestId("hud-room")).toHaveText(ROOM_NAMES.dc_corridor);
});

test("同一幀內打開又關掉便條，場景照樣恢復、便條不會又被打開", async ({ page }) => {
	const note = findMapNote("ch2-entry-notice");
	if (note === undefined) {
		throw new Error("找不到 ch2-entry-notice");
	}
	await seedSave(page, { chapter: 2 });
	await enterPlay(page);
	await walkToMapNote(page, note);

	// 在同一個 task 裡：按 E 打開 → 只等 microtask 讓 React 掛上閱讀視窗 → 按 E 關掉，中間不讓瀏覽器跑下一幀，
	// 模擬機器很忙時連按兩下 E。這時 Phaser 排的 pause 還沒生效，鍵盤佇列也還沒清（兩個坑見 NoteZone 與 Station 的註解）。
	// 事件丟給有焦點的元素，跟真的按鍵一樣經過 window 的 capture 再冒泡回 window
	const readerMounted = await page.evaluate(async () => {
		const pressE = (): void => {
			for (const type of ["keydown", "keyup"]) {
				const target = document.activeElement ?? document.body;
				target.dispatchEvent(
					new KeyboardEvent(type, { key: "e", code: "KeyE", keyCode: 69, bubbles: true, cancelable: true }),
				);
			}
		};
		pressE();
		let mounted = false;
		for (let tick = 0; tick < 50 && !mounted; tick += 1) {
			await Promise.resolve();
			mounted = document.querySelector("[data-testid='map-note-reader']") !== null;
		}
		pressE();
		return mounted;
	});
	expect(readerMounted).toBe(true);
	await expect(page.getByTestId("map-note-reader")).toHaveCount(0);

	// 場景沒有卡在暫停：走得到走廊
	await walkToCorridor(page, 600);
	await expect(page.getByTestId("hud-room")).toHaveText(ROOM_NAMES.dc_corridor);
});
