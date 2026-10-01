"use client";

/**
 * /play 頁面的 client 入口。
 *
 * M2 階段只有一台終端機（第一章 T1），沒有 Phaser 地圖與劇情：
 * 讀檔完成後建立 Shell、把輸出紀錄與 shell 狀態同步進 store，重新整理後能接續。
 * M3 接 Phaser、M4 接事件橋接時，這個元件會變成「地圖 + 終端機彈窗」的容器。
 */

import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { OxygenVignette } from "@/components/game/OxygenVignette";
import { Terminal } from "@/components/terminal";
import { findTerminal } from "@/game/chapters/ch1-life-support";
import type { TerminalDefinition } from "@/game/chapters/types";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import {
	selectLearnedCommands,
	selectOxygen,
	selectSettings,
	selectTerminal,
	useGameStore,
	useStoreHydration,
} from "@/game/store";
import type { OutputEntry, SettingsState } from "@/game/store/types";

/** M2 先固定開第一章 T1，M4 之後由 Phaser 的 `terminal:open` 事件決定。 */
const DEV_TERMINAL_ID = "ch1-t1";

/**
 * 依存檔建立或還原 Shell。
 * 有存過就從 `record.shell` 還原（含修改過的檔案系統），沒有就用劇本的初始快照。
 */
function createShellForTerminal(
	definition: TerminalDefinition,
	learnedCommands: string[],
	savedState: ReturnType<Shell["toState"]> | undefined,
): Shell {
	if (savedState !== undefined) {
		const shell = Shell.fromState(savedState, VirtualFileSystem.fromSerialized(savedState.fs), definition.hints);
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
function createBannerEntry(definition: TerminalDefinition): OutputEntry[] {
	if (definition.banner === undefined || definition.banner.length === 0) {
		return [];
	}
	return [{ kind: "system", id: `banner-${definition.id}`, lines: definition.banner }];
}

export function PlayScreen() {
	const hydrated = useStoreHydration();
	const definition = findTerminal(DEV_TERMINAL_ID);

	if (!hydrated) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-game-bg font-terminal text-xl text-game-dim">
				讀取存檔中……
			</main>
		);
	}
	if (definition === undefined) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-game-bg font-terminal text-xl text-game-amber">
				找不到終端機 {DEV_TERMINAL_ID}
			</main>
		);
	}
	return <PlayScreenReady definition={definition} />;
}

interface PlayScreenReadyProps {
	definition: TerminalDefinition;
}

/** 讀檔完成後才掛載，所以這裡的 store 讀寫都安全。 */
function PlayScreenReady({ definition }: PlayScreenReadyProps) {
	const record = useGameStore(selectTerminal(definition.id));
	const learnedCommands = useGameStore(selectLearnedCommands);
	const settings = useGameStore(selectSettings);
	const oxygen = useGameStore(selectOxygen);
	const saveTerminalSession = useGameStore((state) => state.saveTerminalSession);
	const learnCommand = useGameStore((state) => state.learnCommand);
	const loseOxygen = useGameStore((state) => state.loseOxygen);
	const updateSettings = useGameStore((state) => state.updateSettings);

	// Shell 必須是同一個實例，否則 cwd 與歷史每次 render 都會被重置
	const [shell] = useState(() => createShellForTerminal(definition, learnedCommands, record?.shell));
	const [isOpen, setIsOpen] = useState(true);

	// 第一次開這台終端機：M2 先把它教的指令直接算學會，help 才有東西列；M5 改成過關後才學會
	useEffect(() => {
		if (record !== undefined) {
			return;
		}
		for (const name of definition.teaches) {
			learnCommand(name);
			shell.learn(name);
		}
		saveTerminalSession(definition.id, { shell: shell.toState(), transcript: createBannerEntry(definition) });
	}, [definition, learnCommand, record, saveTerminalSession, shell]);

	const entries = record?.transcript ?? [];

	const handleEntriesChange = useCallback(
		(next: OutputEntry[]) => {
			saveTerminalSession(definition.id, { shell: shell.toState(), transcript: next });
		},
		[definition.id, saveTerminalSession, shell],
	);

	const handleExecuted = useCallback(
		(execution: { isError: boolean }) => {
			if (execution.isError) {
				loseOxygen();
			}
		},
		[loseOxygen],
	);

	return (
		<main className="relative flex min-h-screen flex-col bg-game-bg font-terminal text-game-text">
			<OxygenHud oxygen={oxygen} />

			<div className="flex flex-1 items-center justify-center p-6">
				<AnimatePresence>
					{isOpen && (
						<div key={definition.id} className="flex h-[80vh] w-full max-w-4xl">
							<Terminal
								title={definition.title}
								shell={shell}
								entries={entries}
								onEntriesChange={handleEntriesChange}
								onExecuted={handleExecuted}
								onClose={() => setIsOpen(false)}
								learnedCommands={shell.learnedCommands}
								textSpeed={settings.textSpeed}
							/>
						</div>
					)}
				</AnimatePresence>
				{!isOpen && (
					<button
						type="button"
						className="border-2 border-game-holo px-6 py-3 text-xl text-game-holo hover:bg-game-holo/10"
						onClick={() => setIsOpen(true)}
					>
						[E] 重新開啟 {definition.title}
					</button>
				)}
			</div>

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

interface OxygenHudProps {
	oxygen: number;
}

/** 左上角 O2 百分比（4.8），低於 30% 變琥珀色。M4-5 會擴成完整 HUD。 */
function OxygenHud({ oxygen }: OxygenHudProps) {
	let colorClass = "text-game-success";
	if (oxygen < 30) {
		colorClass = "text-game-amber";
	}
	return (
		<div className={`absolute top-4 left-4 text-2xl ${colorClass}`} aria-live="polite">
			O2 {oxygen}%
		</div>
	);
}

interface DevSettingsBarProps {
	settings: SettingsState;
	onChange: (patch: Partial<SettingsState>) => void;
}

/** M2 用的簡易設定列，驗證 CRT 三個開關各自可關；M7-5 做正式設定選單後移除。 */
function DevSettingsBar({ settings, onChange }: DevSettingsBarProps) {
	const toggles: Array<{ key: keyof SettingsState; label: string }> = [
		{ key: "scanlinesEnabled", label: "掃描線" },
		{ key: "vignetteEnabled", label: "暗角" },
		{ key: "flickerEnabled", label: "閃爍" },
	];
	return (
		<div className="flex gap-6 px-6 pb-4 text-base text-game-dim">
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
