"use client";

/**
 * 沙盒練習模式的整合層（M14-3）：等讀檔完成後拿設定（文字速度、CRT 三項）給 `SandboxScreen`，離開時導回標題。
 *
 * 只讀 store 不呼叫任何 action，所以進沙盒不會動到存檔；沒有存檔也能進。
 * 等讀檔是為了第一幀就套用玩家的「關閉閃爍」設定（光敏安全項），不會先閃一下預設值。
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { isAppleUserAgent } from "@/components/game/useSidePanelShortcuts";
import { selectSettings, useGameStore, useStoreHydration } from "@/game/store";
import { SandboxScreen } from "./SandboxScreen";

export function SandboxFlow() {
	const hydrated = useStoreHydration();
	if (!hydrated) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-black font-terminal text-xl text-game-dim">
				載入練習環境……
			</main>
		);
	}
	return <SandboxFlowReady />;
}

function SandboxFlowReady() {
	const router = useRouter();
	const settings = useGameStore(selectSettings);
	// 讀檔完成後才掛載，已經在瀏覽器裡，可以直接讀 navigator
	const [appleKeyboard] = useState(() => isAppleUserAgent(window.navigator.userAgent));

	const handleExit = useCallback(() => {
		router.push("/");
	}, [router]);

	return (
		<SandboxScreen
			onExit={handleExit}
			textSpeed={settings.textSpeed}
			appleKeyboard={appleKeyboard}
			crt={{
				scanlines: settings.scanlinesEnabled,
				vignette: settings.vignetteEnabled,
				flicker: settings.flickerEnabled,
			}}
		/>
	);
}
