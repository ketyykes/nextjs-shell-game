import { expect, type Page } from "@playwright/test";
import { DECK_ROOMS, ROOM_NAMES } from "../../src/game/phaser/events";

/**
 * 六個甲板共用的 e2e 走路與解謎工具。
 *
 * 走路策略（細節見 docs/progress.md 第 5 節）：角色碰撞盒 20x14、速度 120 px/s，門只有一格寬，用計時走很容易偏。
 * 所以一律「貼牆滑行」：同時按住兩個方向鍵，被牆擋住的那一軸停住、另一軸繼續滑，滑到門口就自動進去；
 * 只有最後對齊終端機那一小段用計時（互動半徑 40 px，容錯夠大）。
 * 走廊上下兩排的門都在同一欄（x=6、18、30），所以進走廊後要先橫移一段再貼牆，不然會從對面的門鑽回去。
 * 六個甲板的平面圖完全一樣，只有艙區名不同，所以路線用 `DECK_ROOMS` 查艙區名就能六章共用。
 */

export const TERMINALS_PER_CHAPTER = 6;

/** 同時按住幾個鍵一段時間。 */
export async function hold(page: Page, keys: string[], ms: number): Promise<void> {
	for (const key of keys) {
		await page.keyboard.down(key);
	}
	await page.waitForTimeout(ms);
	for (const key of keys) {
		await page.keyboard.up(key);
	}
}

/** 按住幾個鍵直到 HUD 右上角的艙區名變成指定艙區，超時就失敗。 */
export async function holdUntilRoom(page: Page, keys: string[], room: string, timeout: number): Promise<void> {
	for (const key of keys) {
		await page.keyboard.down(key);
	}
	try {
		await expect(page.getByTestId("hud-room")).toHaveText(room, { timeout });
	} finally {
		for (const key of keys) {
			await page.keyboard.up(key);
		}
	}
}

/**
 * 最後對齊終端機：計時走的那一小段在瀏覽器掉幀時會走不夠（Phaser 的 delta 有上限，模擬時間比牆上時鐘慢），
 * 所以看不到「按 E」就左右各退一點再試，最多幾次。互動半徑 40 px，每次微調 150 ms 約 18 px。
 * 這只修正走路位置，不重試遊戲邏輯，不會蓋掉終端機本身的 bug。
 */
async function alignToTerminal(page: Page, title: string): Promise<void> {
	const hint = page.getByTestId("interact-hint");
	const expected = `按 E 開啟 ${title}`;
	const nudges: Array<[string, number]> = [
		["ArrowRight", 150],
		["ArrowLeft", 300],
		["ArrowRight", 450],
		["ArrowLeft", 600],
		["ArrowUp", 200],
		["ArrowRight", 300],
	];
	for (const [key, ms] of nudges) {
		const text = await hint.textContent().catch(() => null);
		if (text === expected) {
			return;
		}
		await hold(page, [key], ms);
		await page.waitForTimeout(150);
	}
	await expect(hint).toHaveText(expected);
}

/** 站在終端機旁按 E，打一串指令，確認目標數進到 solvedCount/6，再用 Esc 關掉。 */
export async function solveTerminal(
	page: Page,
	title: string,
	commands: string[],
	solvedCount: number,
): Promise<void> {
	await alignToTerminal(page, title);
	await page.keyboard.press("e");
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();
	for (const command of commands) {
		await input.fill(command);
		await input.press("Enter");
	}
	await expect(page.getByTestId("objective-progress")).toHaveText(`${solvedCount}/${TERMINALS_PER_CHAPTER}`);
	await expect(page.getByText("O2 100%")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("terminal-modal")).toBeHidden();
	// 關掉終端機的那一下 Esc 不該順便打開暫停選單
	await page.waitForTimeout(300);
	await expect(page.getByTestId("pause-menu")).toHaveCount(0);
}

/** 一台終端機的 e2e 腳本：標題（跟 HUD 的「按 E 開啟 ○○」比對）與正解指令。 */
export interface TerminalScript {
	title: string;
	commands: string[];
}

/** 第 `chapter` 章七個位置的艙區名，走路時當檢查點。 */
export function roomNamesOf(chapter: number) {
	const rooms = DECK_ROOMS[chapter];
	return {
		start: ROOM_NAMES[rooms.start],
		second: ROOM_NAMES[rooms.second],
		third: ROOM_NAMES[rooms.third],
		fourth: ROOM_NAMES[rooms.fourth],
		fifth: ROOM_NAMES[rooms.fifth],
		exit: ROOM_NAMES[rooms.exit],
		corridor: ROOM_NAMES[rooms.corridor],
	};
}

/**
 * 從出生點照 T1 到 T6 的順序走完一章、每台都解掉。
 * 進入前要先 `expect(hud-room).toHaveText(出生房)`；六台都解完後章節結束畫面會自己出現。
 */
export async function playChapter(page: Page, chapter: number, scripts: readonly TerminalScript[]): Promise<void> {
	expect(scripts).toHaveLength(TERMINALS_PER_CHAPTER);
	const rooms = roomNamesOf(chapter);
	await expect(page.getByTestId("hud-room")).toHaveText(rooms.start);

	// T1：出生點在艙內中央，貼左上角再往右走到控制台正下方
	await hold(page, ["ArrowUp", "ArrowLeft"], 2500);
	await hold(page, ["ArrowRight"], 580);
	await solveTerminal(page, scripts[0].title, scripts[0].commands, 1);

	// T2：貼上牆往右滑出門進走廊，橫移避開頭頂的門，再貼下牆往右滑進下排中間的房間
	await holdUntilRoom(page, ["ArrowUp", "ArrowRight"], rooms.corridor, 8000);
	await hold(page, ["ArrowUp"], 300);
	await hold(page, ["ArrowRight"], 400);
	await holdUntilRoom(page, ["ArrowDown", "ArrowRight"], rooms.second, 10000);
	await hold(page, ["ArrowDown", "ArrowRight"], 1500);
	await hold(page, ["ArrowUp"], 2200);
	await hold(page, ["ArrowLeft"], 583);
	await solveTerminal(page, scripts[1].title, scripts[1].commands, 2);

	// T3：回走廊後往左橫移，貼上牆往左滑到上排左房的門鑽上去，貼左上角再往右走
	await holdUntilRoom(page, ["ArrowUp", "ArrowLeft"], rooms.corridor, 8000);
	await hold(page, ["ArrowUp"], 300);
	await hold(page, ["ArrowLeft"], 400);
	await holdUntilRoom(page, ["ArrowUp", "ArrowLeft"], rooms.third, 12000);
	await hold(page, ["ArrowUp", "ArrowLeft"], 1500);
	await hold(page, ["ArrowRight"], 583);
	await solveTerminal(page, scripts[2].title, scripts[2].commands, 3);

	// T4：先直直走到下牆（斜著走會在碰到下牆前就越過門口），貼下牆滑出門回走廊，
	// 往右橫移越過上排中間的門，再貼上牆往右滑到上排右房的門
	await hold(page, ["ArrowDown"], 1800);
	await holdUntilRoom(page, ["ArrowDown", "ArrowRight"], rooms.corridor, 8000);
	await hold(page, ["ArrowRight"], 3500);
	await holdUntilRoom(page, ["ArrowUp", "ArrowRight"], rooms.fourth, 12000);
	await hold(page, ["ArrowUp", "ArrowRight"], 1500);
	await hold(page, ["ArrowLeft"], 583);
	await solveTerminal(page, scripts[3].title, scripts[3].commands, 4);

	// T5：直走到下牆再貼牆滑出門回走廊，往左橫移到上排中間房的門右側，貼上牆往左滑進去
	await hold(page, ["ArrowDown"], 1800);
	await holdUntilRoom(page, ["ArrowDown", "ArrowLeft"], rooms.corridor, 8000);
	await hold(page, ["ArrowLeft"], 2300);
	await holdUntilRoom(page, ["ArrowUp", "ArrowLeft"], rooms.fifth, 12000);
	await hold(page, ["ArrowUp", "ArrowLeft"], 1500);
	await hold(page, ["ArrowRight"], 1650);
	await solveTerminal(page, scripts[4].title, scripts[4].commands, 5);

	// T6：直走到下牆再貼牆滑出門回走廊，一路往右走到走廊盡頭的出口區，貼右上角再往左退一點
	await hold(page, ["ArrowDown"], 1800);
	await holdUntilRoom(page, ["ArrowDown", "ArrowLeft"], rooms.corridor, 8000);
	await holdUntilRoom(page, ["ArrowRight"], rooms.exit, 10000);
	await hold(page, ["ArrowUp", "ArrowRight"], 1500);
	await hold(page, ["ArrowLeft"], 320);
	await solveTerminal(page, scripts[5].title, scripts[5].commands, 6);
}

/** 進 /play，等 Station 場景就緒，點畫布拿焦點。 */
export async function enterPlay(page: Page): Promise<void> {
	await page.goto("/play");
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await page.locator("canvas").click();
	// 場景剛就緒的第一幀鍵盤可能還沒接上，稍等再按
	await page.waitForTimeout(300);
}

/** 存檔種子的選項。 */
export interface SeedOptions {
	chapter: number;
	/** 已過關的終端機 id，預設把前幾章全部標成過關。 */
	solvedTerminals?: string[];
	/** 額外旗標；前幾章的 introShown／outroShown 會自動帶上。 */
	flags?: string[];
	/** 已學指令，預設空。 */
	learnedCommands?: string[];
}

/**
 * 直接寫一份「已經玩到第 N 章開頭」的存檔進 localStorage，略過前面幾章。
 * 格式跟 `src/game/store/gameStore.ts` 的 persist 一致（`{ state, version }`），`SAVE_VERSION` 是 1。
 */
export async function seedSave(page: Page, options: SeedOptions): Promise<void> {
	const solvedTerminals = options.solvedTerminals ?? [];
	const flags: Record<string, true> = {};
	for (let chapter = 1; chapter < options.chapter; chapter += 1) {
		flags[`ch${chapter}.introShown`] = true;
		flags[`ch${chapter}.outroShown`] = true;
		if (options.solvedTerminals === undefined) {
			for (let index = 1; index <= TERMINALS_PER_CHAPTER; index += 1) {
				solvedTerminals.push(`ch${chapter}-t${index}`);
			}
		}
	}
	for (const flag of options.flags ?? []) {
		flags[flag] = true;
	}
	const save = {
		state: {
			progress: {
				chapter: options.chapter,
				character: "a",
				solvedTerminals,
				learnedCommands: options.learnedCommands ?? [],
				oxygen: 100,
				savedAt: new Date().toISOString(),
			},
			settings: {
				textSpeed: "instant",
				flickerEnabled: true,
				scanlinesEnabled: true,
				vignetteEnabled: true,
				volume: 0.8,
				muted: true,
			},
			terminals: {},
			storyFlags: flags,
		},
		version: 1,
	};
	await page.goto("/");
	await page.evaluate((json) => {
		window.localStorage.clear();
		window.localStorage.setItem("kepler9-save", json);
	}, JSON.stringify(save));
}

/**
 * 走完章節結束畫面：outro 逐句 Enter 到回顧卡，確認標題與回顧卡裡有某個指令，按「繼續」。
 * 回傳後停在 done（有下一章）或 ending（最後一章）階段，由呼叫端決定下一步。
 */
export async function passChapterEnd(page: Page, chapter: number, title: string, recapCommand: string): Promise<void> {
	const chapterEnd = page.getByTestId("chapter-end-screen");
	await expect(chapterEnd).toBeVisible();
	const recap = page.getByTestId("chapter-end-recap");
	for (let presses = 0; presses < 12 && !(await recap.isVisible()); presses += 1) {
		await page.keyboard.press("Enter");
		await page.waitForTimeout(300);
	}
	await expect(recap).toBeVisible();
	await expect(recap).toContainText(`第 ${chapter} 章 ${title} 完成`);
	await expect(recap.getByRole("list")).toContainText(recapCommand);
	await recap.getByRole("button", { name: "繼續" }).click();
}
