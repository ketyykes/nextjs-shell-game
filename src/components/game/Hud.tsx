"use client";

import { ControlsHint } from "@/components/game/ControlsHint";
import { DecommissionCountdown } from "@/components/game/DecommissionCountdown";
import { OxygenReadout } from "@/components/game/OxygenReadout";
import { ROOM_NAMES, type RoomId } from "@/game/phaser/events";
import type { TerminalDefinition } from "@/game/story";

export interface HudProps {
	oxygen: number;
	room: RoomId | null;
	nearbyTerminal: TerminalDefinition | null;
	terminalOpen: boolean;
	/** 第一章 T1 過關前在上方中央常駐操作提示（M10-3）。 */
	showControlsHint: boolean;
	/** PlayScreen 掛載時的章節，除役倒數用它決定標籤與加總哪幾章的遊玩時間（4.13）。 */
	chapter: number;
	/** 遊戲內時間在不在走，跟 `usePlayTime` 的計時條件相同。 */
	playTimeRunning: boolean;
}

/** 左上角 O2 與除役倒數、右上角艙區名稱、上方中央的操作提示、底部「按 E」提示。 */
export function Hud({
	oxygen,
	room,
	nearbyTerminal,
	terminalOpen,
	showControlsHint,
	chapter,
	playTimeRunning,
}: HudProps) {
	return (
		<>
			{/* O2 放在 z-30 容器外面，終端機開著時才拉得到黑幕上面（M10-9） */}
			<OxygenReadout oxygen={oxygen} raised={terminalOpen} />
			{/* 倒數每秒變，放在 aria-live 容器外面；終端機開著時留在黑幕下面（跟艙區名一樣變暗），但不卸載，免得丟掉還沒存的秒數 */}
			<DecommissionCountdown chapter={chapter} running={playTimeRunning} />
			<div className="pointer-events-none absolute inset-0 z-30 text-2xl" aria-live="polite">
				{room !== null && (
					<div className="absolute top-4 right-4 text-game-dim" data-testid="hud-room">
						{ROOM_NAMES[room]}
					</div>
				)}
				{showControlsHint && <ControlsHint />}
				{/* 底部一排是目標面板（左）與 NOVA 對話框（右），1280 以下塞不下中間的提示，往上移到它們上方 */}
				{nearbyTerminal !== null && !terminalOpen && (
					<div
						className="absolute bottom-60 left-1/2 -translate-x-1/2 whitespace-nowrap text-game-holo lg:bottom-32 xl:bottom-16"
						data-testid="interact-hint"
					>
						按 E 開啟 {nearbyTerminal.title}
					</div>
				)}
			</div>
		</>
	);
}
