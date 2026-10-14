import { expect, test, type Page } from "@playwright/test";
import { PLAYER_PROBE_KEY, type PlayerProbeSnapshot } from "../src/game/phaser/objects/playerProbe";
import { enterPlay, seedSave } from "./helpers/deck";

/**
 * 右側面板組（已學指令、對話紀錄、阿彬的留言）：Alt 快捷鍵與標籤開關，對話紀錄收得到 NOVA 的地圖台詞。
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

test("已學指令：終端機開著時 Alt+C 開關，面板疊在彈窗上，輸入框焦點與打到一半的字都不動", async ({ page }) => {
	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"], learnedCommands: ["pwd", "ls", "cat"] });
	await enterPlay(page);
	// 這裡要測的是面板與終端機彈窗的關係，不是走路：用開發模式的除錯鉤子直接開 T1，
	// 免得計時走路在機器忙的時候走不到（走路開終端機的整條流程由 happy-path 與 play.spec 負責）
	await page.evaluate(() => {
		const hook = (window as unknown as { __kepler9: { emit: (name: string, payload: unknown) => void } }).__kepler9;
		hook.emit("terminal:open", { terminalId: "ch1-t1" });
	});
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();

	await page.keyboard.type("pw");
	await page.keyboard.press("Alt+KeyC");
	const panel = page.getByTestId("side-panel");
	await expect(panel).toBeVisible();
	await expect(panel.getByRole("heading", { name: "已學指令" })).toBeVisible();
	await expect(panel).toContainText("pwd");
	// 面板中心點最上層的元素屬於面板，代表它疊在終端機彈窗與黑幕之上（滑入動畫結束後再量）
	await expect
		.poll(() =>
			panel.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
				return hit !== null && element.contains(hit);
			}),
		)
		.toBe(true);

	// 焦點留在輸入框，接著打字會接在後面，Alt+C 本身也沒打出任何字
	await expect(input).toBeFocused();
	await page.keyboard.type("d");
	await expect(input).toHaveValue("pwd");

	// 滑鼠點另一個標籤直接切換，焦點一樣不會被搶走
	await page.getByRole("button", { name: /對話紀錄/ }).click();
	await expect(panel.getByRole("heading", { name: "對話紀錄" })).toBeVisible();
	await expect(input).toBeFocused();
	await page.keyboard.press("Alt+KeyL");
	await expect(panel).toBeHidden();

	// 終端機照常運作：Enter 執行、Esc 關閉且不會順便打開暫停選單
	await page.keyboard.press("Enter");
	await expect(input).toHaveValue("");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("terminal-modal")).toBeHidden();
	await page.waitForTimeout(300);
	await expect(page.getByTestId("pause-menu")).toHaveCount(0);
});

/** 讀開發模式掛在 window 上的角色座標。 */
async function readPlayer(page: Page): Promise<PlayerProbeSnapshot> {
	return page.evaluate((key) => {
		const probe = (window as unknown as Record<string, { read(): PlayerProbeSnapshot } | undefined>)[key];
		if (probe === undefined) {
			throw new Error(`window.${key} 不存在：場景還沒就緒，或不是開發模式`);
		}
		return probe.read();
	}, PLAYER_PROBE_KEY);
}

test("開關過一次暫停選單後按住 Alt+A，只開關阿彬的留言，角色不會往左走", async ({ page }) => {
	// 宿舍那台過關過，「阿彬的留言」標籤已經出現
	await seedSave(page, {
		chapter: 1,
		solvedTerminals: ["ch1-t1", "ch1-t2", "ch1-t3"],
		flags: ["ch1.introShown"],
		learnedCommands: ["pwd", "ls", "cat", "cd", "..", "ls -l", "~"],
	});
	await enterPlay(page);

	// 開關一次暫停選單：面板快捷鍵的監聽會移除再重掛，以前重掛後排到 Phaser 的鍵盤監聽後面
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("pause-menu")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("pause-menu")).toHaveCount(0);
	await expect.poll(async () => (await readPlayer(page)).inputEnabled).toBe(true);

	const before = await readPlayer(page);
	await page.keyboard.down("Alt");
	await page.keyboard.down("KeyA");
	await page.waitForTimeout(600);
	await page.keyboard.up("KeyA");
	await page.keyboard.up("Alt");
	await page.waitForTimeout(200);
	const after = await readPlayer(page);
	expect(after.x, "按住 Alt+A 時角色的 x").toBe(before.x);
	expect(after.y, "按住 Alt+A 時角色的 y").toBe(before.y);
	await expect(page.getByTestId("side-panel").getByRole("heading", { name: "阿彬的留言" })).toBeVisible();

	// 對照組：沒按 Alt 的 A 確實會往左走，上面沒動不是因為貼著牆
	await page.keyboard.down("KeyA");
	await page.waitForTimeout(300);
	await page.keyboard.up("KeyA");
	await expect.poll(async () => (await readPlayer(page)).x).toBeLessThan(before.x);
});

/** 兩個矩形是否重疊（貼邊不算）。 */
function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

for (const viewport of [
	{ width: 1280, height: 800 },
	{ width: 1024, height: 768 },
	{ width: 768, height: 1024 },
]) {
	test(`${viewport.width}x${viewport.height} 視窗下面板開到最高也不壓到 NOVA 對話框、目標面板與艙區名`, async ({ page }) => {
		await page.setViewportSize(viewport);
		// 學很多指令讓面板撐到最大高度；沒有 introShown，開場台詞會讓 NOVA 對話框出現
		const learnedCommands = ["pwd", "ls", "cat", "cd", "ls -a", "cd ..", "mkdir", "history", "clear", "cp", "mv", "rm"];
		learnedCommands.push("grep", "wc", "head", "tail", "find", "echo", "sort", "chmod");
		await seedSave(page, { chapter: 1, learnedCommands });
		await enterPlay(page);
		await expect(page.getByTestId("nova-dialogue")).toBeVisible();
		await page.keyboard.press("Alt+KeyC");
		const panel = page.getByTestId("side-panel");
		await expect(panel).toBeVisible();
		// 等滑入動畫跑完再量
		await page.waitForTimeout(400);

		const boxes = {
			panel: await panel.boundingBox(),
			nova: await page.getByTestId("nova-dialogue").boundingBox(),
			objective: await page.getByTestId("objective-panel").boundingBox(),
			room: await page.getByTestId("hud-room").boundingBox(),
		};
		for (const [name, box] of Object.entries(boxes)) {
			expect(box, name).not.toBeNull();
		}
		const { panel: panelBox, nova, objective, room } = boxes as Record<
			keyof typeof boxes,
			NonNullable<(typeof boxes)["panel"]>
		>;
		expect(overlaps(panelBox, nova), "面板與 NOVA 對話框").toBe(false);
		expect(overlaps(panelBox, objective), "面板與目標面板").toBe(false);
		expect(overlaps(panelBox, room), "面板與艙區名").toBe(false);
	});
}
