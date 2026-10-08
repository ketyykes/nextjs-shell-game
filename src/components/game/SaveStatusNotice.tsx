"use client";

/**
 * 存檔出問題時畫面頂端的一行提示（M12-5）。掛在根佈局，標題畫面與 /play 都看得到。
 *
 * 只 import `@/game/store/saveStatus`（不經過 `@/game/store` 的 index），不會把 zustand store 帶進每一頁。
 * 擺在 top-16，讓開 /play 上方那一排 HUD（O2、第一章操作提示、艙區名）；練習模式本來就不存檔，不顯示。
 */

import { usePathname } from "next/navigation";
import { useSaveIssue, type SaveIssue } from "@/game/store/saveStatus";

const MESSAGES: Record<SaveIssue, string> = {
	"write-failed": "存檔失敗：瀏覽器的儲存空間已滿或不允許寫入，這段進度只留在目前分頁，關掉就會遺失。",
	"newer-version": "這份存檔來自較新版本的遊戲，為了不弄壞它，這次不讀取也不寫入存檔。",
	unavailable: "瀏覽器不允許這個網站使用儲存空間，這次的進度不會存檔，關掉分頁就會遺失。",
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
			className="pointer-events-none fixed inset-x-0 top-16 z-[60] mx-auto w-fit max-w-[90vw] border border-game-amber bg-game-bg/90 px-4 py-1 text-center font-terminal text-xl text-game-amber"
		>
			{MESSAGES[issue]}
		</div>
	);
}
