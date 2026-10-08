/**
 * 開發模式的角色座標鉤子（M11-6，延伸決策 #7）。
 *
 * e2e 走路要「讀座標 → 按方向鍵 → 到了再放開」的閉環，所以 Station 在開發模式把角色狀態掛到
 * `window.__kepler9Player`。正式 build 由 Station 用 `process.env.NODE_ENV` 擋掉，不會掛。
 * 刻意不 import Phaser，讓 Vitest 在 node 環境直接測；也不跟 PlayScreen 的 `window.__kepler9`（emit 鉤子）共用物件，
 * 兩邊各自掛、各自拆，React 重掛 effect 時不會把這邊的鉤子一起刪掉。
 */

import type { RoomId } from "../events";

/** 掛在 window 上的屬性名稱。e2e 用同一個常數讀。 */
export const PLAYER_PROBE_KEY = "__kepler9Player";

/** 角色當下的狀態。座標是 sprite 中心（世界座標，px），跟 `player:stopped`、艙區偵測、終端機互動用的是同一個點。 */
export interface PlayerProbeSnapshot {
	x: number;
	y: number;
	/** 目前艙區；站在門框這種不屬於任何艙區的格子上時為 null。 */
	roomId: RoomId | null;
	/** 角色能不能操作（終端機開著、暫停選單開著時為 false）。 */
	inputEnabled: boolean;
}

export interface PlayerProbe {
	read(): PlayerProbeSnapshot;
}

/**
 * 把鉤子掛到 `target`（瀏覽器裡是 window），回傳拆除函式。
 *
 * 拆除時只拆自己掛的那一個：場景重啟或 React StrictMode 重建遊戲時，新場景可能先掛、舊場景後拆，
 * 不比對身分的話會把新場景的鉤子一起拆掉。
 */
export function installPlayerProbe(target: Record<string, unknown>, read: () => PlayerProbeSnapshot): () => void {
	const probe: PlayerProbe = {
		read: () => ({ ...read() }),
	};
	target[PLAYER_PROBE_KEY] = probe;

	return () => {
		if (target[PLAYER_PROBE_KEY] === probe) {
			delete target[PLAYER_PROBE_KEY];
		}
	};
}
