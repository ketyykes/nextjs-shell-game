"use client";

/**
 * 救援船 ARGO 的整合層（設計文件 4.23）：等讀檔完成，沒通關就導回標題；通關過才拿設定與阿彬留言進度給 `ArgoScreen`。
 *
 * 只讀 store 不呼叫任何 action，所以進來不會動到存檔。
 * 等讀檔是為了第一幀就套用玩家的「關閉閃爍」設定（光敏安全項），也為了守門可信。
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { selectAbinNotes, selectSettings, useGameStore, useStoreHydration } from "@/game/store";
import { ArgoScreen } from "./ArgoScreen";

export function ArgoFlow() {
	const hydrated = useStoreHydration();
	const cleared = useGameStore((state) => state.progress.clearedAt !== null);
	const router = useRouter();
	// 沒通關（含沒有存檔）直接開 /argo：片尾還沒看過，導回標題
	const locked = hydrated && !cleared;
	useEffect(() => {
		if (locked) {
			router.replace("/");
		}
	}, [locked, router]);

	if (!hydrated || !cleared) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-black font-terminal text-xl text-game-dim">
				連線中……
			</main>
		);
	}
	return <ArgoFlowReady />;
}

function ArgoFlowReady() {
	const router = useRouter();
	const settings = useGameStore(selectSettings);
	// 只在掛載時讀一次：檔案系統只組一次，之後存檔變了也不重建
	const [progress] = useState(() => selectAbinNotes(useGameStore.getState()));

	const handleExit = useCallback(() => {
		router.push("/");
	}, [router]);

	return (
		<ArgoScreen
			onExit={handleExit}
			textSpeed={settings.textSpeed}
			progress={progress}
			crt={{
				scanlines: settings.scanlinesEnabled,
				vignette: settings.vignetteEnabled,
				flicker: settings.flickerEnabled,
			}}
		/>
	);
}
