"use client";

import dynamic from "next/dynamic";

/**
 * 檔案櫃面板（設計文件 4.24）的動態載入版，標題頁一律用這個。
 * `ArchivePanel` 會帶進六章劇本、zod 與虛擬檔案系統，直接 import 會把它們拉進 `/` 的首載
 * （`chapters/meta.ts` 檔頭記過實測 351KB）；只有通關過、按下「檔案櫃」才需要。
 */
export const ArchivePanelDynamic = dynamic(() => import("./ArchivePanel").then((module) => module.ArchivePanel), {
	ssr: false,
	loading: () => (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 font-terminal text-xl text-game-dim">
			開啟檔案櫃……
		</div>
	),
});
