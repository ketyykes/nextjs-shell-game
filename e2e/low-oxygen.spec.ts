import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterPlay, seedSave, walkToTerminal } from "./helpers/deck";

/**
 * 低氧氣的後果（設計文件 4.25）：氧氣低於 20% 時終端機輸出顯示不穩（少數字元換成亂碼），
 * 提示符、玩家打的那一行、輸入列與 hint 的輸出照原文；HUD 標出「顯示不穩」讓玩家知道是故意的。
 */

/** 第一章冷凍艙控制台的家目錄 `ls` 應該列出的東西（`ch1-life-support.ts` 的 T1 快照）。 */
const CRYO_LS = ["crew_manifest.txt", "pod_01/", "pod_02/", "pod_03/", "pod_04/", "pod_05/", "pod_06/", "wake_up.txt"];
/** T1 第一段提示，hint 的輸出要一字不差。 */
const CRYO_FIRST_HINT =
	"提示 1/3：先搞清楚你在哪裡、周圍有什麼。終端機裡「看」的方式是用指令。再輸入一次 hint，我直接教你第一個。";

/** `seedSave` 寫的是滿氧的 v1 存檔，這裡把氧氣改掉再寫回去。 */
async function setSavedOxygen(page: Page, oxygen: number): Promise<void> {
	await page.evaluate((value) => {
		const raw = window.localStorage.getItem("kepler9-save");
		if (raw === null) {
			throw new Error("沒有存檔可以改");
		}
		const save = JSON.parse(raw) as { state: { progress: { oxygen: number } } };
		save.state.progress.oxygen = value;
		window.localStorage.setItem("kepler9-save", JSON.stringify(save));
	}, oxygen);
}

/** 輸入框所在那一列的提示符。 */
function promptOf(page: Page): Locator {
	return page.getByLabel("指令輸入").locator("xpath=preceding-sibling::span[1]");
}

async function openCryoTerminal(page: Page): Promise<Locator> {
	await walkToTerminal(page, 0, "冷凍艙控制台");
	await page.keyboard.press("e");
	const modal = page.getByTestId("terminal-modal");
	await expect(modal).toBeVisible();
	await expect(page.getByLabel("指令輸入")).toBeFocused();
	return modal;
}

async function run(page: Page, command: string): Promise<void> {
	const input = page.getByLabel("指令輸入");
	await input.fill(command);
	await input.press("Enter");
}

/** 第一行（提示符加指令）剛好是 `firstLine` 的那筆指令輸出，回傳它的輸出行（不含第一行）。 */
async function outputLinesOf(modal: Locator, firstLine: string): Promise<string[]> {
	const blocks = await modal
		.locator('[data-entry-kind="command"]')
		.evaluateAll((elements) =>
			elements.map((element) => Array.from(element.children).map((child) => child.textContent ?? "")),
		);
	const block = blocks.find((lines) => lines[0] === firstLine);
	if (block === undefined) {
		throw new Error(`輸出區找不到「${firstLine}」`);
	}
	return block.slice(1);
}

test("O2 12%：ls 的輸出有字被換掉，提示列與 hint 照原文，HUD 標顯示不穩，重新整理後同一筆輸出壞的字一樣", async ({
	page,
}) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	// 自產的 ogg 是 ffmpeg 內建 vorbis 編碼器產的，確認瀏覽器解得開（解不開時 AudioManager 會印這個警告）
	const audioWarnings: string[] = [];
	page.on("console", (message) => {
		if (message.text().includes("[AudioManager]")) {
			audioWarnings.push(message.text());
		}
	});

	await seedSave(page, { chapter: 1, flags: ["ch1.introShown"] });
	await setSavedOxygen(page, 12);
	await enterPlay(page);

	await expect(page.getByTestId("hud-oxygen-value")).toHaveText("O2 12%");
	await expect(page.getByTestId("hud-oxygen-unstable")).toContainText("顯示不穩");

	const modal = await openCryoTerminal(page);
	// 終端機開著時 O2 讀數疊在黑幕上面，標示一起看得到
	await expect(page.getByTestId("hud-oxygen-unstable")).toBeVisible();

	await run(page, "ls");
	const lsBlock = modal.locator('[data-entry-kind="command"]').last();
	const lsLines = lsBlock.locator(":scope > div");
	await expect(lsLines.first()).toHaveText("crew@kepler9:~$ ls");
	const shown = (await lsLines.allTextContents()).slice(1);
	const tokens = shown.join(" ").split(/\s+/).filter((token) => token !== "");
	// 字數、每個名字的長度都對，但至少有一個名字被換了字
	expect(tokens.map((token) => token.length)).toEqual(CRYO_LS.map((name) => name.length));
	expect(tokens).not.toEqual(CRYO_LS);

	// 輸入列的提示符與玩家打的字不受影響
	await expect(promptOf(page)).toHaveText("crew@kepler9:~$");
	await page.getByLabel("指令輸入").fill("cat wake_up.txt");
	await expect(page.getByLabel("指令輸入")).toHaveValue("cat wake_up.txt");
	await page.getByLabel("指令輸入").fill("");

	await run(page, "hint");
	const hintBlock = modal.locator('[data-entry-kind="command"]').last();
	await expect(hintBlock.locator(":scope > div")).toHaveText(["crew@kepler9:~$ hint", CRYO_FIRST_HINT]);

	// 不跳動：重新整理後同一筆 ls 輸出還是同一組壞字
	await page.keyboard.press("Escape");
	await expect(modal).toBeHidden();
	await page.reload();
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await page.locator("canvas").click();
	const reopened = await openCryoTerminal(page);
	expect(await outputLinesOf(reopened, "crew@kepler9:~$ ls")).toEqual(shown);

	expect(pageErrors).toEqual([]);
	expect(audioWarnings).toEqual([]);
});
