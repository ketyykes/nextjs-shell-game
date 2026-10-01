"use client";

/**
 * 標題畫面的流程容器（設計文件 4.7）：
 * 標題 → 新遊戲：選角 → 開場 boot log → /play；繼續：直接 /play；設定：覆蓋在標題上。
 * 讀檔完成前只顯示載入字樣，確保「繼續」的出現與否是可信的。
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { SceneCard } from "@/components/game/SceneCard";
import { BootLog } from "@/components/title/BootLog";
import { CharacterSelect } from "@/components/title/CharacterSelect";
import { SettingsMenu } from "@/components/title/SettingsMenu";
import { TitleScreen } from "@/components/title/TitleScreen";
import { chapterOneLifeSupport, getChapter } from "@/game/chapters";
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

/** 開場 boot log 最後接的 NOVA 第一句，其餘句子進地圖後由 PlayScreen 排進對話框。 */
const NOVA_FIRST_LINE = chapterOneLifeSupport.intro?.[0] ?? "技師，聽得到嗎？";

const CHINESE_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 標題副標：有存檔顯示目前進度的章節，例如「資料中心 · 第二章」。 */
function subtitleFor(chapter: number): string {
	const definition = getChapter(chapter);
	const numeral = CHINESE_NUMERALS[definition.chapter] ?? String(definition.chapter);
	return `${definition.deckName} · 第${numeral}章`;
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

	const [stage, setStage] = useState<TitleStage>("title");
	const [settingsOpen, setSettingsOpen] = useState(false);

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
				keyboardEnabled={!settingsOpen}
				crt={{
					scanlines: settings.scanlinesEnabled,
					vignette: settings.vignetteEnabled,
					flicker: settings.flickerEnabled,
				}}
			/>
			{settingsOpen && (
				<SettingsMenu settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
			)}
		</>
	);
}
