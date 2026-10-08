import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import { outroShownFlag, roomEnteredFlag, type ChapterDefinition } from "@/game/story";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { reloadPage } from "./reloadPage";
import { useChapterNavigation } from "./useChapterNavigation";

const mocks = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("./reloadPage", () => ({ reloadPage: vi.fn() }));

const CHAPTER_ONE = getChapter(1);
const LAST_CHAPTER = getChapter(6);
const ALL_CHAPTER_ONE = CHAPTER_ONE.terminals.map((terminal) => terminal.id);

interface HookProps {
	chapter: ChapterDefinition;
	solvedTerminals: string[];
	terminalOpen: boolean;
}

function setup(props: Partial<HookProps> = {}) {
	const initialProps: HookProps = { chapter: CHAPTER_ONE, solvedTerminals: [], terminalOpen: false, ...props };
	return renderHook((hookProps: HookProps) => useChapterNavigation(hookProps), { initialProps });
}

beforeEach(() => {
	mocks.routerPush.mockClear();
	vi.mocked(reloadPage).mockClear();
	useGameStore.setState(createInitialSaveData());
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("useChapterNavigation 章節結束畫面", () => {
	it("六台全解且終端機關著才顯示", () => {
		expect(setup({ solvedTerminals: ALL_CHAPTER_ONE.slice(0, 5) }).result.current.showChapterEnd).toBe(false);
		expect(setup({ solvedTerminals: ALL_CHAPTER_ONE, terminalOpen: true }).result.current.showChapterEnd).toBe(false);
		expect(setup({ solvedTerminals: ALL_CHAPTER_ONE }).result.current.showChapterEnd).toBe(true);
	});

	it("outro 旗標只決定從哪裡開始，畫面一定出現（#37）", () => {
		useGameStore.getState().setFlag(outroShownFlag(1));
		const { result } = setup({ solvedTerminals: ALL_CHAPTER_ONE });
		expect(result.current.showChapterEnd).toBe(true);
		expect(result.current.outroAlreadyShown).toBe(true);
	});

	it("下一章的劇本；最後一章是 null", () => {
		expect(setup().result.current.nextChapter?.chapter).toBe(2);
		expect(setup({ chapter: LAST_CHAPTER }).result.current.nextChapter).toBeNull();
	});

	it("畫面掛上時存檔", () => {
		const { result } = setup();
		act(() => {
			result.current.handleChapterEndMounted();
		});
		expect(useGameStore.getState().progress.savedAt).not.toBeNull();
	});
});

describe("useChapterNavigation 離開章節", () => {
	it("回標題：記 outro 播過，導到首頁，不重載", () => {
		const { result } = setup();
		act(() => {
			result.current.handleReturnToTitle();
		});
		expect(useGameStore.getState().storyFlags[outroShownFlag(1)]).toBe(true);
		expect(mocks.routerPush).toHaveBeenCalledWith("/");
		expect(reloadPage).not.toHaveBeenCalled();
	});

	it("進下一章：記 outro 播過、章節加一、整頁重載（#31）", () => {
		const { result } = setup();
		act(() => {
			result.current.handleNextChapter();
		});
		const state = useGameStore.getState();
		expect(state.storyFlags[outroShownFlag(1)]).toBe(true);
		expect(state.progress.chapter).toBe(2);
		expect(reloadPage).toHaveBeenCalledTimes(1);
	});

	it("重玩本章：只清這章的進度並存檔，整頁重載（#18）", () => {
		const store = useGameStore.getState();
		store.markTerminalSolved("ch1-t1");
		store.learnCommand("pwd");
		store.setFlag(roomEnteredFlag(1, "cryo"));
		const { result } = setup();
		act(() => {
			result.current.handleRestartChapter();
		});

		const state = useGameStore.getState();
		expect(state.progress.solvedTerminals).toEqual([]);
		expect(state.storyFlags[roomEnteredFlag(1, "cryo")]).toBeUndefined();
		expect(state.progress.learnedCommands).toEqual(["pwd"]);
		expect(state.progress.savedAt).not.toBeNull();
		expect(reloadPage).toHaveBeenCalledTimes(1);
	});
});
