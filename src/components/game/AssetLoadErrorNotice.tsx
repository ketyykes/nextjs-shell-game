"use client";

/**
 * 素材載入失敗的提示（M12-6）。Phaser 的 Preloader 載不到地圖、tileset、角色或音效時發 `assets:error`，這裡顯示繁中說明與「重新載入」。
 *
 * React 的 error boundary 接不到 Phaser 遊戲迴圈裡的例外，所以要走 EventBus；這個元件只 import 零相依的 EventBus，可以放在 SSR 會碰到的地方。
 * - 致命（地圖、tileset、角色缺了）：整個畫面蓋住，遊戲本來就沒辦法開始，只留「重新載入」。
 * - 非致命（只有音效）：頂端一條提示，可以「先不用」收起來繼續玩。
 */

import { useEffect, useState } from "react";
import { onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventMap } from "@/game/phaser/events";

type AssetFailure = GameEventMap["assets:error"];

export interface AssetLoadErrorNoticeProps {
	/** 按「重新載入」時呼叫，預設整頁重新載入；測試用。 */
	onReload?: () => void;
}

function reloadPage(): void {
	window.location.reload();
}

const BUTTON_CLASS =
	"cursor-pointer border border-game-holo/60 px-4 py-1 font-terminal text-xl text-game-holo hover:bg-game-holo/10 focus-visible:outline-2 focus-visible:outline-game-holo";

export function AssetLoadErrorNotice({ onReload = reloadPage }: AssetLoadErrorNoticeProps) {
	const [failure, setFailure] = useState<AssetFailure | null>(null);

	useEffect(() => onGameEvent("assets:error", setFailure), []);

	if (failure === null) {
		return null;
	}

	if (!failure.fatal) {
		return (
			<div
				role="alert"
				data-testid="asset-error-notice"
				className="fixed inset-x-0 top-20 z-[55] mx-auto flex w-fit max-w-[90vw] flex-wrap items-center justify-center gap-3 border border-game-amber bg-game-bg/90 px-4 py-2 font-terminal text-xl text-game-amber"
			>
				<span>部分音效沒有載到，遊戲可以照常進行，只是會少了聲音。</span>
				<button type="button" className={BUTTON_CLASS} onClick={onReload}>
					重新載入
				</button>
				<button type="button" className={BUTTON_CLASS} onClick={() => setFailure(null)}>
					先不用
				</button>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 px-4" data-testid="asset-error-overlay">
			<div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="asset-error-title"
				className="flex max-w-xl flex-col items-center gap-4 border-2 border-game-amber/70 bg-game-bg px-8 py-6 text-center font-terminal text-xl text-game-text"
			>
				<h2 id="asset-error-title" className="text-2xl text-game-amber">
					素材載入失敗
				</h2>
				<p>地圖或角色圖沒有載到，遊戲沒辦法開始。可能是網路不穩，重新載入通常就會好。</p>
				<ul className="text-base text-game-dim">
					{failure.files.map((file) => (
						<li key={file}>{file}</li>
					))}
				</ul>
				<button type="button" className={BUTTON_CLASS} onClick={onReload} autoFocus>
					重新載入
				</button>
			</div>
		</div>
	);
}
