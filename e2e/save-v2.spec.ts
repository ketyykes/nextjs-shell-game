import { expect, test, type Page } from "@playwright/test";
import { enterPlay, hold, holdUntilRoom, seedSave } from "./helpers/deck";

/**
 * 存檔 v2 與第一版之後的小尾巴：角色位置存檔、選章、第六章 NOVA 立繪、關閉閃爍時的演出。
 * `seedSave` 刻意寫 v1 格式的存檔，這裡順便驗證 v1 → v2 的 migrate 在真瀏覽器裡跑得通。
 */

/** 讀 localStorage 的存檔 progress。 */
async function readProgress(page: Page): Promise<Record<string, unknown>> {
	return page.evaluate(() => {
		const raw = window.localStorage.getItem("kepler9-save");
		return raw === null ? {} : (JSON.parse(raw).state.progress as Record<string, unknown>);
	});
}

test("角色停下後位置寫進存檔，重新整理後從同一個艙區出發", async ({ page }) => {
	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await enterPlay(page);
	await expect(page.getByTestId("hud-room")).toHaveText("冷凍艙");

	// 跟 playChapter 同一條路：先貼左上角、往右到控制台下方，再貼上牆往右滑出門
	await hold(page, ["ArrowUp", "ArrowLeft"], 2500);
	await hold(page, ["ArrowRight"], 580);
	await holdUntilRoom(page, ["ArrowUp", "ArrowRight"], "主走廊", 8000);
	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(400);
	await page.keyboard.up("ArrowRight");

	await expect.poll(async () => (await readProgress(page)).position, { timeout: 5000 }).toMatchObject({
		chapter: 1,
		roomId: "corridor",
	});

	await page.reload();
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	// HUD 一開始就顯示存檔裡的艙區，Phaser 的艙區偵測也確認角色真的在走廊
	await expect(page.getByTestId("hud-room")).toHaveText("主走廊");
	await page.waitForTimeout(500);
	await expect(page.getByTestId("hud-room")).toHaveText("主走廊");

	const progress = await readProgress(page);
	expect(progress.furthestChapter).toBe(1);
});

test("選章：到過第三章時能從標題跳回第二章重玩，最遠章節保留", async ({ page }) => {
	await seedSave(page, { chapter: 3 });
	await page.goto("/");

	await page.getByRole("button", { name: "選章" }).click();
	await expect(page.getByRole("button", { name: "第一章 冷凍艙" })).toBeVisible();
	await expect(page.getByRole("button", { name: "第三章 工程艙" })).toBeVisible();
	await expect(page.getByRole("button", { name: /第四章/ })).toHaveCount(0);

	await page.getByRole("button", { name: "第二章 資料中心" }).click();
	await page.getByRole("button", { name: "重玩" }).click();

	await expect(page).toHaveURL(/\/play$/);
	await expect(page.locator("main[data-chapter='2']")).toBeAttached({ timeout: 20000 });
	await expect(page.getByTestId("hud-room")).toHaveText("資料中心入口", { timeout: 20000 });

	const progress = await readProgress(page);
	expect(progress.chapter).toBe(2);
	expect(progress.furthestChapter).toBe(3);
	expect(progress.solvedTerminals).toEqual(expect.arrayContaining(["ch1-t1"]));
	expect((progress.solvedTerminals as string[]).some((id) => id.startsWith("ch2-"))).toBe(false);
});

test("第六章進過 NOVA 核心艙後，對話框立繪換成 nova-core", async ({ page }) => {
	await seedSave(page, { chapter: 6 });
	await enterPlay(page);
	const portrait = page.getByRole("img", { name: /NOVA/ });
	await expect(portrait).toHaveAttribute("src", "/scenes/nova-eye.png", { timeout: 10000 });

	await seedSave(page, { chapter: 6, flags: ["ch6.room.nv_core.entered"] });
	await enterPlay(page);
	await expect(portrait).toHaveAttribute("src", "/scenes/nova-core.png", { timeout: 10000 });
});

test("關閉閃爍時播人影、開門、燈閃演出都不出錯", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await page.evaluate(() => {
		const save = JSON.parse(window.localStorage.getItem("kepler9-save") as string);
		save.state.settings.flickerEnabled = false;
		window.localStorage.setItem("kepler9-save", JSON.stringify(save));
	});
	await enterPlay(page);

	// 開發模式的除錯鉤子直接發事件：T4 亮燈加人影、T6 開門閃光、環境燈閃
	await page.evaluate(() => {
		const hook = (window as unknown as { __kepler9: { emit: (name: string, payload: unknown) => void } }).__kepler9;
		hook.emit("puzzle:solved", { terminalId: "ch1-t4" });
		hook.emit("puzzle:solved", { terminalId: "ch1-t6" });
		hook.emit("ambient:flicker", { durationMs: 600 });
	});
	await page.waitForTimeout(3500);

	expect(errors).toEqual([]);
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
	test(`${viewport.width}x${viewport.height} 視窗下目標面板、按 E 提示、NOVA 對話框、操作提示與上方 HUD 互不重疊`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await seedSave(page, { chapter: 1 });
		await enterPlay(page);
		// 走到 T1 旁讓「按 E」出現；開場 NOVA 台詞還在說，對話框也在；T1 還沒過關，操作提示也在
		await hold(page, ["ArrowUp", "ArrowLeft"], 2500);
		await hold(page, ["ArrowRight"], 580);
		await expect(page.getByTestId("interact-hint")).toBeVisible();
		await expect(page.getByTestId("nova-dialogue")).toBeVisible();
		await expect(page.getByTestId("controls-hint")).toBeVisible();

		const boxes = {
			objective: await page.getByTestId("objective-panel").boundingBox(),
			hint: await page.getByTestId("interact-hint").boundingBox(),
			nova: await page.getByTestId("nova-dialogue").boundingBox(),
			controls: await page.getByTestId("controls-hint").boundingBox(),
			oxygen: await page.getByTestId("hud-oxygen").boundingBox(),
			room: await page.getByTestId("hud-room").boundingBox(),
		};
		for (const [name, box] of Object.entries(boxes)) {
			expect(box, name).not.toBeNull();
		}
		const { objective, hint, nova, controls, oxygen, room } = boxes as Record<
			keyof typeof boxes,
			NonNullable<(typeof boxes)["hint"]>
		>;
		expect(overlaps(objective, hint), "目標面板與按 E 提示").toBe(false);
		expect(overlaps(objective, nova), "目標面板與 NOVA 對話框").toBe(false);
		expect(overlaps(hint, nova), "按 E 提示與 NOVA 對話框").toBe(false);
		// 操作提示（M10-3）跟其他 HUD 元素都不能疊
		for (const [name, box] of Object.entries({ objective, hint, nova, oxygen, room })) {
			expect(overlaps(controls, box), `操作提示與 ${name}`).toBe(false);
		}
	});
}

test("某台終端機的存檔壞掉時，按 E 仍打得開，那台用劇本初始狀態重建", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	// JSON 合法，但 ch1-t1 的檔案系統少了 root（以前會在 terminal:open 裡丟例外，按 E 沒反應、Phaser 卡死）
	await page.evaluate(() => {
		const save = JSON.parse(window.localStorage.getItem("kepler9-save") as string);
		save.state.terminals["ch1-t1"] = {
			shell: { terminalId: "ch1-t1", cwd: "/home/tech", history: [], hintCount: 0, learnedCommands: [], fs: { version: 1 } },
			transcript: [],
		};
		window.localStorage.setItem("kepler9-save", JSON.stringify(save));
	});
	await enterPlay(page);

	// 貼左上角再往右到控制台下方；dev 伺服器第一次編譯時會掉幀走不夠，看不到「按 E」就從角落重走（只修正位置）
	const hint = page.getByTestId("interact-hint");
	for (let attempt = 0; attempt < 3 && !(await hint.isVisible()); attempt += 1) {
		await hold(page, ["ArrowUp", "ArrowLeft"], 2500);
		await hold(page, ["ArrowRight"], 580);
		await page.waitForTimeout(300);
	}
	await expect(hint).toBeVisible();
	await page.keyboard.press("e");

	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	await expect(page.getByText("KEPLER-9 冷凍艙控制台 v2.3")).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await input.fill("ls");
	await input.press("Enter");
	await expect(page.getByText("wake_up.txt", { exact: true })).toBeVisible();

	// 重建的 session 已寫回存檔，檔案系統是完整的
	const rootType = await page.evaluate(() => {
		const save = JSON.parse(window.localStorage.getItem("kepler9-save") as string);
		return save.state.terminals["ch1-t1"].shell.fs.root?.type ?? null;
	});
	expect(rootType).toBe("dir");
	expect(errors).toEqual([]);
});
