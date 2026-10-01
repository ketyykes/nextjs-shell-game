"use client";

/**
 * /play 頁面的 client 入口：Phaser 地圖在底層，終端機彈窗與 HUD 疊在上面。
 *
 * 流程（設計文件 3.1、4.6）：
 * - Phaser 的 Station 場景在玩家按 E 時發 `terminal:open`，這裡開啟對應終端機的 shell 彈窗，Phaser 自己暫停。
 * - 玩家按 Esc 或點「[Esc] 關閉」，這裡發 `terminal:close`，Phaser 恢復。
 * - 每台終端機的 Shell 實例在這個元件存活期間只建一次，關掉再開 cwd 與歷史都還在；
 *   輸出紀錄與 shell 狀態同步進 store，重新整理後能接續。
 *
 * M3 階段的簡化：過關判定、NOVA 台詞、氧氣以外的 HUD 都還沒有，見 progress.md。
 */

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { OxygenVignette } from "@/components/game/OxygenVignette";
import { PhaserGameDynamic } from "@/components/game/PhaserGameDynamic";
import { Terminal } from "@/components/terminal";
import { findTerminal } from "@/game/chapters/ch1-life-support";
import type { TerminalDefinition } from "@/game/chapters/types";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import { ROOM_NAMES, type RoomId } from "@/game/phaser/events";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import { selectOxygen, selectProgress, selectSettings, useGameStore, useStoreHydration } from "@/game/store";
import type { CharacterId, OutputEntry, SettingsState, TerminalSessionRecord } from "@/game/store/types";

/** 還沒做選角（M7-2）之前的預設外觀。 */
const DEFAULT_CHARACTER: CharacterId = "a";

/**
 * 依存檔建立或還原 Shell。
 * 有存過就從 `record.shell` 還原（含修改過的檔案系統），沒有就用劇本的初始快照。
 */
function createShellForTerminal(
	definition: TerminalDefinition,
	learnedCommands: string[],
	record: TerminalSessionRecord | undefined,
): Shell {
	if (record !== undefined) {
		const shell = Shell.fromState(record.shell, VirtualFileSystem.fromSerialized(record.shell.fs), definition.hints);
		for (const name of learnedCommands) {
			shell.learn(name);
		}
		return shell;
	}
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(definition.fs),
		terminalId: definition.id,
		hints: definition.hints,
		learnedCommands,
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

interface OpenTerminal {
	definition: TerminalDefinition;
	shell: Shell;
}

/**
 * 取得某台終端機的 Shell，沒有就建一個並記進快取。
 * 第一次開這台時順便把它教的指令算學會（M3 的簡化，M5 改成過關後才學會），並寫第一筆 session 進 store。
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
		for (const name of definition.teaches) {
			store.learnCommand(name);
			shell.learn(name);
		}
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
	const loseOxygen = useGameStore((state) => state.loseOxygen);
	const updateSettings = useGameStore((state) => state.updateSettings);

	const [openTerminal, setOpenTerminal] = useState<OpenTerminal | null>(null);
	const [nearbyTerminal, setNearbyTerminal] = useState<TerminalDefinition | null>(null);
	const [currentRoom, setCurrentRoom] = useState<RoomId | null>(null);

	// 每台終端機一個 Shell 實例，整個遊玩期間保留，關掉再開 cwd 與歷史都還在。
	// 只在事件 handler 裡存取，不在 render 期間碰 ref。
	const shellsRef = useRef(new Map<string, Shell>());

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
		const unsubscribeRoom = onGameEvent("room:enter", ({ roomId }) => {
			setCurrentRoom(roomId);
		});
		return () => {
			unsubscribeOpen();
			unsubscribeNearby();
			unsubscribeRoom();
		};
	}, []);

	const closeTerminal = useCallback(() => {
		if (openTerminal === null) {
			return;
		}
		emitGameEvent("terminal:close", { terminalId: openTerminal.definition.id });
		setOpenTerminal(null);
	}, [openTerminal]);

	const handleExecuted = useCallback(
		(execution: ShellExecution) => {
			if (execution.isError) {
				loseOxygen();
			}
		},
		[loseOxygen],
	);

	const character = progress.character ?? DEFAULT_CHARACTER;

	return (
		<main className="relative h-screen w-screen overflow-hidden bg-game-bg font-terminal text-game-text">
			<PhaserGameDynamic character={character} className="flex h-full w-full items-center justify-center" />

			<Hud oxygen={oxygen} room={currentRoom} nearbyTerminal={nearbyTerminal} terminalOpen={openTerminal !== null} />

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

			<DevSettingsBar settings={settings} onChange={updateSettings} />

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
	onExecuted: (execution: ShellExecution) => void;
}

/** 蓋在地圖上的終端機彈窗：後面的地圖變暗但看得到（4.9）。 */
function TerminalModal({ definition, shell, textSpeed, onClose, onExecuted }: TerminalModalProps) {
	const record = useGameStore((state) => state.terminals[definition.id]);
	const saveTerminalSession = useGameStore((state) => state.saveTerminalSession);
	const entries = record?.transcript ?? [];

	const handleEntriesChange = useCallback(
		(next: OutputEntry[]) => {
			saveTerminalSession(definition.id, { shell: shell.toState(), transcript: next });
		},
		[definition.id, saveTerminalSession, shell],
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
					onExecuted={onExecuted}
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

/** 左上角 O2、右上角艙區名稱、底部「按 E」提示。M4-5 會擴成完整 HUD。 */
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

interface DevSettingsBarProps {
	settings: SettingsState;
	onChange: (patch: Partial<SettingsState>) => void;
}

/** 暫時的設定列，驗證 CRT 三個開關各自可關；M7-5 做正式設定選單後移除。 */
function DevSettingsBar({ settings, onChange }: DevSettingsBarProps) {
	const toggles: Array<{ key: keyof SettingsState; label: string }> = [
		{ key: "scanlinesEnabled", label: "掃描線" },
		{ key: "vignetteEnabled", label: "暗角" },
		{ key: "flickerEnabled", label: "閃爍" },
	];
	return (
		<div className="absolute bottom-3 left-20 z-30 flex gap-6 text-base text-game-dim">
			{toggles.map((toggle) => (
				<label key={toggle.key} className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={settings[toggle.key] === true}
						onChange={(event) => onChange({ [toggle.key]: event.target.checked })}
					/>
					{toggle.label}
				</label>
			))}
		</div>
	);
}
