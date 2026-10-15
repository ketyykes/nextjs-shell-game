"use client";

/**
 * 救援船 ARGO 醫療終端機的畫面（設計文件 4.23）：片尾之後的尾聲，比照沙盒（4.11）的一台全螢幕終端機。
 *
 * - 沒有地圖、沒有 NOVA 對話框、不存檔、不扣氧；shell 與輸出區都只放在這個元件的 state。
 * - 檔案系統依掛載當下的阿彬留言進度組一次（`createArgoShell`），之後存檔怎麼變都不重建。
 * - Esc：Terminal 的 Esc 會呼叫 `onClose`，這裡改成先問要不要斷線回標題；確認面板開著時終端機設 `inert`。
 * - 沒有沙盒的「重置」：這裡不是練習場，斷線重連就是全新的一份。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CrtOverlay } from "@/components/game/CrtOverlay";
import { Terminal } from "@/components/terminal";
import { ConfirmPanel } from "@/components/title/ConfirmPanel";
import { ARGO_BANNER, type ArgoProgress } from "@/game/story/argo";
import { createArgoShell } from "@/game/story/argoSession";
import type { OutputEntry, TextSpeed } from "@/game/store/types";

export interface ArgoScreenCrtSettings {
	scanlines: boolean;
	vignette: boolean;
	flicker: boolean;
}

export interface ArgoScreenProps {
	/** 玩家確認斷線後呼叫，整合者負責導回標題。 */
	onExit: () => void;
	textSpeed: TextSpeed;
	/** 存檔裡的阿彬留言進度，決定上傳的 `abin/` 裡有什麼；只在掛載時讀一次。 */
	progress: ArgoProgress;
	/** CRT 效果，沒給就不疊。 */
	crt?: ArgoScreenCrtSettings;
}

const EXIT_MESSAGE = "斷線回標題？在這台終端機做的變更不會保留。";

const INITIAL_ENTRIES: OutputEntry[] = [{ kind: "system", id: "argo-banner", lines: ARGO_BANNER }];

export function ArgoScreen({ onExit, textSpeed, progress, crt }: ArgoScreenProps) {
	const [shell] = useState(() => createArgoShell(progress));
	const [entries, setEntries] = useState<OutputEntry[]>(INITIAL_ENTRIES);
	const [confirmingExit, setConfirmingExit] = useState(false);
	const terminalAreaRef = useRef<HTMLDivElement>(null);

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
	}, []);

	// 確認面板收起後把焦點還給輸入框。要等 `inert` 拿掉之後（commit 之後）才 focus 得到，所以放 effect
	useEffect(() => {
		if (confirmingExit) {
			return;
		}
		terminalAreaRef.current?.querySelector("input")?.focus();
	}, [confirmingExit]);

	return (
		<main className="fixed inset-0 flex flex-col items-center gap-2 bg-black px-4 py-4 text-game-text" data-testid="argo-screen">
			<header className="flex w-full max-w-4xl shrink-0 items-baseline gap-3 font-terminal text-lg">
				<h1 className="text-2xl text-game-holo">救援船 ARGO</h1>
				<span className="text-game-dim">醫療終端機 · 不存檔 · Esc 斷線回標題</span>
			</header>

			<div ref={terminalAreaRef} inert={confirmingExit} className="flex min-h-0 w-full max-w-4xl flex-1">
				<Terminal
					title="ARGO 醫療終端機"
					shell={shell}
					entries={entries}
					onEntriesChange={setEntries}
					onClose={openExitConfirm}
					learnedCommands={shell.learnedCommands}
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
