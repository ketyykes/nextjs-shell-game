"use client";

/**
 * 標題畫面的流程容器（設計文件 4.7）：
 * 標題 → 新遊戲：選角 → 開場 boot log → /play；繼續：直接 /play；設定：覆蓋在標題上。
 * 選章：重玩到過的某一章，第一章重走 boot log（NOVA 第一句在那裡說），其他章直接 /play。
 * 讀檔完成前只顯示載入字樣，確保「繼續」的出現與否是可信的。
 * 觸控為主的裝置先疊一層「需要實體鍵盤」的提示，可以略過（設計文件 4.6）。
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { SceneCard } from "@/components/game/SceneCard";
import { BootLog } from "@/components/title/BootLog";
import { CharacterSelect } from "@/components/title/CharacterSelect";
import { SettingsMenu } from "@/components/title/SettingsMenu";
import type { ChapterOption } from "@/components/title/ChapterSelectPanel";
import { TitleScreen } from "@/components/title/TitleScreen";
import { TouchWarningPanel } from "@/components/title/TouchWarningPanel";
import { useTouchWarning } from "@/components/title/useTouchWarning";
import { getChapterMeta, NOVA_FIRST_LINE } from "@/game/chapters/meta";
import { INTRO_SCENE_IMAGE } from "@/game/story/scenes";
import { selectHasSave, selectProgress, selectSettings, useGameStore, useStoreHydration } from "@/game/store";
import type { CharacterId } from "@/game/store/types";

type TitleStage = "title" | "character" | "boot" | "intro";

/** boot log 結束後的開場插圖卡，淡出後進地圖。 */
const INTRO_CARD = {
	id: "intro",
	src: INTRO_SCENE_IMAGE,
	title: "冷凍艙",
	subtitle: "Kepler-9 研究站 · 木星軌道",
};

const CHINESE_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function chapterNumeral(chapter: number): string {
	return CHINESE_NUMERALS[chapter] ?? String(chapter);
}

/** 標題副標：有存檔顯示目前進度的章節，例如「資料中心 · 第二章」。 */
function subtitleFor(chapter: number): string {
	const meta = getChapterMeta(chapter);
	return `${meta.deckName} · 第${chapterNumeral(meta.chapter)}章`;
}

/** 選章清單：第一章到最遠章節，例如「第二章 資料中心」。 */
function chapterOptions(furthestChapter: number): ChapterOption[] {
	const options: ChapterOption[] = [];
	for (let chapter = 1; chapter <= furthestChapter; chapter += 1) {
		const meta = getChapterMeta(chapter);
		options.push({ number: chapter, label: `第${chapterNumeral(chapter)}章 ${meta.deckName}` });
	}
	return options;
}

export function TitleFlow() {
	const hydrated = useStoreHydration();
	if (!hydrated) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-black font-terminal text-xl text-game-dim">
				讀取存檔中……
			</main>
		);
	}
	return <TitleFlowReady />;
}

function TitleFlowReady() {
	const router = useRouter();
	const hasSave = useGameStore(selectHasSave);
	const settings = useGameStore(selectSettings);
	const progress = useGameStore(selectProgress);
	const resetSave = useGameStore((state) => state.resetSave);
	const setCharacter = useGameStore((state) => state.setCharacter);
	const updateSettings = useGameStore((state) => state.updateSettings);
	const touchSave = useGameStore((state) => state.touchSave);
	const selectChapter = useGameStore((state) => state.selectChapter);

	const [stage, setStage] = useState<TitleStage>("title");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const touchWarning = useTouchWarning();

	const handleNewGame = useCallback(() => {
		// 覆蓋確認已在 TitleScreen 內做過，這裡直接清進度（設定保留）
		resetSave();
		setStage("character");
	}, [resetSave]);

	const handleCharacterConfirm = useCallback(
		(character: CharacterId) => {
			setCharacter(character);
			// 選完角就算有存檔，中途關掉瀏覽器回來能按「繼續」
			touchSave();
			setStage("boot");
		},
		[setCharacter, touchSave],
	);

	const goToPlay = useCallback(() => {
		router.push("/play");
	}, [router]);

	const handleSelectChapter = useCallback(
		(chapter: number) => {
			if (!selectChapter(chapter)) {
				return;
			}
			if (chapter === 1) {
				setStage("boot");
				return;
			}
			goToPlay();
		},
		[goToPlay, selectChapter],
	);

	if (stage === "character") {
		return (
			<CharacterSelect
				initial={progress.character ?? "a"}
				onConfirm={handleCharacterConfirm}
				onBack={() => setStage("title")}
			/>
		);
	}

	if (stage === "boot") {
		return (
			<BootLog textSpeed={settings.textSpeed} novaFirstLine={NOVA_FIRST_LINE} onDone={() => setStage("intro")} />
		);
	}

	if (stage === "intro") {
		return (
			<main className="min-h-screen bg-black">
				<SceneCard card={INTRO_CARD} onShown={goToPlay} />
			</main>
		);
	}

	return (
		<>
			<TitleScreen
				hasSave={hasSave}
				subtitle={subtitleFor(hasSave ? progress.chapter : 1)}
				onContinue={goToPlay}
				onNewGame={handleNewGame}
				onOpenSettings={() => setSettingsOpen(true)}
				chapters={chapterOptions(progress.furthestChapter)}
				onSelectChapter={handleSelectChapter}
				keyboardEnabled={!settingsOpen && !touchWarning.visible}
				crt={{
					scanlines: settings.scanlinesEnabled,
					vignette: settings.vignetteEnabled,
					flicker: settings.flickerEnabled,
				}}
			/>
			{settingsOpen && (
				<SettingsMenu settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
			)}
			{touchWarning.visible && <TouchWarningPanel onDismiss={touchWarning.dismiss} />}
		</>
	);
}
