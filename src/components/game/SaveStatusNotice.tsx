"use client";

/**
 * 存檔出問題時畫面頂端的一行提示（M12-5）。掛在根佈局，標題畫面與 /play 都看得到。
 *
 * 只 import `@/game/store/saveStatus`（不經過 `@/game/store` 的 index），不會把 zustand store 帶進每一頁。
 * 擺在 top-24（96 px），讓開 /play 上方那一排 HUD（O2、第一章操作提示、艙區名）與 O2 下方的除役倒數（top-12，到 80 px）；
 * 音效載不到的提示（`AssetLoadErrorNotice`）擺得更低，兩個同時出現也不重疊。練習模式本來就不存檔，不顯示。
 *
 * 另一個分頁改了存檔（`other-tab`，4.21）時多一個「重新載入」按鈕：重新載入就會讀到最新的存檔。
 * 整條提示維持 `pointer-events-none` 不擋地圖，只有按鈕接得到滑鼠。
 */

import { usePathname } from "next/navigation";
import { useSaveIssue, type SaveIssue } from "@/game/store/saveStatus";
import { reloadPage } from "./reloadPage";

const MESSAGES: Record<SaveIssue, string> = {
	"write-failed": "存檔失敗：瀏覽器的儲存空間已滿或不允許寫入，這段進度只留在目前分頁，關掉就會遺失。",
	"newer-version": "這份存檔來自較新版本的遊戲，為了不弄壞它，這次不讀取也不寫入存檔。",
	unavailable: "瀏覽器不允許這個網站使用儲存空間，這次的進度不會存檔，關掉分頁就會遺失。",
	"other-tab": "另一個分頁改了存檔，這個分頁已停止存檔。重新載入可以接續最新進度。",
};

export function SaveStatusNotice() {
	const issue = useSaveIssue();
	const pathname = usePathname();
	if (issue === null || pathname.startsWith("/sandbox")) {
		return null;
	}

	return (
		<div
			role="alert"
			data-testid="save-status-notice"
			className="pointer-events-none fixed inset-x-0 top-24 z-[60] mx-auto w-fit max-w-[90vw] border border-game-amber bg-game-bg/90 px-4 py-1 text-center font-terminal text-xl text-game-amber"
		>
			{MESSAGES[issue]}
			{/* 接在文字後面同一行，768 寬折成兩行時也不多佔一行，不會壓到下面的音效提示（top-44） */}
			{issue === "other-tab" && (
				<button
					type="button"
					onClick={reloadPage}
					className="pointer-events-auto ml-3 inline-block cursor-pointer border border-game-holo/60 px-2 text-game-holo hover:bg-game-holo/10 focus-visible:outline-2 focus-visible:outline-game-holo"
				>
					重新載入
				</button>
			)}
		</div>
	);
}
