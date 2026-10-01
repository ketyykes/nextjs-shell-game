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
import { CommandCheatSheet } from "@/components/game/CommandCheatSheet";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { NovaDialogue } from "@/components/game/NovaDialogue";
import { ObjectivePanel } from "@/components/game/ObjectivePanel";
import { OxygenVignette } from "@/components/game/OxygenVignette";
import { PauseMenu } from "@/components/game/PauseMenu";
import { PhaserGameDynamic } from "@/components/game/PhaserGameDynamic";
import { SceneCard, type SceneCardMessage } from "@/components/game/SceneCard";
import { SettingsMenu } from "@/components/title/SettingsMenu";
import { useNovaQueue } from "@/components/game/useNovaQueue";
import { useTerminalPressure } from "@/components/game/useTerminalPressure";
import { Terminal } from "@/components/terminal";
import { chapterOneLifeSupport, findTerminal } from "@/game/chapters/ch1-life-support";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import { ROOM_NAMES, type RoomId } from "@/game/phaser/events";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import {
	createObjectiveContext,
	evaluateObjective,
	roomEnteredFlag,
	STORY_FLAGS,
	type TerminalDefinition,
} from "@/game/story";
import { FLICKER_DURATION_MS, novaErrorLine, stuckLines, type PressureReaction } from "@/game/story/pressure";
import { OUTRO_SCENE_IMAGE, sceneImageForRoom } from "@/game/story/scenes";
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
	});
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
	const router = useRouter();

	const [openTerminal, setOpenTerminal] = useState<OpenTerminal | null>(null);
	const [nearbyTerminal, setNearbyTerminal] = useState<TerminalDefinition | null>(null);
	const [currentRoom, setCurrentRoom] = useState<RoomId | null>(null);
	const [justSolvedId, setJustSolvedId] = useState<string | null>(null);
	const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
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
	// 初次掛載時用的 ref，避免 effect 對 store 的函式產生依賴
	const [initialSolvedTerminals] = useState(() => [...progress.solvedTerminals]);

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

	// 開場台詞：第一句已在標題流程的 boot log 說過，進地圖後接著說其餘句子，只在第一次進遊戲時說
	useEffect(() => {
		if (storyFlags[STORY_FLAGS.introShown] === true) {
			return;
		}
		setFlag(STORY_FLAGS.introShown);
		nova.enqueue("intro", (chapterOneLifeSupport.intro ?? []).slice(1));
	}, [nova, setFlag, storyFlags]);

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
		// 重玩本章：清進度與終端機但保留設定與外觀，重新載入讓 Phaser 與 Shell 快取都重建
		const store = useGameStore.getState();
		const character = store.progress.character;
		store.resetSave();
		if (character !== null) {
			store.setCharacter(character);
		}
		store.touchSave();
		window.location.reload();
	}, []);

	// 章節結束（4.7）：六台都過關且終端機已關閉時顯示過場、NOVA 結尾台詞與指令回顧卡；旗標確保只播一次
	const allSolved = chapterOneLifeSupport.terminals.every((terminal) =>
		progress.solvedTerminals.includes(terminal.id),
	);
	const showChapterEnd = allSolved && openTerminal === null && storyFlags[STORY_FLAGS.outroShown] !== true;
	const handleChapterEndMounted = useCallback(() => {
		touchSave();
	}, [touchSave]);
	const handleReturnToTitle = useCallback(() => {
		setFlag(STORY_FLAGS.outroShown);
		router.push("/");
	}, [router, setFlag]);

	// 設定選單改音量或靜音時即時通知 Phaser 的 AudioManager
	useEffect(() => {
		emitGameEvent("audio:settings", { volume: settings.volume, muted: settings.muted });
	}, [settings.muted, settings.volume]);

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
					const text = novaErrorLine(chapterOneLifeSupport.novaErrorLines, reaction.lineIndex);
					appendTranscript(
						definition.id,
						createDialogueEntries(`nova-error-${definition.id}-${reaction.lineIndex}-${Date.now()}`, [text]),
					);
					return;
				}
				case "stuck":
					appendTranscript(
						definition.id,
						createDialogueEntries(`nova-stuck-${definition.id}-${Date.now()}`, stuckLines(definition)),
					);
					return;
			}
		},
		[appendTranscript, openTerminal],
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
		const unsubscribeRoom = onGameEvent("room:enter", ({ roomId }) => {
			setCurrentRoom(roomId);
			// 進房台詞每間只說一次，用劇情旗標跨重整去重
			const store = useGameStore.getState();
			const flag = roomEnteredFlag(roomId);
			if (store.storyFlags[flag] === true) {
				return;
			}
			store.setFlag(flag);
			// 第一次進艙區：先秀插圖卡，再讓 NOVA 說進房台詞
			const image = sceneImageForRoom(roomId);
			if (image !== undefined) {
				setSceneCard({ id: `room-${roomId}`, src: image, title: ROOM_NAMES[roomId], subtitle: "Kepler-9" });
			}
			const terminal = chapterOneLifeSupport.terminals.find((item) => item.roomId === roomId);
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
			unsubscribeRoom();
		};
	}, [nova]);

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
				pressure.recordExecution(execution.isError);
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

			const solvedLines = definition.nova?.onSolved ?? [];
			if (solvedLines.length > 0) {
				appendTranscript(definition.id, createDialogueEntries(`nova-solved-${definition.id}`, solvedLines));
				pendingSolvedLineRef.current = {
					prefix: `solved-${definition.id}`,
					text: solvedLines[solvedLines.length - 1],
				};
			}
		},
		[appendTranscript, learnCommand, loseOxygen, markTerminalSolved, pressure, restoreOxygen, touchSave],
	);

	const character = progress.character ?? DEFAULT_CHARACTER;
	const currentObjective = chapterOneLifeSupport.terminals.find(
		(terminal) => !progress.solvedTerminals.includes(terminal.id),
	);
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
		>
			<PhaserGameDynamic
				character={character}
				solvedTerminals={initialSolvedTerminals}
				volume={settings.volume}
				muted={settings.muted}
				className="flex h-full w-full items-center justify-center"
			/>

			<Hud oxygen={oxygen} room={currentRoom} nearbyTerminal={nearbyTerminal} terminalOpen={openTerminal !== null} />
			<ObjectivePanel
				title={objectiveTitle}
				description={objectiveDescription}
				solved={justSolved !== undefined}
				progress={{ solved: progress.solvedTerminals.length, total: chapterOneLifeSupport.terminals.length }}
			/>
			<CommandCheatSheet
				learnedCommands={progress.learnedCommands}
				open={cheatSheetOpen}
				onOpenChange={setCheatSheetOpen}
			/>
			<NovaDialogue queue={nova.queue} textSpeed={settings.textSpeed} onShown={nova.dismiss} />

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
					chapterNumber={chapterOneLifeSupport.chapter}
					chapterTitle={chapterOneLifeSupport.title}
					outroLines={chapterOneLifeSupport.outro ?? []}
					learnedCommands={progress.learnedCommands}
					textSpeed={settings.textSpeed}
					illustrationSrc={OUTRO_SCENE_IMAGE}
					onMounted={handleChapterEndMounted}
					onReturnToTitle={handleReturnToTitle}
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
}

/** 左上角 O2、右上角艙區名稱、底部「按 E」提示。 */
function Hud({ oxygen, room, nearbyTerminal, terminalOpen }: HudProps) {
	let oxygenClass = "text-game-success";
	if (oxygen < 30) {
		oxygenClass = "text-game-amber";
	}
	return (
		<div className="pointer-events-none absolute inset-0 z-30 text-2xl" aria-live="polite">
			<div className={`absolute top-4 left-4 ${oxygenClass}`}>O2 {oxygen}%</div>
			{room !== null && <div className="absolute top-4 right-4 text-game-dim">{ROOM_NAMES[room]}</div>}
			{nearbyTerminal !== null && !terminalOpen && (
				<div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-game-holo" data-testid="interact-hint">
					按 E 開啟 {nearbyTerminal.title}
				</div>
			)}
		</div>
	);
}
