"use client";

import dynamic from "next/dynamic";

/**
 * 以 next/dynamic 關閉 SSR 載入 PhaserGame（Phaser 會碰 window）。
 * `ssr: false` 只能在 client component 內使用，所以這個檔案必須維持 "use client"，
 * 使用端也要是 client component。
 */
export const PhaserGameDynamic = dynamic(() => import("./PhaserGame").then((module) => module.PhaserGame), {
	ssr: false,
	loading: () => (
		<div className="flex aspect-[5/3] w-full items-center justify-center bg-game-bg font-terminal text-xl text-game-dim">
			載入引擎中……
		</div>
	),
});
