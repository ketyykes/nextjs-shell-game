"use client";

import { motion } from "motion/react";
import { useCallback, useEffect } from "react";
import { Terminal } from "@/components/terminal";
import type { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import type { TerminalDefinition } from "@/game/story";
import { useGameStore } from "@/game/store";
import type { OutputEntry, SettingsState } from "@/game/store/types";
import { createDialogueEntries } from "./terminalSession";

export interface TerminalModalProps {
	definition: TerminalDefinition;
	shell: Shell;
	textSpeed: SettingsState["textSpeed"];
	onClose: () => void;
	onExecuted: (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => void;
}

/**
 * 蓋在地圖上的終端機彈窗：後面的地圖變暗但看得到（4.9）。
 * 輸出紀錄由 store 持有，每次變動連同 shell 狀態一起存回去，重整後能接續。
 */
export function TerminalModal({ definition, shell, textSpeed, onClose, onExecuted }: TerminalModalProps) {
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
