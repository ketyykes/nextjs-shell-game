"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { findTerminal } from "@/game/chapters";
import { emitGameEvent } from "@/game/phaser/EventBus";
import type { Shell } from "@/game/shell/shell";
import type { TerminalDefinition } from "@/game/story";
import { useGameStore } from "@/game/store";
import { createTerminalSession, toCommandName } from "./terminalSession";

/**
 * 取得某台終端機的 Shell，沒有就建一個並記進快取；第一次開、存檔壞掉或劇本改版（未過關）重建時寫一筆新的 session 進 store。
 * 只在事件 handler 裡呼叫（透過 `useGameStore.getState()` 讀寫 store）。
 */
export function resolveShell(cache: Map<string, Shell>, definition: TerminalDefinition): Shell {
	const existing = cache.get(definition.id);
	if (existing !== undefined) {
		return existing;
	}
	const store = useGameStore.getState();
	const commandNames = store.progress.learnedCommands.map(toCommandName);
	const { shell, freshRecord } = createTerminalSession(definition, commandNames, store.terminals[definition.id], {
		solved: store.progress.solvedTerminals.includes(definition.id),
	});
	if (freshRecord !== null) {
		store.saveTerminalSession(definition.id, freshRecord);
	}
	cache.set(definition.id, shell);
	return shell;
}

export interface OpenTerminal {
	definition: TerminalDefinition;
	shell: Shell;
}

export interface UseTerminalSessionsResult {
	/** 目前開著的終端機，關著是 null。 */
	openTerminal: OpenTerminal | null;
	/**
	 * `terminal:open` 的 handler：開啟劇本裡的那台終端機。
	 * 劇本裡沒有的 id 不開，直接發 `terminal:close` 讓 Phaser 恢復，否則場景會一直停在暫停。
	 */
	openTerminalById: (terminalId: string) => void;
	/** 關閉開著的終端機並發 `terminal:close`；回傳是否真的關了一台（本來就關著回傳 false）。 */
	closeTerminal: () => boolean;
}

/**
 * 終端機彈窗的開關與 Shell 快取。
 *
 * 每台終端機的 Shell 在這個 hook 存活期間只建一次（Terminal 元件的整合規則：同一個實例才保得住 cwd 與歷史），
 * 第一次開時從存檔還原或用劇本快照建立（存檔壞掉就丟掉那台重建，M12-5），見 `resolveShell`。快取只在事件 handler 裡存取，不在 render 期間碰 ref。
 */
export function useTerminalSessions(): UseTerminalSessionsResult {
	const [openTerminal, setOpenTerminal] = useState<OpenTerminal | null>(null);
	const shellsRef = useRef(new Map<string, Shell>());

	const openTerminalById = useCallback((terminalId: string) => {
		const definition = findTerminal(terminalId);
		if (definition === undefined) {
			console.warn(`[PlayScreen] 劇本裡沒有終端機 ${terminalId}，先把 Phaser 恢復`);
			emitGameEvent("terminal:close", { terminalId });
			return;
		}
		setOpenTerminal({ definition, shell: resolveShell(shellsRef.current, definition) });
	}, []);

	const closeTerminal = useCallback(() => {
		if (openTerminal === null) {
			return false;
		}
		emitGameEvent("terminal:close", { terminalId: openTerminal.definition.id });
		setOpenTerminal(null);
		return true;
	}, [openTerminal]);

	return useMemo(
		() => ({ openTerminal, openTerminalById, closeTerminal }),
		[openTerminal, openTerminalById, closeTerminal],
	);
}
