import type { Metadata } from "next";
import { PlayScreen } from "@/components/game/PlayScreen";

export const metadata: Metadata = {
	title: "Kepler-9 — 遊玩",
	// 沒有存檔直接開會被導回標題，收錄這頁沒有意義；robots.txt 不擋它，搜尋引擎才讀得到這個 noindex
	robots: { index: false },
};

/** 遊戲頁面。所有互動都在 client component `PlayScreen` 裡，這裡只是路由入口。 */
export default function PlayPage() {
	return <PlayScreen />;
}
