"use client";

/**
 * /play 頁面的 client 入口：Phaser 地圖在底層，終端機彈窗、NOVA 對話框與 HUD 疊在上面。
 *
 * 流程（設計文件 3.1、4.6、4.8）：
 * - Phaser 的 Station 場景在玩家按 E 時發 `terminal:open`，這裡開啟對應終端機的 shell 彈窗，Phaser 自己暫停。
 * - 每次指令執行後做目標判定：錯誤扣氧氣；過關則記錄、回氧、學指令、發 `puzzle:solved` 讓 Phaser 播演出。
 * - NOVA 台詞三個時機：進艙區（地圖對話框，每間一次）、開終端機（內嵌區塊，每台一次）、過關（內嵌，關閉後地圖再說最後一句）。
 * - 每台終端機的 Shell 實例在這個元件存活期間只建一次；輸出紀錄與 shell 狀態同步進 store，重整後能接續。
 */

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChapterEndScreen } from "@/components/game/ChapterEndScreen";
import { ControlsHint, shouldShowControlsHint } from "@/components/game/ControlsHint";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { NovaDialogue } from "@/components/game/NovaDialogue";
import { ObjectivePanel } from "@/components/game/ObjectivePanel";
import { OxygenVignette } from "@/components/game/OxygenVignette";
import { PauseMenu } from "@/components/game/PauseMenu";
import { PhaserGameDynamic } from "@/components/game/PhaserGameDynamic";
import { SceneCard, type SceneCardMessage } from "@/components/game/SceneCard";
import { SidePanels } from "@/components/game/SidePanels";
import { createObjectiveDoneEntry, solvedSoundFor } from "@/components/game/solvedFeedback";
import { SettingsMenu } from "@/components/title/SettingsMenu";
import { useNovaQueue } from "@/components/game/useNovaQueue";
import { useScenePreload } from "@/components/game/useScenePreload";
import { isAppleUserAgent, useSidePanelShortcuts, type SidePanelId } from "@/components/game/useSidePanelShortcuts";
import { useTerminalPressure } from "@/components/game/useTerminalPressure";
import { Terminal } from "@/components/terminal";
import { chapterTeaches, findTerminal, getChapter, getNextChapter, isChapterComplete } from "@/game/chapters";
import { ENDING_LINES } from "@/game/chapters/ending";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import { ROOM_NAMES, type RoomId, type SolvedEffect } from "@/game/phaser/events";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import {
	createObjectiveContext,
	evaluateObjective,
	introShownFlag,
	novaPortraitFor,
	outroShownFlag,
	roomEnteredFlag,
	type ChapterDefinition,
	type TerminalDefinition,
} from "@/game/story";
import { currentObjectiveTerminal } from "@/game/story/currentObjective";
import {
	FLICKER_DURATION_MS,
	novaErrorLine,
	STUCK_REMINDER_LINES,
	stuckLines,
	type PressureReaction,
} from "@/game/story/pressure";
import { endingImage, outroImageForChapter, sceneImageForRoom } from "@/game/story/scenes";
import { selectOxygen, selectProgress, selectSettings, useGameStore, useStoreHydration } from "@/game/store";
import type { CharacterId, OutputEntry, SettingsState, TerminalSessionRecord } from "@/game/store/types";

/** 還沒做選角（M7-2）之前的預設外觀。 */
const DEFAULT_CHARACTER: CharacterId = "a";

/** 過關後目標面板保持打勾狀態的毫秒數，之後切到下一個目標。 */
const SOLVED_FLASH_MS = 3000;

/** `teaches` 可能是 `ls -a` 這種帶參數的字串，shell 的已學清單只認指令名。 */
function toCommandName(teach: string): string {
	return teach.split(/\s+/)[0] ?? teach;
}

/**
 * 依存檔建立或還原 Shell。
 * 有存過就從 `record.shell` 還原（含修改過的檔案系統），沒有就用劇本的初始快照。
 */
function createShellForTerminal(
	definition: TerminalDefinition,
	learnedCommands: string[],
	record: TerminalSessionRecord | undefined,
): Shell {
	const commandNames = learnedCommands.map(toCommandName);
	if (record !== undefined) {
		const shell = Shell.fromState(record.shell, VirtualFileSystem.fromSerialized(record.shell.fs), definition.hints);
		for (const name of commandNames) {
			shell.learn(name);
		}
		return shell;
	}
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(definition.fs),
		terminalId: definition.id,
		hints: definition.hints,
		learnedCommands: commandNames,
		cwd: definition.initialCwd,
		env: definition.env,
		processes: definition.processes,
	});
}

/** 這一章有演出的終端機 → 演出種類，經 registry 交給 Station。 */
function collectTerminalEffects(chapter: ChapterDefinition): Record<string, SolvedEffect> {
	const effects: Record<string, SolvedEffect> = {};
	for (const terminal of chapter.terminals) {
		if (terminal.effect !== undefined) {
			effects[terminal.id] = terminal.effect;
		}
	}
	return effects;
}

/** 開啟終端機時的歡迎行，來自劇本的 `banner`。 */
function createBannerEntries(definition: TerminalDefinition): OutputEntry[] {
	if (definition.banner === undefined || definition.banner.length === 0) {
		return [];
	}
	return [{ kind: "system", id: `banner-${definition.id}`, lines: definition.banner }];
}

/** 把 NOVA 的一串台詞變成終端機內嵌的對話區塊。id 前綴跟 Terminal 自己產的 `entry-` 區隔。 */
function createDialogueEntries(prefix: string, lines: string[]): OutputEntry[] {
	return lines.map((text, index) => ({ kind: "dialogue", id: `${prefix}-${index}`, speaker: "NOVA", text }));
}

interface OpenTerminal {
	definition: TerminalDefinition;
	shell: Shell;
}

/**
 * 取得某台終端機的 Shell，沒有就建一個並記進快取，第一次開時寫第一筆 session 進 store。
 */
function resolveShell(cache: Map<string, Shell>, definition: TerminalDefinition): Shell {
	const existing = cache.get(definition.id);
	if (existing !== undefined) {
		return existing;
	}
	const store = useGameStore.getState();
	const record = store.terminals[definition.id];
	const shell = createShellForTerminal(definition, store.progress.learnedCommands, record);
	if (record === undefined) {
		store.saveTerminalSession(definition.id, { shell: shell.toState(), transcript: createBannerEntries(definition) });
	}
	cache.set(definition.id, shell);
	return shell;
}

export function PlayScreen() {
	const hydrated = useStoreHydration();
	if (!hydrated) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-game-bg font-terminal text-xl text-game-dim">
				讀取存檔中……
			</main>
		);
	}
	return <PlayScreenReady />;
}

/** 讀檔完成後才掛載，所以這裡的 store 讀寫都安全。 */
function PlayScreenReady() {
	const progress = useGameStore(selectProgress);
	const settings = useGameStore(selectSettings);
	const oxygen = useGameStore(selectOxygen);
	const storyFlags = useGameStore((state) => state.storyFlags);
	const setFlag = useGameStore((state) => state.setFlag);
	const loseOxygen = useGameStore((state) => state.loseOxygen);
	const restoreOxygen = useGameStore((state) => state.restoreOxygen);
	const markTerminalSolved = useGameStore((state) => state.markTerminalSolved);
	const learnCommand = useGameStore((state) => state.learnCommand);
	const appendTranscript = useGameStore((state) => state.appendTranscript);
	const touchSave = useGameStore((state) => state.touchSave);
	const updateSettings = useGameStore((state) => state.updateSettings);
	const setTerminalErrorCount = useGameStore((state) => state.setTerminalErrorCount);
	const advanceChapter = useGameStore((state) => state.advanceChapter);
	const router = useRouter();

	// 目前章節：劇本、地圖、演出都從它來；章節結束按「進入下一章」會換
	const chapter = getChapter(progress.chapter);
	useScenePreload(chapter.chapter);
	const [terminalEffects] = useState(() => collectTerminalEffects(chapter));
	const chapterSolvedCount = chapter.terminals.filter((terminal) => progress.solvedTerminals.includes(terminal.id)).length;
	// 存檔裡這一章的角色位置（存檔 v2）：只在掛載當下讀一次，Phaser 建角色時用；之後的移動由 player:stopped 寫回
	const [savedPosition] = useState(() => {
		const position = useGameStore.getState().progress.position;
		if (position === null || position.chapter !== chapter.chapter) {
			return null;
		}
		return position;
	});

	const [openTerminal, setOpenTerminal] = useState<OpenTerminal | null>(null);
	const [nearbyTerminal, setNearbyTerminal] = useState<TerminalDefinition | null>(null);
	const [currentRoom, setCurrentRoom] = useState<RoomId | null>(savedPosition?.roomId ?? null);
	const [justSolvedId, setJustSolvedId] = useState<string | null>(null);
	// 右側面板組目前打開哪一個（已學指令或對話紀錄），同時只開一個
	const [sidePanel, setSidePanel] = useState<SidePanelId | null>(null);
	// 讀檔完成後才掛載，已經在瀏覽器裡，可以直接讀 navigator
	const [appleKeyboard] = useState(() => isAppleUserAgent(window.navigator.userAgent));
	const [sceneReady, setSceneReady] = useState(false);
	const [paused, setPaused] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [sceneCard, setSceneCard] = useState<SceneCardMessage | null>(null);
	const nova = useNovaQueue();
	const handleSceneCardShown = useCallback(() => setSceneCard(null), []);

	// 每台終端機一個 Shell 實例，整個遊玩期間保留。只在事件 handler 裡存取，不在 render 期間碰 ref。
	const shellsRef = useRef(new Map<string, Shell>());
	// 這次開啟期間過關的 NOVA 最後一句，關閉後在地圖上再說一次
	const pendingSolvedLineRef = useRef<{ prefix: string; text: string } | null>(null);

	// 開發模式的除錯鉤子：在瀏覽器 console 用 window.__kepler9.emit("puzzle:solved", { terminalId: "ch1-t4" }) 可直接觸發演出
	useEffect(() => {
		if (process.env.NODE_ENV === "production") {
			return;
		}
		const devWindow = window as Window & { __kepler9?: { emit: typeof emitGameEvent } };
		devWindow.__kepler9 = { emit: emitGameEvent };
		return () => {
			delete devWindow.__kepler9;
		};
	}, []);

	// 開場台詞：第一章的第一句已在標題流程的 boot log 說過，進地圖後接著說其餘句子；其他章節整段都在這裡說。只在第一次進該章時說
	useEffect(() => {
		const flag = introShownFlag(chapter.chapter);
		if (storyFlags[flag] === true) {
			return;
		}
		setFlag(flag);
		let lines = chapter.intro ?? [];
		if (chapter.chapter === 1) {
			lines = lines.slice(1);
		}
		nova.enqueue(`intro-${chapter.chapter}`, lines);
	}, [chapter, nova, setFlag, storyFlags]);

	// 暫停選單（4.7）：地圖上按 Esc 開啟；終端機開著、章節結束畫面或設定選單顯示中時不處理（它們各自處理 Esc）
	const pauseBlocked = openTerminal !== null || settingsOpen;
	useEffect(() => {
		if (paused || pauseBlocked) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.repeat) {
				return;
			}
			event.preventDefault();
			setPaused(true);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [pauseBlocked, paused]);

	// 暫停或設定選單開著時讓 Phaser 停住角色輸入
	const menuOpen = paused || settingsOpen;
	useEffect(() => {
		if (!menuOpen) {
			return;
		}
		emitGameEvent("game:pause", { reason: "menu" });
		return () => {
			emitGameEvent("game:resume", { reason: "menu" });
		};
	}, [menuOpen]);

	const handleRestartChapter = useCallback(() => {
		// 重玩本章：只清這一章的終端機、過關與旗標（已學指令、外觀、設定與前幾章都留著），重新載入讓 Phaser 與 Shell 快取都重建
		const store = useGameStore.getState();
		store.resetChapter(chapter.chapter);
		store.touchSave();
		window.location.reload();
	}, [chapter.chapter]);

	// 章節結束（4.7）：六台都過關且終端機已關閉時顯示過場、NOVA 結尾台詞與指令回顧卡。
	// outro 旗標只決定要不要重播台詞；畫面本身一定要出現，否則回標題再「繼續」會被困在已完成的甲板（第九場 B3）
	const allSolved = isChapterComplete(chapter, progress.solvedTerminals);
	const showChapterEnd = allSolved && openTerminal === null;
	const outroAlreadyShown = storyFlags[outroShownFlag(chapter.chapter)] === true;
	const nextChapter = getNextChapter(chapter.chapter);
	const handleChapterEndMounted = useCallback(() => {
		touchSave();
	}, [touchSave]);
	const handleReturnToTitle = useCallback(() => {
		setFlag(outroShownFlag(chapter.chapter));
		router.push("/");
	}, [chapter.chapter, router, setFlag]);
	const handleNextChapter = useCallback(() => {
		// 進下一章：記這章結尾播過、章節號加一；換章後整頁重載，Phaser 載新地圖、Shell 快取與 NOVA 佇列都從頭開始
		setFlag(outroShownFlag(chapter.chapter));
		advanceChapter();
		window.location.reload();
	}, [advanceChapter, chapter.chapter, setFlag]);

	// 右側面板組的 Alt 快捷鍵（4.6）：地圖上與終端機裡都能按（面板疊在彈窗之上），暫停、設定與章節結束畫面開著時不處理
	const toggleSidePanel = useCallback((id: SidePanelId) => {
		setSidePanel((current) => (current === id ? null : id));
	}, []);
	useSidePanelShortcuts({
		enabled: !menuOpen && !showChapterEnd,
		onToggle: toggleSidePanel,
	});

	// 設定選單改音量或靜音時即時通知 Phaser 的 AudioManager
	useEffect(() => {
		emitGameEvent("audio:settings", { volume: settings.volume, muted: settings.muted });
	}, [settings.muted, settings.volume]);

	// 設定選單切換閃爍時即時通知 Phaser（人影、鏡頭震動與閃光、燈閃）
	useEffect(() => {
		emitGameEvent("effects:settings", { flickerEnabled: settings.flickerEnabled });
	}, [settings.flickerEnabled]);

	// 卡關偵測與環境反應階梯（4.8）：只對開著且未過關的終端機計數
	const pressureTerminalId =
		openTerminal !== null && !progress.solvedTerminals.includes(openTerminal.definition.id)
			? openTerminal.definition.id
			: null;
	const handlePressureReaction = useCallback(
		(reaction: PressureReaction) => {
			if (openTerminal === null) {
				return;
			}
			const definition = openTerminal.definition;
			switch (reaction.type) {
				case "flicker":
					// 光敏安全選項：關閉閃爍時不發
					if (useGameStore.getState().settings.flickerEnabled) {
						emitGameEvent("ambient:flicker", { durationMs: FLICKER_DURATION_MS });
					}
					return;
				case "door":
					emitGameEvent("sfx:play", { sound: "door" });
					return;
				case "nova": {
					const text = novaErrorLine(chapter.novaErrorLines, reaction.lineIndex);
					appendTranscript(
						definition.id,
						createDialogueEntries(`nova-error-${definition.id}-${reaction.lineIndex}-${Date.now()}`, [text]),
					);
					return;
				}
				case "stuck":
					// 重複提醒用系統行提示輸入 hint（M10-5），第一次才是 NOVA 的劇本台詞
					if (reaction.repeat) {
						appendTranscript(definition.id, [
							{ kind: "system", id: `stuck-reminder-${definition.id}-${Date.now()}`, lines: [...STUCK_REMINDER_LINES] },
						]);
						return;
					}
					appendTranscript(
						definition.id,
						createDialogueEntries(`nova-stuck-${definition.id}-${Date.now()}`, stuckLines(definition)),
					);
					return;
			}
		},
		[appendTranscript, chapter.novaErrorLines, openTerminal],
	);
	const handleErrorCountChange = useCallback(
		(count: number) => {
			if (pressureTerminalId !== null) {
				setTerminalErrorCount(pressureTerminalId, count);
			}
		},
		[pressureTerminalId, setTerminalErrorCount],
	);
	const pressure = useTerminalPressure({
		terminalId: pressureTerminalId,
		initialErrorCount:
			pressureTerminalId !== null ? (useGameStore.getState().terminals[pressureTerminalId]?.errorCount ?? 0) : 0,
		onReaction: handlePressureReaction,
		onErrorCountChange: handleErrorCountChange,
	});

	// Phaser → React 的事件
	useEffect(() => {
		const unsubscribeOpen = onGameEvent("terminal:open", ({ terminalId }) => {
			const definition = findTerminal(terminalId);
			if (definition === undefined) {
				console.warn(`[PlayScreen] 劇本裡沒有終端機 ${terminalId}，先把 Phaser 恢復`);
				emitGameEvent("terminal:close", { terminalId });
				return;
			}
			setOpenTerminal({ definition, shell: resolveShell(shellsRef.current, definition) });
		});
		const unsubscribeNearby = onGameEvent("terminal:nearby", ({ terminalId }) => {
			if (terminalId === null) {
				setNearbyTerminal(null);
				return;
			}
			setNearbyTerminal(findTerminal(terminalId) ?? null);
		});
		const unsubscribeReady = onGameEvent("scene:ready", () => {
			setSceneReady(true);
		});
		const unsubscribeStopped = onGameEvent("player:stopped", ({ x, y, roomId }) => {
			useGameStore.getState().savePlayerPosition({ chapter: chapter.chapter, x, y, roomId });
		});
		const unsubscribeRoom = onGameEvent("room:enter", ({ roomId }) => {
			setCurrentRoom(roomId);
			// 玩家走得比台詞佇列快：換房時丟掉還沒播的舊房介紹，才不會在新房聽上一間的台詞
			nova.dropStaleRoomMessages(roomId);
			// 進房台詞每間只說一次，用劇情旗標跨重整去重
			const store = useGameStore.getState();
			const flag = roomEnteredFlag(chapter.chapter, roomId);
			if (store.storyFlags[flag] === true) {
				return;
			}
			store.setFlag(flag);
			// 第一次進艙區：先秀插圖卡，再讓 NOVA 說進房台詞
			const image = sceneImageForRoom(roomId);
			if (image !== undefined) {
				setSceneCard({
					id: `room-${roomId}`,
					src: image,
					title: ROOM_NAMES[roomId],
					subtitle: `Kepler-9 · ${chapter.deckName}`,
				});
			}
			const terminal = chapter.terminals.find((item) => item.roomId === roomId);
			const lines = terminal?.nova?.onEnterRoom ?? [];
			if (lines.length > 0) {
				nova.enqueue(`room-${roomId}`, lines);
				emitGameEvent("sfx:play", { sound: "nova-blip" });
			}
		});
		return () => {
			unsubscribeOpen();
			unsubscribeNearby();
			unsubscribeReady();
			unsubscribeStopped();
			unsubscribeRoom();
		};
	}, [chapter, nova]);

	const closeTerminal = useCallback(() => {
		if (openTerminal === null) {
			return;
		}
		emitGameEvent("terminal:close", { terminalId: openTerminal.definition.id });
		setOpenTerminal(null);
		const pending = pendingSolvedLineRef.current;
		if (pending !== null) {
			pendingSolvedLineRef.current = null;
			nova.enqueue(pending.prefix, [pending.text]);
		}
	}, [nova, openTerminal]);

	/** 指令執行後：錯誤扣氧氣；成功且達成目標就走過關流程。 */
	const handleExecuted = useCallback(
		(definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => {
			// 按鍵聲（4.10）：每送出一道指令響一次，每個按鍵都響太吵
			emitGameEvent("sfx:play", { sound: "key" });
			const store = useGameStore.getState();
			const alreadySolved = store.progress.solvedTerminals.includes(definition.id);
			if (!alreadySolved) {
				pressure.recordExecution(execution.isError, execution.hintUsed);
			}
			if (execution.isError) {
				loseOxygen();
				return;
			}
			if (alreadySolved) {
				return;
			}
			const context = createObjectiveContext(definition.id, execution, shell.fs, shell.home);
			if (!evaluateObjective(definition, context)) {
				return;
			}

			// 過關：記錄、回氧、學會這台教的指令、存檔、通知 Phaser 播演出
			pressure.reset();
			markTerminalSolved(definition.id);
			restoreOxygen();
			for (const teach of definition.teaches) {
				learnCommand(teach);
				shell.learn(toCommandName(teach));
			}
			touchSave();
			setJustSolvedId(definition.id);
			window.setTimeout(() => setJustSolvedId(null), SOLVED_FLASH_MS);
			emitGameEvent("puzzle:solved", { terminalId: definition.id });
			// 過關音效（M10-1）：powerRestored 的那台交給 Station 亮燈時播，避免響兩次
			const solvedSound = solvedSoundFor(definition);
			if (solvedSound !== null) {
				emitGameEvent("sfx:play", { sound: solvedSound });
			}

			// 先插一行青綠的「目標達成」，再接 NOVA 的過關台詞
			const solvedLines = definition.nova?.onSolved ?? [];
			appendTranscript(definition.id, [
				createObjectiveDoneEntry(definition),
				...createDialogueEntries(`nova-solved-${definition.id}`, solvedLines),
			]);
			if (solvedLines.length > 0) {
				pendingSolvedLineRef.current = {
					prefix: `solved-${definition.id}`,
					text: solvedLines[solvedLines.length - 1],
				};
			}
		},
		[appendTranscript, learnCommand, loseOxygen, markTerminalSolved, pressure, restoreOxygen, touchSave],
	);

	const character = progress.character ?? DEFAULT_CHARACTER;
	// 目標跟著終端機走（M10-2）：開著的 > 附近的 > 第一台未過關的，已過關的不搶目標
	const currentObjective = currentObjectiveTerminal(chapter.terminals, progress.solvedTerminals, {
		openTerminalId: openTerminal?.definition.id ?? null,
		nearbyTerminalId: nearbyTerminal?.id ?? null,
	});
	const justSolved = justSolvedId !== null ? findTerminal(justSolvedId) : undefined;
	let objectiveTitle: string | null = null;
	let objectiveDescription: string | undefined;
	if (justSolved !== undefined) {
		objectiveTitle = justSolved.objective.title;
		objectiveDescription = justSolved.objective.description;
	} else if (currentObjective !== undefined) {
		objectiveTitle = currentObjective.objective.title;
		objectiveDescription = currentObjective.objective.description;
	}

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
				solvedTerminals={progress.solvedTerminals}
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
				terminalOpen={openTerminal !== null}
				showControlsHint={shouldShowControlsHint({
					chapter: chapter.chapter,
					solvedTerminals: progress.solvedTerminals,
					terminalOpen: openTerminal !== null,
				})}
			/>
			<ObjectivePanel
				title={objectiveTitle}
				description={objectiveDescription}
				solved={justSolved !== undefined}
				progress={{ solved: chapterSolvedCount, total: chapter.terminals.length }}
			/>
			<SidePanels
				active={sidePanel}
				onActiveChange={setSidePanel}
				learnedCommands={progress.learnedCommands}
				novaLog={nova.history}
				appleKeyboard={appleKeyboard}
			/>
			<NovaDialogue
				queue={nova.queue}
				textSpeed={settings.textSpeed}
				onShown={nova.dismiss}
				portrait={novaPortraitFor(chapter.chapter, storyFlags)}
			/>

			<AnimatePresence>
				{openTerminal !== null && (
					<TerminalModal
						key={openTerminal.definition.id}
						definition={openTerminal.definition}
						shell={openTerminal.shell}
						textSpeed={settings.textSpeed}
						onClose={closeTerminal}
						onExecuted={handleExecuted}
					/>
				)}
			</AnimatePresence>

			{showChapterEnd && (
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
					onMounted={handleChapterEndMounted}
					onReturnToTitle={handleReturnToTitle}
					onNextChapter={handleNextChapter}
					skipOutro={outroAlreadyShown}
				/>
			)}

			<SceneCard card={sceneCard} onShown={handleSceneCardShown} />

			<PauseMenu
				open={paused && !settingsOpen}
				onResume={() => setPaused(false)}
				onReturnToTitle={() => router.push("/")}
				onRestartChapter={handleRestartChapter}
				onOpenSettings={() => setSettingsOpen(true)}
			/>
			{settingsOpen && (
				<SettingsMenu settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
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

interface TerminalModalProps {
	definition: TerminalDefinition;
	shell: Shell;
	textSpeed: SettingsState["textSpeed"];
	onClose: () => void;
	onExecuted: (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => void;
}

/** 蓋在地圖上的終端機彈窗：後面的地圖變暗但看得到（4.9）。 */
function TerminalModal({ definition, shell, textSpeed, onClose, onExecuted }: TerminalModalProps) {
	const record = useGameStore((state) => state.terminals[definition.id]);
	const solved = useGameStore((state) => state.progress.solvedTerminals.includes(definition.id));
	const saveTerminalSession = useGameStore((state) => state.saveTerminalSession);
	const appendTranscript = useGameStore((state) => state.appendTranscript);
	const entries = record?.transcript ?? [];

	// 第一次開這台時 NOVA 的開場白：掛載後才 push，Terminal 才會播打字動畫；用 id 前綴去重，跨重整也不重說
	useEffect(() => {
		const lines = definition.nova?.onOpen ?? [];
		if (lines.length === 0) {
			return;
		}
		const prefix = `nova-open-${definition.id}`;
		const transcript = useGameStore.getState().terminals[definition.id]?.transcript ?? [];
		if (transcript.some((entry) => entry.id.startsWith(prefix))) {
			return;
		}
		appendTranscript(definition.id, createDialogueEntries(prefix, lines));
	}, [appendTranscript, definition]);

	const handleEntriesChange = useCallback(
		(next: OutputEntry[]) => {
			saveTerminalSession(definition.id, { shell: shell.toState(), transcript: next });
		},
		[definition.id, saveTerminalSession, shell],
	);

	const handleExecuted = useCallback(
		(execution: ShellExecution) => {
			onExecuted(definition, shell, execution);
		},
		[definition, onExecuted, shell],
	);

	return (
		<motion.div
			className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-6"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15 }}
			data-testid="terminal-modal"
		>
			<div className="flex h-[80vh] w-full max-w-4xl">
				<Terminal
					title={definition.title}
					shell={shell}
					entries={entries}
					onEntriesChange={handleEntriesChange}
					onExecuted={handleExecuted}
					onClose={onClose}
					learnedCommands={shell.learnedCommands}
					textSpeed={textSpeed}
					solved={solved}
				/>
			</div>
		</motion.div>
	);
}

interface HudProps {
	oxygen: number;
	room: RoomId | null;
	nearbyTerminal: TerminalDefinition | null;
	terminalOpen: boolean;
	/** 第一章 T1 過關前在上方中央常駐操作提示（M10-3）。 */
	showControlsHint: boolean;
}

/** 左上角 O2、右上角艙區名稱、上方中央的操作提示、底部「按 E」提示。 */
function Hud({ oxygen, room, nearbyTerminal, terminalOpen, showControlsHint }: HudProps) {
	let oxygenClass = "text-game-success";
	if (oxygen < 30) {
		oxygenClass = "text-game-amber";
	}
	return (
		<div className="pointer-events-none absolute inset-0 z-30 text-2xl" aria-live="polite">
			<div className={`absolute top-4 left-4 ${oxygenClass}`} data-testid="hud-oxygen">
				O2 {oxygen}%
			</div>
			{room !== null && (
				<div className="absolute top-4 right-4 text-game-dim" data-testid="hud-room">
					{ROOM_NAMES[room]}
				</div>
			)}
			{showControlsHint && <ControlsHint />}
			{/* 底部一排是目標面板（左）與 NOVA 對話框（右），1280 以下塞不下中間的提示，往上移到它們上方 */}
			{nearbyTerminal !== null && !terminalOpen && (
				<div
					className="absolute bottom-60 left-1/2 -translate-x-1/2 whitespace-nowrap text-game-holo lg:bottom-32 xl:bottom-16"
					data-testid="interact-hint"
				>
					按 E 開啟 {nearbyTerminal.title}
				</div>
			)}
		</div>
	);
}
