import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Profiler, type ComponentProps } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventMap, GameEventName } from "@/game/phaser/events";
import { introShownFlag, outroShownFlag, roomEnteredFlag } from "@/game/story";
import { createInitialSaveData, useGameStore } from "@/game/store";
import type { ProgressState, SettingsState, StoryFlags } from "@/game/store/types";
import type { PhaserGame } from "./PhaserGame";
import { PlayScreen } from "./PlayScreen";
import { reloadPage } from "./reloadPage";

/**
 * PlayScreen 的整合測試：Phaser 換成假元件，用 EventBus 發事件驅動，store 用真的。
 * NOVA 對話框換成直接列出整條佇列的假元件，才看得到排隊順序（真的元件一次只顯示第一則、靠計時推進）。
 */

const mocks = vi.hoisted(() => ({
	routerReplace: vi.fn(),
	routerPush: vi.fn(),
	phaserProps: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: mocks.routerReplace, push: mocks.routerPush }),
}));

vi.mock("@/components/game/PhaserGameDynamic", () => ({
	PhaserGameDynamic: (props: unknown) => {
		mocks.phaserProps.push(props);
		return <div data-testid="phaser-stub" />;
	},
}));

vi.mock("@/components/game/NovaDialogue", () => ({
	NovaDialogue: ({
		queue,
		onShown,
		portrait,
	}: {
		queue: { id: string; text: string }[];
		onShown: (id: string) => void;
		portrait?: string;
	}) => (
		<div data-testid="nova-stub" data-portrait={portrait ?? "eye"}>
			<ol>
				{queue.map((message) => (
					<li key={message.id} data-testid="nova-queue-item" data-id={message.id}>
						{message.text}
					</li>
				))}
			</ol>
			<button type="button" onClick={() => queue[0] !== undefined && onShown(queue[0].id)}>
				NOVA 下一則
			</button>
		</div>
	),
}));

// jsdom 的 window.location.reload 不能替換，換章與重玩本章的整頁重載換成假函式
vi.mock("./reloadPage", () => ({ reloadPage: vi.fn() }));

vi.mock("@/game/phaser/EventBus", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/game/phaser/EventBus")>();
	return { ...actual, onGameEvent: vi.fn(actual.onGameEvent) };
});

type PhaserProps = ComponentProps<typeof PhaserGame>;

const CHAPTER_ONE = getChapter(1);
const CHAPTER_TWO = getChapter(2);
/** 第一章 intro 第一句在 boot log 說過，地圖上從第二句開始。 */
const CHAPTER_ONE_INTRO_ON_MAP = (CHAPTER_ONE.intro ?? []).slice(1);

interface SeedOptions {
	progress?: Partial<ProgressState>;
	settings?: Partial<SettingsState>;
	storyFlags?: StoryFlags;
}

/** 種一份「已選角、在第一章」的存檔；預設已說過開場，避免 intro 混進每個測試的佇列。 */
function seedSave({ progress = {}, settings = {}, storyFlags }: SeedOptions = {}): void {
	const initial = createInitialSaveData();
	const chapter = progress.chapter ?? 1;
	useGameStore.setState({
		...initial,
		progress: { ...initial.progress, character: "c", furthestChapter: chapter, ...progress },
		settings: { ...initial.settings, textSpeed: "instant", ...settings },
		storyFlags: storyFlags ?? { [introShownFlag(chapter)]: true },
	});
}

/** 記錄 React 發給 Phaser 的事件。 */
function recordEvents(names: GameEventName[]): { name: GameEventName; payload: unknown }[] {
	const records: { name: GameEventName; payload: unknown }[] = [];
	for (const name of names) {
		unsubscribers.push(
			onGameEvent(name, (payload) => {
				records.push({ name, payload });
			}),
		);
	}
	return records;
}

function emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
	act(() => {
		emitGameEvent(name, payload);
	});
}

function novaQueueIds(): string[] {
	return screen.queryAllByTestId("nova-queue-item").map((item) => item.getAttribute("data-id") ?? "");
}

function novaQueueTexts(): string[] {
	return screen.queryAllByTestId("nova-queue-item").map((item) => item.textContent ?? "");
}

function lastPhaserProps(): PhaserProps {
	return mocks.phaserProps.at(-1) as PhaserProps;
}

function getInput(): HTMLInputElement {
	return screen.getByLabelText("指令輸入") as HTMLInputElement;
}

function runCommand(command: string): void {
	fireEvent.change(getInput(), { target: { value: command } });
	fireEvent.keyDown(getInput(), { key: "Enter" });
}

function openTerminal(terminalId: string): void {
	emit("terminal:open", { terminalId });
}

function closeTerminalWithEscape(): void {
	fireEvent.keyDown(getInput(), { key: "Escape" });
}

const unsubscribers: (() => void)[] = [];

beforeAll(async () => {
	// 讓 useStoreHydration 第一次就回 true：先用空的 localStorage 讀一次檔
	localStorage.clear();
	await useGameStore.persist.rehydrate();
});

beforeEach(() => {
	mocks.routerReplace.mockClear();
	mocks.routerPush.mockClear();
	mocks.phaserProps.length = 0;
	vi.mocked(onGameEvent).mockClear();
	vi.mocked(reloadPage).mockClear();
	seedSave();
});

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(() => {
	cleanup();
	for (const unsubscribe of unsubscribers.splice(0)) {
		unsubscribe();
	}
	localStorage.clear();
});

describe("PlayScreen 讀檔守門", () => {
	it("沒有選角的存檔就導回標題，不掛 Phaser", () => {
		seedSave({ progress: { character: null } });
		render(<PlayScreen />);

		expect(mocks.routerReplace).toHaveBeenCalledWith("/");
		expect(screen.queryByTestId("phaser-stub")).toBeNull();
		expect(screen.getByText("讀取存檔中……")).toBeDefined();
	});

	it("有存檔就掛 Phaser，帶入角色、章節地圖、已過關終端機與這一章的存檔位置", () => {
		seedSave({
			progress: {
				solvedTerminals: ["ch1-t1"],
				position: { chapter: 1, x: 100, y: 200, roomId: "lifesupport" },
			},
		});
		render(<PlayScreen />);

		const props = lastPhaserProps();
		expect(props.character).toBe("c");
		expect(props.chapter).toBe(CHAPTER_ONE.map.deck);
		expect(props.solvedTerminals).toEqual(["ch1-t1"]);
		expect(props.spawnPoint).toEqual({ chapter: 1, x: 100, y: 200, roomId: "lifesupport" });
		// 存檔位置的艙區直接顯示在 HUD
		expect(screen.getByTestId("hud-room").textContent).toBe("維生艙");
		expect(mocks.routerReplace).not.toHaveBeenCalled();
	});

	it("存檔位置屬於別章時不帶出生點", () => {
		seedSave({ progress: { position: { chapter: 2, x: 1, y: 2, roomId: "dc_logs" } } });
		render(<PlayScreen />);

		expect(lastPhaserProps().spawnPoint).toBeNull();
		expect(screen.queryByTestId("hud-room")).toBeNull();
	});

	it("scene:ready 之後 main 標上 data-scene-ready", () => {
		render(<PlayScreen />);
		const main = screen.getByRole("main");
		expect(main.getAttribute("data-scene-ready")).toBe("false");

		emit("scene:ready", { sceneKey: "Station" });
		expect(main.getAttribute("data-scene-ready")).toBe("true");
		expect(main.getAttribute("data-chapter")).toBe("1");
	});

	it("掛載時把音量與閃爍設定同步給 Phaser", () => {
		const events = recordEvents(["audio:settings", "effects:settings"]);
		seedSave({ settings: { volume: 0.3, muted: true, flickerEnabled: false } });
		render(<PlayScreen />);

		expect(events).toEqual([
			{ name: "audio:settings", payload: { volume: 0.3, muted: true } },
			{ name: "effects:settings", payload: { flickerEnabled: false } },
		]);
	});

	it("開發模式掛 window.__kepler9 除錯鉤子，卸載時拿掉", () => {
		const { unmount } = render(<PlayScreen />);
		const devWindow = window as Window & { __kepler9?: { emit: unknown } };
		expect(devWindow.__kepler9?.emit).toBe(emitGameEvent);

		unmount();
		expect(devWindow.__kepler9).toBeUndefined();
	});
});

describe("PlayScreen 開場台詞", () => {
	it("第一章第一次進地圖：從 intro 第二句開始排進 NOVA 佇列，並立 introShown 旗標", () => {
		seedSave({ storyFlags: {} });
		render(<PlayScreen />);

		expect(novaQueueTexts()).toEqual(CHAPTER_ONE_INTRO_ON_MAP);
		expect(useGameStore.getState().storyFlags[introShownFlag(1)]).toBe(true);
	});

	it("其他章節整段 intro 都在地圖上說", () => {
		seedSave({ progress: { chapter: 2 }, storyFlags: {} });
		render(<PlayScreen />);

		expect(novaQueueTexts()).toEqual(CHAPTER_TWO.intro ?? []);
	});

	it("已經說過開場就不再說", () => {
		render(<PlayScreen />);
		expect(novaQueueIds()).toEqual([]);
	});
});

describe("PlayScreen 進艙區", () => {
	it("第一次進艙區：HUD 顯示艙區名、秀插圖卡、排進房台詞、播 nova-blip、立旗標", () => {
		const events = recordEvents(["sfx:play"]);
		render(<PlayScreen />);

		emit("room:enter", { roomId: "cryo" });

		expect(screen.getByTestId("hud-room").textContent).toBe("冷凍艙");
		expect(screen.getByTestId("scene-card")).toBeDefined();
		const cryo = CHAPTER_ONE.terminals[0];
		expect(novaQueueTexts()).toEqual(cryo.nova?.onEnterRoom);
		expect(events).toEqual([{ name: "sfx:play", payload: { sound: "nova-blip" } }]);
		expect(useGameStore.getState().storyFlags[roomEnteredFlag(1, "cryo")]).toBe(true);
	});

	it("進過的艙區只更新 HUD，不再說話也不播音效", () => {
		seedSave({ storyFlags: { [introShownFlag(1)]: true, [roomEnteredFlag(1, "cryo")]: true } });
		const events = recordEvents(["sfx:play"]);
		render(<PlayScreen />);

		emit("room:enter", { roomId: "cryo" });

		expect(screen.getByTestId("hud-room").textContent).toBe("冷凍艙");
		expect(novaQueueIds()).toEqual([]);
		expect(screen.queryByTestId("scene-card")).toBeNull();
		expect(events).toEqual([]);
	});

	it("沒有終端機的走廊：只立旗標，沒有台詞", () => {
		render(<PlayScreen />);
		emit("room:enter", { roomId: "corridor" });

		expect(novaQueueIds()).toEqual([]);
		expect(useGameStore.getState().storyFlags[roomEnteredFlag(1, "corridor")]).toBe(true);
	});

	it("換艙區時丟掉舊房還沒播的進房台詞，intro 與正在顯示的那則保留（#61）", () => {
		seedSave({ storyFlags: {} });
		render(<PlayScreen />);

		emit("room:enter", { roomId: "cryo" });
		emit("room:enter", { roomId: "lifesupport" });

		const lifesupport = CHAPTER_ONE.terminals[1];
		// 正在顯示的是 intro 第一則；intro 不丟、冷凍艙的進房台詞全丟，維生艙的接在後面
		expect(novaQueueTexts()).toEqual([...CHAPTER_ONE_INTRO_ON_MAP, ...(lifesupport.nova?.onEnterRoom ?? [])]);
	});

	it("被丟掉的台詞在對話紀錄面板標成未播出", () => {
		render(<PlayScreen />);
		emit("room:enter", { roomId: "cryo" });
		emit("room:enter", { roomId: "lifesupport" });

		fireEvent.click(screen.getByRole("button", { name: /對話紀錄/ }));
		const panel = screen.getByTestId("nova-log-panel");
		// 冷凍艙第一句正在顯示所以保留，後兩句被丟掉
		const cryoLines = CHAPTER_ONE.terminals[0].nova?.onEnterRoom ?? [];
		expect(within(panel).getByText(cryoLines[1])).toBeDefined();
		expect(within(panel).getAllByText("未播出")).toHaveLength(2);
	});
});

describe("PlayScreen 終端機", () => {
	it("terminal:open 開彈窗，顯示 banner 與這台的 NOVA 開場白，並存第一筆 session", () => {
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		const modal = screen.getByTestId("terminal-modal");
		expect(within(modal).getByText("冷凍艙控制台")).toBeDefined();
		expect(within(modal).getByText("KEPLER-9 冷凍艙控制台 v2.3")).toBeDefined();
		expect(within(modal).getAllByText("這台控制台還有電。技師，試著看看裡面有什麼。").length).toBeGreaterThan(0);
		expect(useGameStore.getState().terminals["ch1-t1"]).toBeDefined();
	});

	it("劇本裡沒有的終端機：不開彈窗，直接發 terminal:close 讓 Phaser 恢復", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const events = recordEvents(["terminal:close"]);
		render(<PlayScreen />);
		openTerminal("ch9-t9");

		expect(screen.queryByTestId("terminal-modal")).toBeNull();
		expect(events).toEqual([{ name: "terminal:close", payload: { terminalId: "ch9-t9" } }]);
		warn.mockRestore();
	});

	it("打錯指令扣 1% 氧氣，每道指令都播按鍵聲", () => {
		const events = recordEvents(["sfx:play"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		runCommand("nosuchcommand");
		runCommand("pwd");

		expect(screen.getByTestId("hud-oxygen-value").textContent).toBe("O2 99%");
		expect(events.filter((event) => (event.payload as { sound: string }).sound === "key")).toHaveLength(2);
	});

	it("關掉再開同一台沿用同一個 Shell（cwd 還在）", () => {
		render(<PlayScreen />);
		openTerminal("ch1-t1");
		runCommand("cd ..");
		closeTerminalWithEscape();

		openTerminal("ch1-t1");
		runCommand("pwd");
		const modal = screen.getByTestId("terminal-modal");
		expect(within(modal).getAllByText("/home").length).toBeGreaterThan(0);
	});

	it("從存檔還原的終端機接續存過的 cwd", () => {
		render(<PlayScreen />);
		openTerminal("ch1-t1");
		runCommand("cd ..");
		cleanup();

		// 重新掛載等同重整：Shell 快取清空，從 store 的 session 還原
		render(<PlayScreen />);
		openTerminal("ch1-t1");
		runCommand("pwd");
		const modal = screen.getByTestId("terminal-modal");
		const lastCommand = within(modal).getAllByText("/home");
		expect(lastCommand.length).toBeGreaterThan(0);
	});
});

describe("PlayScreen 過關流程", () => {
	it("達成目標：記錄過關、回氧、學會指令、通知 Phaser 播演出、終端機插目標達成與 NOVA 過關台詞", () => {
		seedSave({ progress: { oxygen: 80 } });
		const events = recordEvents(["puzzle:solved", "sfx:play"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		runCommand("cat wake_up.txt");

		const state = useGameStore.getState();
		expect(state.progress.solvedTerminals).toEqual(["ch1-t1"]);
		expect(state.progress.oxygen).toBe(100);
		expect(state.progress.learnedCommands).toEqual(["pwd", "ls", "cat"]);
		expect(state.progress.savedAt).not.toBeNull();
		expect(events).toContainEqual({ name: "puzzle:solved", payload: { terminalId: "ch1-t1" } });
		expect(events).toContainEqual({ name: "sfx:play", payload: { sound: "power" } });

		const modal = screen.getByTestId("terminal-modal");
		expect(within(modal).getByText("☑ 目標達成：讀取冷凍艙的喚醒排程")).toBeDefined();
		for (const line of CHAPTER_ONE.terminals[0].nova?.onSolved ?? []) {
			expect(within(modal).getAllByText(line).length).toBeGreaterThan(0);
		}
		// 過關台詞只內嵌在終端機，地圖對話框這時候還沒說
		expect(novaQueueIds()).toEqual([]);
		// 目標面板打勾、進度變 1/6
		expect(screen.getByTestId("objective-title").textContent).toContain("讀取冷凍艙的喚醒排程");
		expect(screen.getByTestId("objective-progress").textContent).toContain("1");
	});

	it("關掉終端機後地圖 NOVA 只重說過關台詞的最後一句，不開暫停選單（#5）", async () => {
		const events = recordEvents(["terminal:close"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");
		runCommand("cat wake_up.txt");

		closeTerminalWithEscape();

		const solvedLines = CHAPTER_ONE.terminals[0].nova?.onSolved ?? [];
		// 彈窗有 0.15 秒的淡出
		await waitFor(() => {
			expect(screen.queryByTestId("terminal-modal")).toBeNull();
		});
		expect(novaQueueTexts()).toEqual([solvedLines.at(-1)]);
		expect(events).toEqual([{ name: "terminal:close", payload: { terminalId: "ch1-t1" } }]);
		expect(screen.queryByTestId("pause-menu")).toBeNull();
	});

	it("已過關的終端機再執行指令不會再過關一次", () => {
		seedSave({ progress: { solvedTerminals: ["ch1-t1"], learnedCommands: ["pwd", "ls", "cat"] } });
		const events = recordEvents(["puzzle:solved"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		runCommand("cat wake_up.txt");
		closeTerminalWithEscape();

		expect(events).toEqual([]);
		expect(novaQueueIds()).toEqual([]);
	});

	it("沒達成目標的合法指令不扣氧也不過關", () => {
		render(<PlayScreen />);
		openTerminal("ch1-t1");
		runCommand("ls");

		expect(useGameStore.getState().progress.solvedTerminals).toEqual([]);
		expect(screen.getByTestId("hud-oxygen-value").textContent).toBe("O2 100%");
	});
});

describe("PlayScreen 卡關反應", () => {
	it("連錯 3 次燈閃、存錯誤次數；連錯 5 次 NOVA 在終端機裡給卡關台詞（#21 只內嵌）", () => {
		const events = recordEvents(["ambient:flicker"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		for (let index = 0; index < 5; index += 1) {
			runCommand("nosuchcommand");
		}

		expect(events).toHaveLength(1);
		expect(useGameStore.getState().terminals["ch1-t1"]?.errorCount).toBe(5);
		const modal = screen.getByTestId("terminal-modal");
		for (const line of CHAPTER_ONE.terminals[0].nova?.onStuck ?? []) {
			expect(within(modal).getAllByText(line).length).toBeGreaterThan(0);
		}
		expect(novaQueueIds()).toEqual([]);
	});

	it("關閉閃爍時燈不閃", () => {
		seedSave({ settings: { flickerEnabled: false } });
		const events = recordEvents(["ambient:flicker"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		for (let index = 0; index < 3; index += 1) {
			runCommand("nosuchcommand");
		}

		expect(events).toEqual([]);
	});

	it("連錯 6 次播門聲", () => {
		const events = recordEvents(["sfx:play"]);
		render(<PlayScreen />);
		openTerminal("ch1-t1");

		for (let index = 0; index < 6; index += 1) {
			runCommand("nosuchcommand");
		}

		expect(events).toContainEqual({ name: "sfx:play", payload: { sound: "door" } });
	});
});

describe("PlayScreen HUD 與目標", () => {
	it("走到終端機旁顯示「按 E」提示，目標面板改指向那一台（M10-2）", () => {
		render(<PlayScreen />);
		expect(screen.getByTestId("objective-title").textContent).toContain(CHAPTER_ONE.terminals[0].objective.title);

		const quarters = CHAPTER_ONE.terminals[2];
		emit("terminal:nearby", { terminalId: quarters.id });
		expect(screen.getByTestId("interact-hint").textContent).toBe(`按 E 開啟 ${quarters.title}`);
		expect(screen.getByTestId("objective-title").textContent).toContain(quarters.objective.title);

		emit("terminal:nearby", { terminalId: null });
		expect(screen.queryByTestId("interact-hint")).toBeNull();
	});

	it("終端機開著時不顯示「按 E」與操作提示", () => {
		render(<PlayScreen />);
		expect(screen.getByTestId("controls-hint")).toBeDefined();
		emit("terminal:nearby", { terminalId: "ch1-t1" });

		openTerminal("ch1-t1");
		expect(screen.queryByTestId("interact-hint")).toBeNull();
		expect(screen.queryByTestId("controls-hint")).toBeNull();
	});

	it("第一章 T1 過關後操作提示消失", () => {
		seedSave({ progress: { solvedTerminals: ["ch1-t1"] } });
		render(<PlayScreen />);
		expect(screen.queryByTestId("controls-hint")).toBeNull();
	});

	it("player:stopped 把位置存進這一章", () => {
		render(<PlayScreen />);
		emit("player:stopped", { x: 10.4, y: 20.6, roomId: "cryo" });

		expect(useGameStore.getState().progress.position).toEqual({ chapter: 1, x: 10, y: 21, roomId: "cryo" });
	});

	it("已學指令面板列出存檔裡的已學指令", () => {
		seedSave({ progress: { learnedCommands: ["pwd", "ls -a"] } });
		render(<PlayScreen />);

		fireEvent.click(screen.getByRole("button", { name: /已學指令/ }));
		const panel = screen.getByTestId("side-panel");
		expect(within(panel).getByText("ls -a")).toBeDefined();
	});
});

describe("PlayScreen 暫停選單", () => {
	it("地圖上按 Esc 開暫停選單並停住 Phaser，選繼續後恢復", () => {
		const events = recordEvents(["game:pause", "game:resume"]);
		render(<PlayScreen />);

		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.getByTestId("pause-menu")).toBeDefined();
		expect(events).toEqual([{ name: "game:pause", payload: { reason: "menu" } }]);

		fireEvent.click(screen.getByText("繼續"));
		expect(screen.queryByTestId("pause-menu")).toBeNull();
		expect(events.at(-1)).toEqual({ name: "game:resume", payload: { reason: "menu" } });
	});

	it("按住 Esc 的重複事件不開選單", () => {
		render(<PlayScreen />);
		fireEvent.keyDown(window, { key: "Escape", repeat: true });
		expect(screen.queryByTestId("pause-menu")).toBeNull();
	});

	it("終端機開著時 window 上的 Esc 不開暫停選單", () => {
		render(<PlayScreen />);
		openTerminal("ch1-t1");
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByTestId("pause-menu")).toBeNull();
	});

	it("選回標題就導到首頁", () => {
		render(<PlayScreen />);
		fireEvent.keyDown(window, { key: "Escape" });
		fireEvent.click(screen.getByText("回標題"));
		expect(mocks.routerPush).toHaveBeenCalledWith("/");
	});

	it("從暫停選單開設定，設定選單開著時 Phaser 仍停住", () => {
		const events = recordEvents(["game:pause", "game:resume"]);
		render(<PlayScreen />);
		fireEvent.keyDown(window, { key: "Escape" });
		fireEvent.click(screen.getByText("設定"));

		expect(screen.queryByTestId("pause-menu")).toBeNull();
		expect(events).toEqual([{ name: "game:pause", payload: { reason: "menu" } }]);
	});
});

describe("PlayScreen 章節結束", () => {
	const ALL_CHAPTER_ONE = CHAPTER_ONE.terminals.map((terminal) => terminal.id);

	it("六台全解且終端機關著就顯示章節結束畫面，從 outro 開始", () => {
		seedSave({ progress: { solvedTerminals: ALL_CHAPTER_ONE } });
		render(<PlayScreen />);

		expect(screen.getByTestId("chapter-end-screen")).toBeDefined();
		expect(screen.getByTestId("chapter-end-outro")).toBeDefined();
	});

	it("outro 播過也一定出現，直接從回顧卡開始（#37）", () => {
		seedSave({
			progress: { solvedTerminals: ALL_CHAPTER_ONE },
			storyFlags: { [introShownFlag(1)]: true, [outroShownFlag(1)]: true },
		});
		render(<PlayScreen />);

		expect(screen.getByTestId("chapter-end-recap")).toBeDefined();
	});

	it("終端機開著時先不顯示，關掉才出現", () => {
		seedSave({ progress: { solvedTerminals: ALL_CHAPTER_ONE } });
		render(<PlayScreen />);
		openTerminal("ch1-t6");
		expect(screen.queryByTestId("chapter-end-screen")).toBeNull();

		closeTerminalWithEscape();
		expect(screen.getByTestId("chapter-end-screen")).toBeDefined();
	});

	it("章節結束畫面掛上時存一次檔", () => {
		seedSave({ progress: { solvedTerminals: ALL_CHAPTER_ONE, savedAt: null } });
		render(<PlayScreen />);
		expect(useGameStore.getState().progress.savedAt).not.toBeNull();
	});

	it("按「進入第 2 章」後到整頁重載之前，畫面仍停在第一章，不提前說第二章開場也不重建 Phaser（#31）", () => {
		seedSave({
			progress: { solvedTerminals: ALL_CHAPTER_ONE },
			storyFlags: { [introShownFlag(1)]: true, [outroShownFlag(1)]: true },
		});
		render(<PlayScreen />);
		fireEvent.click(screen.getByText("繼續"));
		const phaserRenders = mocks.phaserProps.length;

		fireEvent.click(screen.getByText("進入第 2 章"));

		expect(reloadPage).toHaveBeenCalledTimes(1);
		const state = useGameStore.getState();
		expect(state.progress.chapter).toBe(2);
		// 第二章開場要留給重載後的新頁面說
		expect(state.storyFlags[introShownFlag(2)]).toBeUndefined();
		expect(state.stats["2"]).toBeUndefined();
		expect(novaQueueIds()).not.toContain("intro-2-0");
		// Phaser 的章節不變，不會在重載前銷毀重建成第二章地圖
		for (const props of mocks.phaserProps.slice(phaserRenders) as PhaserProps[]) {
			expect(props.chapter).toBe(CHAPTER_ONE.map.deck);
		}
		expect(screen.getByRole("main").getAttribute("data-chapter")).toBe("1");
	});

	it("章節結束畫面開著時 Esc 不開暫停選單，Enter 只觸發結束畫面的主要按鈕", () => {
		seedSave({
			progress: { solvedTerminals: ALL_CHAPTER_ONE },
			storyFlags: { [introShownFlag(1)]: true, [outroShownFlag(1)]: true },
		});
		render(<PlayScreen />);
		fireEvent.click(screen.getByText("繼續"));
		expect(screen.getByTestId("chapter-end-done")).toBeDefined();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByTestId("pause-menu")).toBeNull();

		fireEvent.keyDown(window, { key: "Enter" });
		expect(reloadPage).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("pause-menu")).toBeNull();
	});

	it("還差一台就不顯示", () => {
		seedSave({ progress: { solvedTerminals: ALL_CHAPTER_ONE.slice(0, 5) } });
		render(<PlayScreen />);
		expect(screen.queryByTestId("chapter-end-screen")).toBeNull();
	});
});

describe("PlayScreen 訂閱穩定性（A4、A19）", () => {
	it("Phaser 事件只在掛載時訂閱一次，之後的 render 不會拆掉重掛", () => {
		seedSave({ storyFlags: {} });
		render(<PlayScreen />);
		// 掛載時 intro 排進佇列已經造成一次重新 render
		expect(vi.mocked(onGameEvent)).toHaveBeenCalledTimes(5);

		emit("room:enter", { roomId: "cryo" });
		emit("terminal:nearby", { terminalId: "ch1-t1" });
		emit("player:stopped", { x: 1, y: 2, roomId: "cryo" });
		openTerminal("ch1-t1");
		runCommand("nosuchcommand");
		runCommand("cat wake_up.txt");
		closeTerminalWithEscape();
		fireEvent.click(screen.getAllByText("NOVA 下一則")[0]);

		expect(vi.mocked(onGameEvent)).toHaveBeenCalledTimes(5);
	});

	it("角色停下存位置不會讓整個畫面重新 render", () => {
		const onRender = vi.fn();
		render(
			<Profiler id="play" onRender={onRender}>
				<PlayScreen />
			</Profiler>,
		);
		onRender.mockClear();

		emit("player:stopped", { x: 10, y: 20, roomId: "cryo" });

		expect(useGameStore.getState().progress.position).toEqual({ chapter: 1, x: 10, y: 20, roomId: "cryo" });
		expect(onRender).not.toHaveBeenCalled();
	});
});
