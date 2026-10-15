/**
 * 地圖上的便條（設計文件 4.19）：第二到五章的艙區牆上可以按 E 讀的公告、便條與海報。
 *
 * 純氣氛與世界觀，不影響過關、不給解法、不劇透；不存檔、不記對話紀錄、不算進任何統計。
 * 第一章（教學節奏已經很滿）與第六章（NOVA 核心，不該有站務日常）不放。
 *
 * 位置契約：`tileX`、`tileY` 是便條本體的格座標，在房間上緣牆面那一列；互動區是正下方那一格 `(tileX, tileY + 1)`，跟終端機一樣。
 * `scripts/build-map.mjs` 的 `DECK_NOTES` 記同一份座標（mjs 不能 import TS，只好複製），`mapNotes.test.ts` 核對兩邊一致；
 * 改位置要兩邊一起改，再跑 `pnpm map:build` 重產地圖。
 *
 * 寫作規則（`mapNotes.test.ts` 守門）：
 * - 都是撤離前後站務日常的痕跡：公告、安全宣導、失物招領、登記表、手寫便條。寫的人只用職稱或單位，不寫名字。
 * - 只用那一章一開始玩家就知道的事；不提 NOVA、阿彬、回滾、名單、冷凍艙、除役，也不碰點名與人數（4.2 的真相）。
 * - 不指涉主角的性別、年齡、名字。
 * - 不寫任何指令、路徑或變數，也不暗示哪一台終端機怎麼解。
 */

import { TILE_SIZE } from "@/game/phaser/constants";
import type { RoomId } from "@/game/phaser/events";

export interface MapNote {
	/** 地圖 `markers` 層 note 物件的 `noteId`，全站唯一，`ch<章>-` 開頭。 */
	id: string;
	chapter: number;
	/** 所在艙區，必須是那一章有終端機的房間。 */
	roomId: RoomId;
	/** 便條本體的格座標（房間上緣牆面那一列）。 */
	tileX: number;
	tileY: number;
	/** 物件名，閱讀視窗的標題，例如「公告欄」「安全海報」。 */
	objectName: string;
	/** 內容，一個元素一行。 */
	lines: readonly string[];
}

export const MAP_NOTES: readonly MapNote[] = [
	// ---- 第二章 資料中心 ----
	{
		id: "ch2-entry-notice",
		chapter: 2,
		roomId: "dc_entry",
		tileX: 10,
		tileY: 14,
		objectName: "公告欄",
		lines: [
			"資料中心　進出須知",
			"· 機櫃區禁止飲食，包括「只是一杯咖啡」。",
			"· 冷卻機房很吵，停留超過十分鐘請戴耳罩。",
			"· 封存庫的日誌都數位化了，請不要再印出來。",
			"· 訪客請在入口等候值班人員。",
			"站務組　2028-04-02",
			"（旁邊有人用筆加了一句：「哪來的訪客？」）",
		],
	},
	{
		id: "ch2-racks-lost-found",
		chapter: 2,
		roomId: "dc_racks",
		tileX: 9,
		tileY: 1,
		objectName: "失物招領",
		lines: [
			"以下物品在機櫃後面撿到，請到站務組認領：",
			"· 灰色毛襪一隻（左腳）",
			"· 寫到一半的家書，沒有署名",
			"· 耳機一副，撿到時還在播音樂",
			"認領期限：2028-06-07",
		],
	},

	// ---- 第三章 工程艙（開場斷電，只剩緊急照明） ----
	{
		id: "ch3-entry-safety-poster",
		chapter: 3,
		roomId: "eng_entry",
		tileX: 10,
		tileY: 14,
		objectName: "安全海報",
		lines: [
			"停電了？先別慌。",
			"一、站在原地，等眼睛適應黑暗。",
			"二、沿著地板邊緣的警示條走，會走到艙門。",
			"三、聽站務廣播的指示。",
			"四、不要一個人進反應爐控制室。",
			"工程組安全宣導　第 3 號",
		],
	},
	{
		id: "ch3-workshop-tool-log",
		chapter: 3,
		roomId: "eng_workshop",
		tileX: 15,
		tileY: 14,
		objectName: "工具借用登記表",
		lines: [
			"工作間　工具借用登記",
			"05/27　扭力扳手（大）　工程組　已歸還",
			"05/29　熱風槍　醫療艙　已歸還",
			"05/31　絕緣手套兩副　艦橋　已歸還",
			"06/01　剝線鉗　後勤",
			"06/01　手電筒（全部）　工程組",
		],
	},

	// ---- 第四章 通訊艙 ----
	{
		id: "ch4-entry-notice",
		chapter: 4,
		roomId: "com_entry",
		tileX: 10,
		tileY: 14,
		objectName: "公告欄",
		lines: [
			"通訊艙　使用公告",
			"· 私人訊息請排進每週的對外時段，一人一則。",
			"· 頻寬不夠時，站務訊息優先。",
			"· 主天線不是收音機，請不要再要求轉播球賽。",
			"· 耳機用完請掛回原位。",
			"通訊官　2028-05-06",
		],
	},
	{
		id: "ch4-signal-birthday-card",
		chapter: 4,
		roomId: "com_signal",
		tileX: 27,
		tileY: 1,
		objectName: "生日卡",
		lines: [
			"通訊官，生日快樂！",
			"蛋糕在交誼廳冰箱的第二層。",
			"值夜班的人也有份，別一個人吃完。",
			"蠟燭只找到一根，將就一下。",
			"——大家",
		],
	},

	// ---- 第五章 艦橋 ----
	{
		id: "ch5-entry-drill-poster",
		chapter: 5,
		roomId: "br_entry",
		tileX: 10,
		tileY: 14,
		objectName: "安全海報",
		lines: [
			"逃生演練",
			"每季一次，值班中的人也要參加。",
			"聽到三長聲警報，放下手邊的工作，到主艙門集合。",
			"不要回宿舍拿東西。",
			"下次演練：2028-06-15　09:00",
		],
	},
	{
		id: "ch5-nav-chair-note",
		chapter: 5,
		roomId: "br_nav",
		tileX: 15,
		tileY: 14,
		objectName: "椅背上的便條",
		lines: [
			"這張椅子會往左歪。",
			"坐下之前，先踢一下右邊的輪子。",
			"報修三次了，工程組說「不影響軌道」。",
			"它影響我的脊椎。",
		],
	},
];

/** 依 id 找便條，地圖與資料對不上時回 undefined。 */
export function findMapNote(noteId: string): MapNote | undefined {
	return MAP_NOTES.find((note) => note.id === noteId);
}

/** 某一章的便條，依清單順序。 */
export function mapNotesForChapter(chapter: number): MapNote[] {
	return MAP_NOTES.filter((note) => note.chapter === chapter);
}

/** 互動區（牆面正下方那一格）的中心像素座標，e2e 走路用。 */
export function noteInteractCenter(note: MapNote): { x: number; y: number } {
	return {
		x: note.tileX * TILE_SIZE + TILE_SIZE / 2,
		y: (note.tileY + 1) * TILE_SIZE + TILE_SIZE / 2,
	};
}
