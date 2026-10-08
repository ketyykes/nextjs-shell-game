"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { getNextChapter, isChapterComplete } from "@/game/chapters";
import { outroShownFlag, type ChapterDefinition } from "@/game/story";
import { useGameStore } from "@/game/store";
import { reloadPage } from "./reloadPage";

export interface UseChapterNavigationOptions {
	chapter: ChapterDefinition;
	solvedTerminals: readonly string[];
	terminalOpen: boolean;
}

export interface UseChapterNavigationResult {
	/** 章節結束畫面要不要顯示。 */
	showChapterEnd: boolean;
	/** 這章的 outro 播過了，章節結束畫面直接從回顧卡開始。 */
	outroAlreadyShown: boolean;
	/** 下一章的劇本，已是最後一章是 null（章節結束畫面改播片尾）。 */
	nextChapter: ChapterDefinition | null;
	/** 章節結束畫面掛上時存一次檔。 */
	handleChapterEndMounted: () => void;
	/** 章節結束畫面的「回標題」：記這章結尾播過，回首頁。 */
	handleReturnToTitle: () => void;
	/** 章節結束畫面的「進入下一章」。 */
	handleNextChapter: () => void;
	/** 暫停選單的「重玩本章」。 */
	handleRestartChapter: () => void;
}

/**
 * 章節的進出（設計文件 4.7）：章節結束畫面何時出現、回標題、進下一章、重玩本章。
 *
 * - 六台都過關且終端機已關閉時**一定**顯示章節結束畫面；outro 旗標只決定要不要重播台詞，
 *   否則回標題再「繼續」會被困在已完成的甲板（#37，第九場 B3）。
 * - 進下一章：記這章結尾播過、章節號加一，整頁重載讓 Phaser 載新地圖、Shell 快取與 NOVA 佇列從頭開始（#31）。
 * - 重玩本章：只清這一章的終端機、過關與旗標（已學指令、外觀、設定與前幾章都留著），整頁重載（#18、#31）。
 */
export function useChapterNavigation({
	chapter,
	solvedTerminals,
	terminalOpen,
}: UseChapterNavigationOptions): UseChapterNavigationResult {
	const router = useRouter();
	const outroAlreadyShown = useGameStore((state) => state.storyFlags[outroShownFlag(chapter.chapter)] === true);
	const showChapterEnd = isChapterComplete(chapter, solvedTerminals) && !terminalOpen;
	const nextChapter = getNextChapter(chapter.chapter);

	const handleChapterEndMounted = useCallback(() => {
		useGameStore.getState().touchSave();
	}, []);

	const handleReturnToTitle = useCallback(() => {
		useGameStore.getState().setFlag(outroShownFlag(chapter.chapter));
		router.push("/");
	}, [chapter.chapter, router]);

	const handleNextChapter = useCallback(() => {
		const store = useGameStore.getState();
		store.setFlag(outroShownFlag(chapter.chapter));
		store.advanceChapter();
		reloadPage();
	}, [chapter.chapter]);

	const handleRestartChapter = useCallback(() => {
		const store = useGameStore.getState();
		store.resetChapter(chapter.chapter);
		store.touchSave();
		reloadPage();
	}, [chapter.chapter]);

	return useMemo(
		() => ({
			showChapterEnd,
			outroAlreadyShown,
			nextChapter,
			handleChapterEndMounted,
			handleReturnToTitle,
			handleNextChapter,
			handleRestartChapter,
		}),
		[
			showChapterEnd,
			outroAlreadyShown,
			nextChapter,
			handleChapterEndMounted,
			handleReturnToTitle,
			handleNextChapter,
			handleRestartChapter,
		],
	);
}
