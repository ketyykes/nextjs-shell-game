/**
 * 六個甲板的終端機配置契約：每章六台終端機固定落在平面圖的六個位置（見 `events.ts` 的 `DECK_ROOMS`），
 * 這裡定每台的 id、標題與所在艙區。`scripts/build-map.mjs` 產地圖、`src/game/chapters/*.ts` 寫劇本、
 * e2e 走路都照這張表，三邊才對得起來（`ch*.test.ts` 會拿地圖 markers 跟劇本比對）。
 *
 * 這個檔案不 import React、Phaser 或 zustand。
 */

import { DECK_ROOMS, type RoomId, type RoomSlot } from "@/game/phaser/events";

/** 終端機在平面圖上的位置：T1 出生房、T2 下排中、T3 上排左、T4 上排右、T5 上排中、T6 出口。 */
export const TERMINAL_SLOTS: Record<TerminalIndex, Exclude<RoomSlot, "corridor">> = {
	1: "start",
	2: "second",
	3: "third",
	4: "fourth",
	5: "fifth",
	6: "exit",
};

export type TerminalIndex = 1 | 2 | 3 | 4 | 5 | 6;

/** 每章六台終端機的標題，index 對應 T1 到 T6。 */
const DECK_TERMINAL_TITLES: Record<number, Record<TerminalIndex, string>> = {
	1: {
		1: "冷凍艙控制台",
		2: "維生系統監控台",
		3: "宿舍終端機",
		4: "配電箱",
		5: "醫療艙終端機",
		6: "艙門控制台",
	},
	2: {
		1: "入口登錄台",
		2: "日誌封存終端機",
		3: "機櫃管理台",
		4: "冷卻監控台",
		5: "備援主控台",
		6: "資料中心艙門控制台",
	},
	3: {
		1: "工程艙登錄台",
		2: "工作間終端機",
		3: "零件倉管理台",
		4: "反應爐控制台",
		5: "設定機房終端機",
		6: "工程艙艙門控制台",
	},
	4: {
		1: "通訊艙登錄台",
		2: "中繼機房終端機",
		3: "天線控制台",
		4: "訊號處理台",
		5: "通訊紀錄終端機",
		6: "通訊艙艙門控制台",
	},
	5: {
		1: "艦橋登錄台",
		2: "導航站終端機",
		3: "艦長室終端機",
		4: "安全管制台",
		5: "逃生艙紀錄台",
		6: "艦橋艙門控制台",
	},
	6: {
		1: "核心艙登錄台",
		2: "監控室終端機",
		3: "記憶庫終端機",
		4: "NOVA 核心控制台",
		5: "排程機房終端機",
		6: "逃生艙控制台",
	},
};

/** 一台終端機在地圖上的身分：id、標題、所在艙區。 */
export interface DeckTerminal {
	id: string;
	title: string;
	roomId: RoomId;
	slot: Exclude<RoomSlot, "corridor">;
}

/** 第 `chapter` 章的第 `index` 台終端機（`ch<n>-t<index>`）。 */
export function deckTerminal(chapter: number, index: TerminalIndex): DeckTerminal {
	const titles = DECK_TERMINAL_TITLES[chapter];
	const rooms = DECK_ROOMS[chapter];
	if (titles === undefined || rooms === undefined) {
		throw new Error(`沒有第 ${chapter} 章的甲板配置`);
	}
	const slot = TERMINAL_SLOTS[index];
	return { id: `ch${chapter}-t${index}`, title: titles[index], roomId: rooms[slot], slot };
}

/**
 * 劇本用：只回 `TerminalDefinition` 需要的三個欄位（`id`、`title`、`roomId`），可以直接 `...deckTerminalIdentity(2, 1)` 展開。
 * `deckTerminal` 多帶的 `slot` 會被 `terminalDefinitionSchema` 的 strictObject 擋下，所以劇本不要展開它。
 */
export function deckTerminalIdentity(chapter: number, index: TerminalIndex): Pick<DeckTerminal, "id" | "title" | "roomId"> {
	const terminal = deckTerminal(chapter, index);
	return { id: terminal.id, title: terminal.title, roomId: terminal.roomId };
}

/** 第 `chapter` 章六台終端機，依 T1 到 T6 排序。 */
export function deckTerminals(chapter: number): DeckTerminal[] {
	const indexes: TerminalIndex[] = [1, 2, 3, 4, 5, 6];
	return indexes.map((index) => deckTerminal(chapter, index));
}
