import type { Metadata } from "next";
import { PlayScreen } from "@/components/game/PlayScreen";

export const metadata: Metadata = {
	title: "Kepler-9 — 遊玩",
};

/** 遊戲頁面。所有互動都在 client component `PlayScreen` 裡，這裡只是路由入口。 */
export default function PlayPage() {
	return <PlayScreen />;
}
