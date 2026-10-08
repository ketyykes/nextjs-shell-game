"use client";

/**
 * 沙盒練習模式的畫面（M14-3，設計文件 4.11）：一台全螢幕終端機，沒有地圖、沒有 NOVA、不存檔、不扣氧。
 *
 * - shell 與輸出區都只放在這個元件的 state，離開或重新整理就沒了，不碰 store 與 localStorage。
 * - 重置：Alt+R（Mac 是 Option+R）或點「重置」，重建 shell 與輸出區，終端機用 key 重新掛載把輸入框也清掉。
 * - Esc：Terminal 的 Esc 會呼叫 `onClose`，這裡改成先問要不要回標題；確認面板開著時終端機設 `inert`，
 *   Enter、方向鍵只給確認面板。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { Terminal } from "@/components/terminal";
import { ConfirmPanel } from "@/components/title/ConfirmPanel";
import { SANDBOX_BANNER } from "@/game/sandbox/practice";
import { createSandboxShell } from "@/game/sandbox/session";
import type { Shell } from "@/game/shell/shell";
import type { OutputEntry, TextSpeed } from "@/game/store/types";

export interface SandboxScreenCrtSettings {
	scanlines: boolean;
	vignette: boolean;
	flicker: boolean;
}

export interface SandboxScreenProps {
	/** 玩家確認離開後呼叫，整合者負責導回標題。 */
	onExit: () => void;
	textSpeed: TextSpeed;
	/** Apple 鍵盤把 Alt 標成 Option，快捷鍵顯示成「⌥R」。 */
	appleKeyboard?: boolean;
	/** CRT 效果，沒給就不疊。 */
	crt?: SandboxScreenCrtSettings;
}

/** 重置的快捷鍵字母，搭配 Alt；比對 `event.code`，因為 Mac 的 Option+R 打出來的 key 是「®」。 */
const RESET_LETTER = "R";

const RESET_NOTICE = "練習環境已重置：檔案、目錄、環境變數與程序都回到剛進來的樣子。";

const EXIT_MESSAGE = "離開練習模式，回到標題畫面？練習的內容不會保留。";

/** 是不是重置快捷鍵：只認單純的 Alt（Ctrl+Alt 在 Windows 是 AltGr），組字中不算。 */
function isResetShortcut(event: KeyboardEvent): boolean {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
		return false;
	}
	if (event.isComposing) {
		return false;
	}
	return event.code === `Key${RESET_LETTER}`;
}

/** 第 `generation` 次進入（0 是剛進來，之後每重置一次加一）時輸出區的初始內容。 */
function createInitialEntries(generation: number): OutputEntry[] {
	const entries: OutputEntry[] = [{ kind: "system", id: `sandbox-banner-${generation}`, lines: SANDBOX_BANNER }];
	if (generation > 0) {
		entries.push({ kind: "system", id: `sandbox-reset-${generation}`, lines: [RESET_NOTICE] });
	}
	return entries;
}

interface SandboxSession {
	generation: number;
	shell: Shell;
	entries: OutputEntry[];
}

function createSession(generation: number): SandboxSession {
	return { generation, shell: createSandboxShell(), entries: createInitialEntries(generation) };
}

export function SandboxScreen({ onExit, textSpeed, appleKeyboard = false, crt }: SandboxScreenProps) {
	const [session, setSession] = useState(() => createSession(0));
	const [confirmingExit, setConfirmingExit] = useState(false);
	const terminalAreaRef = useRef<HTMLDivElement>(null);

	const reset = useCallback(() => {
		setSession((previous) => createSession(previous.generation + 1));
	}, []);

	const handleEntriesChange = useCallback((next: OutputEntry[]) => {
		setSession((previous) => ({ ...previous, entries: next }));
	}, []);

	const openExitConfirm = useCallback(() => {
		// 輸入框還留著焦點的話，Enter 會同時送出指令與確認面板
		const active = document.activeElement;
		if (active instanceof HTMLElement) {
			active.blur();
		}
		setConfirmingExit(true);
	}, []);

	const cancelExit = useCallback(() => {
		setConfirmingExit(false);
		terminalAreaRef.current?.querySelector("input")?.focus();
	}, []);

	useEffect(() => {
		if (confirmingExit) {
			return;
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (!isResetShortcut(event)) {
				return;
			}
			// 不擋的話 Mac 的 Option+R 會在輸入框打出「®」
			event.preventDefault();
			if (event.repeat) {
				return;
			}
			reset();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [confirmingExit, reset]);

	let shortcutLabel = `Alt+${RESET_LETTER}`;
	if (appleKeyboard) {
		shortcutLabel = `⌥${RESET_LETTER}`;
	}

	return (
		<main className="fixed inset-0 flex flex-col items-center gap-2 bg-black px-4 py-4 text-game-text" data-testid="sandbox-screen">
			<header className="flex w-full max-w-4xl shrink-0 items-baseline justify-between gap-4 font-terminal text-lg">
				<div className="flex items-baseline gap-3">
					<h1 className="text-2xl text-game-holo">練習模式</h1>
					<span className="text-game-dim">不存檔 · 不扣氧氣 · Esc 回標題</span>
				</div>
				<button
					type="button"
					onClick={reset}
					aria-keyshortcuts={`Alt+${RESET_LETTER}`}
					disabled={confirmingExit}
					className="shrink-0 cursor-pointer text-game-dim transition-colors hover:text-game-amber focus-visible:text-game-amber focus-visible:outline-none disabled:cursor-default"
				>
					[{shortcutLabel}] 重置
				</button>
			</header>

			<div ref={terminalAreaRef} inert={confirmingExit} className="flex min-h-0 w-full max-w-4xl flex-1">
				<Terminal
					key={session.generation}
					title="技師訓練模擬環境"
					shell={session.shell}
					entries={session.entries}
					onEntriesChange={handleEntriesChange}
					onClose={openExitConfirm}
					learnedCommands={session.shell.learnedCommands}
					textSpeed={textSpeed}
				/>
			</div>

			{confirmingExit && (
				<div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
					<ConfirmPanel message={EXIT_MESSAGE} confirmLabel="回標題" onConfirm={onExit} onCancel={cancelExit} />
				</div>
			)}

			{crt !== undefined && <CrtOverlay scanlines={crt.scanlines} vignette={crt.vignette} flicker={crt.flicker} />}
		</main>
	);
}
