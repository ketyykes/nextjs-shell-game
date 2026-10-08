"use client";

/**
 * /play 頁面的 client 入口：Phaser 地圖在底層，終端機彈窗、NOVA 對話框與 HUD 疊在上面。
 *
 * 這裡只負責組裝，各職責拆在同目錄的 hook 與元件（設計文件 3.1、4.6、4.8）：
 * - `usePhaserBridge`：Phaser → React 的五個事件訂閱、設定同步給 Phaser、開發模式的除錯鉤子。
 * - `useTerminalSessions`：終端機彈窗開關與每台一個的 Shell 快取（`terminalSession.ts` 從存檔還原，壞掉就重建）。
 * - `useSolveFlow` 與 `usePressureReactions`：指令執行後的扣氧、過關流程、卡關反應階梯。
 * - `useNovaTriggers`：NOVA 地圖台詞的三個時機（開場、進艙區、過關後關掉終端機再說最後一句）。
 * - `usePauseMenu`、`useChapterNavigation`：暫停選單、章節結束、換章與重玩。
 * - `Hud`、`TerminalModal`、`objectiveDisplay`：畫面。
 */

import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChapterEndScreen } from "@/components/game/ChapterEndScreen";
import { shouldShowControlsHint } from "@/components/game/ControlsHint";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { Hud } from "@/components/game/Hud";
import { NovaDialogue } from "@/components/game/NovaDialogue";
import { objectiveDisplay } from "@/components/game/objectiveDisplay";
import { ObjectivePanel } from "@/components/game/ObjectivePanel";
import { OxygenVignette } from "@/components/game/OxygenVignette";
import { PauseMenu } from "@/components/game/PauseMenu";
import { PhaserGameDynamic } from "@/components/game/PhaserGameDynamic";
import { SceneCard, type SceneCardMessage } from "@/components/game/SceneCard";
import { SidePanels } from "@/components/game/SidePanels";
import { TerminalModal } from "@/components/game/TerminalModal";
import { useChapterNavigation } from "@/components/game/useChapterNavigation";
import { useNovaTriggers } from "@/components/game/useNovaTriggers";
import { usePauseMenu } from "@/components/game/usePauseMenu";
import { collectTerminalEffects, usePhaserBridge } from "@/components/game/usePhaserBridge";
import { usePlayTime } from "@/components/game/usePlayTime";
import { usePressureReactions } from "@/components/game/usePressureReactions";
import { useScenePreload } from "@/components/game/useScenePreload";
import { isAppleUserAgent, useSidePanelShortcuts, type SidePanelId } from "@/components/game/useSidePanelShortcuts";
import { useSolveFlow } from "@/components/game/useSolveFlow";
import { useTerminalSessions } from "@/components/game/useTerminalSessions";
import { SettingsMenu } from "@/components/title/SettingsMenu";
import { chapterTeaches, findTerminal, getChapter, isChapterComplete } from "@/game/chapters";
import { ENDING_LINES } from "@/game/chapters/ending";
import { ROOM_NAMES, type GameEventMap, type RoomId } from "@/game/phaser/events";
import { novaPortraitFor, type TerminalDefinition } from "@/game/story";
import { endingImage, outroImageForChapter, sceneImageForRoom } from "@/game/story/scenes";
import { selectOxygen, selectSettings, useGameStore, useStoreHydration } from "@/game/store";
import type { CharacterId } from "@/game/store/types";

export function PlayScreen() {
	const hydrated = useStoreHydration();
	const character = useGameStore((state) => state.progress.character);
	const router = useRouter();
	// 沒選過角就是沒有存檔（例如直接開 /play 網址）：回標題走選角、boot log 與 NOVA 第一句（G5）。等待期間不掛 Phaser
	const missingSave = hydrated && character === null;
	useEffect(() => {
		if (missingSave) {
			router.replace("/");
		}
	}, [missingSave, router]);
	if (!hydrated || character === null) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-game-bg font-terminal text-xl text-game-dim">
				讀取存檔中……
			</main>
		);
	}
	return <PlayScreenReady character={character} />;
}

interface PlayScreenReadyProps {
	/** 守門後一定有選角，所以不需要預設外觀。 */
	character: CharacterId;
}

/** 讀檔完成後才掛載，所以這裡的 store 讀寫都安全。 */
function PlayScreenReady({ character }: PlayScreenReadyProps) {
	// 目前章節：劇本、地圖、演出都從它來，只在掛載當下讀一次。換章是整頁重載（#31），
	// 按「進入下一章」到頁面真的卸載之間 store 已是下一章，若跟著訂閱會提前說掉下一章開場、重建 Phaser
	const [chapterNumber] = useState(() => useGameStore.getState().progress.chapter);
	// 只訂閱用得到的欄位：角色停下存位置、存檔時間這些 progress 變動不會讓整頁重新 render（A4）
	const { solvedTerminals, learnedCommands } = useGameStore(
		useShallow((state) => ({
			solvedTerminals: state.progress.solvedTerminals,
			learnedCommands: state.progress.learnedCommands,
		})),
	);
	const settings = useGameStore(selectSettings);
	const oxygen = useGameStore(selectOxygen);
	const updateSettings = useGameStore((state) => state.updateSettings);
	const novaPortrait = useGameStore((state) => novaPortraitFor(chapterNumber, state.storyFlags));
	const router = useRouter();

	const chapter = getChapter(chapterNumber);
	useScenePreload(chapter.chapter);
	const [terminalEffects] = useState(() => collectTerminalEffects(chapter));
	// 存檔裡這一章的角色位置（存檔 v2）：只在掛載當下讀一次，Phaser 建角色時用；之後的移動由 player:stopped 寫回
	const [savedPosition] = useState(() => {
		const position = useGameStore.getState().progress.position;
		if (position === null || position.chapter !== chapter.chapter) {
			return null;
		}
		return position;
	});

	const [nearbyTerminal, setNearbyTerminal] = useState<TerminalDefinition | null>(null);
	const [currentRoom, setCurrentRoom] = useState<RoomId | null>(savedPosition?.roomId ?? null);
	const [sceneReady, setSceneReady] = useState(false);
	const [sceneCard, setSceneCard] = useState<SceneCardMessage | null>(null);
	// 右側面板組目前打開哪一個（已學指令或對話紀錄），同時只開一個
	const [sidePanel, setSidePanel] = useState<SidePanelId | null>(null);
	// 讀檔完成後才掛載，已經在瀏覽器裡，可以直接讀 navigator
	const [appleKeyboard] = useState(() => isAppleUserAgent(window.navigator.userAgent));
	const handleSceneCardShown = useCallback(() => setSceneCard(null), []);

	const { openTerminal, openTerminalById, closeTerminal } = useTerminalSessions();
	const terminalOpen = openTerminal !== null;
	const nova = useNovaTriggers(chapter);
	const { flushSolvedLine } = nova;
	const pressure = usePressureReactions({
		chapter,
		openTerminal: openTerminal?.definition ?? null,
		solvedTerminals,
	});
	const { handleExecuted, justSolvedId } = useSolveFlow({ pressure, onSolved: nova.deferSolvedLine });
	const chapterNavigation = useChapterNavigation({ chapter, solvedTerminals, terminalOpen });
	const pauseMenu = usePauseMenu({ terminalOpen, chapterEndOpen: chapterNavigation.showChapterEnd });
	// 遊玩統計（M14-1）：這章還沒全解、選單沒開、分頁在前景時計時；章節結束畫面顯示本章紀錄
	usePlayTime(chapter.chapter, !isChapterComplete(chapter, solvedTerminals) && !pauseMenu.menuOpen);
	const chapterStats = useGameStore((state) => state.stats[String(chapter.chapter)]);

	// 關閉終端機後，地圖上的 NOVA 重說這次過關台詞的最後一句（#5）
	const handleCloseTerminal = useCallback(() => {
		if (closeTerminal()) {
			flushSolvedLine();
		}
	}, [closeTerminal, flushSolvedLine]);

	const handlePlayerStopped = ({ x, y, roomId }: GameEventMap["player:stopped"]) => {
		useGameStore.getState().savePlayerPosition({ chapter: chapter.chapter, x, y, roomId });
	};
	const handleRoomEnter = (roomId: RoomId) => {
		setCurrentRoom(roomId);
		if (!nova.enterRoom(roomId)) {
			return;
		}
		// 第一次進艙區：先秀插圖卡，NOVA 的進房台詞接在後面（#16）
		const image = sceneImageForRoom(roomId);
		if (image !== undefined) {
			setSceneCard({
				id: `room-${roomId}`,
				src: image,
				title: ROOM_NAMES[roomId],
				subtitle: `Kepler-9 · ${chapter.deckName}`,
			});
		}
	};
	const handleTerminalNearby = (terminalId: string | null) => {
		if (terminalId === null) {
			setNearbyTerminal(null);
			return;
		}
		setNearbyTerminal(findTerminal(terminalId) ?? null);
	};
	usePhaserBridge({
		settings,
		onTerminalOpen: openTerminalById,
		onTerminalNearby: handleTerminalNearby,
		onSceneReady: () => setSceneReady(true),
		onPlayerStopped: handlePlayerStopped,
		onRoomEnter: handleRoomEnter,
	});

	// 右側面板組的 Alt 快捷鍵（4.6）：地圖上與終端機裡都能按（面板疊在彈窗之上），暫停、設定與章節結束畫面開著時不處理
	const toggleSidePanel = useCallback((id: SidePanelId) => {
		setSidePanel((current) => (current === id ? null : id));
	}, []);
	useSidePanelShortcuts({
		enabled: !pauseMenu.menuOpen && !chapterNavigation.showChapterEnd,
		onToggle: toggleSidePanel,
	});

	const objective = objectiveDisplay({
		terminals: chapter.terminals,
		solvedTerminals,
		openTerminalId: openTerminal?.definition.id ?? null,
		nearbyTerminalId: nearbyTerminal?.id ?? null,
		justSolvedId,
	});
	const chapterSolvedCount = chapter.terminals.filter((terminal) => solvedTerminals.includes(terminal.id)).length;
	const { nextChapter } = chapterNavigation;

	return (
		<main
			className="relative h-screen w-screen overflow-hidden bg-game-bg font-terminal text-game-text"
			data-scene-ready={sceneReady ? "true" : "false"}
			data-chapter={chapter.chapter}
		>
			<PhaserGameDynamic
				character={character}
				chapter={chapter.map.deck}
				startDark={chapter.map.startDark}
				terminalEffects={terminalEffects}
				solvedTerminals={solvedTerminals}
				volume={settings.volume}
				muted={settings.muted}
				spawnPoint={savedPosition}
				flickerEnabled={settings.flickerEnabled}
				className="flex h-full w-full items-center justify-center"
			/>

			<Hud
				oxygen={oxygen}
				room={currentRoom}
				nearbyTerminal={nearbyTerminal}
				terminalOpen={terminalOpen}
				showControlsHint={shouldShowControlsHint({ chapter: chapter.chapter, solvedTerminals, terminalOpen })}
			/>
			<ObjectivePanel
				title={objective.title}
				description={objective.description}
				solved={objective.solved}
				progress={{ solved: chapterSolvedCount, total: chapter.terminals.length }}
			/>
			<SidePanels
				active={sidePanel}
				onActiveChange={setSidePanel}
				learnedCommands={learnedCommands}
				novaLog={nova.history}
				appleKeyboard={appleKeyboard}
			/>
			<NovaDialogue queue={nova.queue} textSpeed={settings.textSpeed} onShown={nova.dismiss} portrait={novaPortrait} />

			<AnimatePresence>
				{openTerminal !== null && (
					<TerminalModal
						key={openTerminal.definition.id}
						definition={openTerminal.definition}
						shell={openTerminal.shell}
						textSpeed={settings.textSpeed}
						onClose={handleCloseTerminal}
						onExecuted={handleExecuted}
					/>
				)}
			</AnimatePresence>

			{chapterNavigation.showChapterEnd && (
				<ChapterEndScreen
					chapterNumber={chapter.chapter}
					chapterTitle={chapter.title}
					outroLines={chapter.outro ?? []}
					learnedCommands={chapterTeaches(chapter)}
					textSpeed={settings.textSpeed}
					illustrationSrc={outroImageForChapter(chapter.chapter)}
					nextChapter={
						nextChapter === null
							? null
							: { number: nextChapter.chapter, title: nextChapter.title, deckName: nextChapter.deckName }
					}
					ending={nextChapter === null ? { lines: ENDING_LINES, illustrationSrc: endingImage() } : undefined}
					onMounted={chapterNavigation.handleChapterEndMounted}
					onReturnToTitle={chapterNavigation.handleReturnToTitle}
					onNextChapter={chapterNavigation.handleNextChapter}
					skipOutro={chapterNavigation.outroAlreadyShown}
					stats={chapterStats}
				/>
			)}

			<SceneCard card={sceneCard} onShown={handleSceneCardShown} />

			<PauseMenu
				open={pauseMenu.paused && !pauseMenu.settingsOpen}
				onResume={pauseMenu.resume}
				onReturnToTitle={() => router.push("/")}
				onRestartChapter={chapterNavigation.handleRestartChapter}
				onOpenSettings={pauseMenu.openSettings}
			/>
			{pauseMenu.settingsOpen && (
				<SettingsMenu settings={settings} onChange={updateSettings} onClose={pauseMenu.closeSettings} />
			)}

			<OxygenVignette oxygen={oxygen} />
			<CrtOverlay
				scanlines={settings.scanlinesEnabled}
				vignette={settings.vignetteEnabled}
				flicker={settings.flickerEnabled}
			/>
		</main>
	);
}
