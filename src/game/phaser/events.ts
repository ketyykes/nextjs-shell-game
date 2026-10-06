/**
 * Phaser 與 React 之間的事件名稱與 payload 型別（設計文件 3.1）。
 *
 * 兩邊都只能透過 `EventBus.ts` 收發這裡定義的事件，名稱打錯 TypeScript 會直接報錯。
 * 這個檔案不可以 import Phaser 或 React，讓 store、劇本、測試都能引用。
 */

/** 第一版五種音效（4.10），Phaser 的 SoundManager 是唯一出口。 */
export type SfxName = "ambient" | "key" | "door" | "power" | "nova-blip";

export interface GameEventMap {
	/** Phaser 發：玩家在終端機旁按 E。React 開啟對應的 shell 彈窗。 */
	"terminal:open": { terminalId: string };
	/** React 發：玩家關閉終端機。Phaser 恢復場景。 */
	"terminal:close": { terminalId: string };
	/** Phaser 發：玩家走進或離開終端機互動區，HUD 可用它顯示「按 E」。離開時 terminalId 為 null。 */
	"terminal:nearby": { terminalId: string | null };
	/** React 發：某台終端機過關。Phaser 依 registry 的 `terminalEffects` 播對應演出（燈亮、門開、人影）。 */
	"puzzle:solved": { terminalId: string };
	/** Phaser 發：玩家走進某個艙區。React 觸發 NOVA 的進房台詞。 */
	"room:enter": { roomId: RoomId };
	/** React 發：請 Phaser 播音效。 */
	"sfx:play": { sound: SfxName };
	/** Phaser 發：Station 場景建立完成，React 可以開始互動。 */
	"scene:ready": { sceneKey: string };
	/** React 發：環境反應階梯（4.8）第 3 次錯誤的「燈閃一下」，Phaser 讓畫面暗一下再亮。 */
	"ambient:flicker": { durationMs: number };
	/** React 發：設定選單改了音量或靜音，Phaser 的 AudioManager 即時套用。 */
	"audio:settings": { volume: number; muted: boolean };
	/** React 發：設定選單切換「閃爍」，Phaser 的人影、鏡頭震動與閃光、燈閃即時套用（光敏安全項）。 */
	"effects:settings": { flickerEnabled: boolean };
	/** React 發：暫停選單或設定選單開啟，Phaser 停住角色輸入。 */
	"game:pause": { reason: "menu" };
	/** React 發：選單關閉，Phaser 恢復角色輸入。 */
	"game:resume": { reason: "menu" };
	/** Phaser 發：角色走動後停下（只在某個艙區內才發），React 存進存檔，重開時從這裡出生。 */
	"player:stopped": { x: number; y: number; roomId: RoomId };
}

export type GameEventName = keyof GameEventMap;

// ---------------------------------------------------------------------------
// 艙區（六個甲板共用同一張平面圖，艙區 id 依甲板加前綴）
// ---------------------------------------------------------------------------

/**
 * 六個甲板都用同一張平面圖（設計文件第 9 節的配置，`scripts/build-map.mjs` 的 `DECK_LAYOUTS`），
 * 七個「位置」固定，每個甲板給它們不同的艙區 id 與名稱：
 *
 * | 位置 | 平面圖位置 | 終端機 | 第 1 章 | 第 2 章 | 第 3 章 | 第 4 章 | 第 5 章 | 第 6 章 |
 * |---|---|---|---|---|---|---|---|---|
 * | start | 下排左（出生點） | T1 | cryo | dc_entry | eng_entry | com_entry | br_entry | nv_entry |
 * | second | 下排中 | T2 | lifesupport | dc_logs | eng_workshop | com_relay | br_nav | nv_monitor |
 * | third | 上排左 | T3 | quarters | dc_racks | eng_storage | com_antenna | br_captain | nv_memory |
 * | fourth | 上排右 | T4 | power | dc_cooling | eng_reactor | com_signal | br_security | nv_core |
 * | fifth | 上排中 | T5 | medbay | dc_backup | eng_config | com_archive | br_escape | nv_scheduler |
 * | exit | 走廊右端（鎖門） | T6 | airlock | dc_exit | eng_exit | com_exit | br_exit | nv_escape |
 * | corridor | 中間橫走廊 | 無 | corridor | dc_corridor | eng_corridor | com_corridor | br_corridor | nv_corridor |
 */
export type RoomId =
	// 第一章 冷凍艙與維生艙（deck1）
	| "cryo"
	| "lifesupport"
	| "quarters"
	| "medbay"
	| "power"
	| "corridor"
	| "airlock"
	// 第二章 資料中心（deck2）
	| "dc_entry"
	| "dc_logs"
	| "dc_racks"
	| "dc_cooling"
	| "dc_backup"
	| "dc_exit"
	| "dc_corridor"
	// 第三章 工程艙（deck3）
	| "eng_entry"
	| "eng_workshop"
	| "eng_storage"
	| "eng_reactor"
	| "eng_config"
	| "eng_exit"
	| "eng_corridor"
	// 第四章 通訊艙（deck4）
	| "com_entry"
	| "com_relay"
	| "com_antenna"
	| "com_signal"
	| "com_archive"
	| "com_exit"
	| "com_corridor"
	// 第五章 艦橋（deck5）
	| "br_entry"
	| "br_nav"
	| "br_captain"
	| "br_security"
	| "br_escape"
	| "br_exit"
	| "br_corridor"
	// 第六章 NOVA 核心（deck6）
	| "nv_entry"
	| "nv_monitor"
	| "nv_memory"
	| "nv_core"
	| "nv_scheduler"
	| "nv_escape"
	| "nv_corridor";

/** 艙區 id 對應的繁中名稱，HUD 與 NOVA 台詞用。 */
export const ROOM_NAMES: Record<RoomId, string> = {
	cryo: "冷凍艙",
	lifesupport: "維生艙",
	quarters: "宿舍",
	medbay: "醫療艙",
	power: "配電室",
	corridor: "主走廊",
	airlock: "主艙門",

	dc_entry: "資料中心入口",
	dc_logs: "日誌封存庫",
	dc_racks: "機櫃區",
	dc_cooling: "冷卻機房",
	dc_backup: "備援機房",
	dc_exit: "資料中心艙門",
	dc_corridor: "資料中心走廊",

	eng_entry: "工程艙入口",
	eng_workshop: "工作間",
	eng_storage: "零件倉",
	eng_reactor: "反應爐控制室",
	eng_config: "設定機房",
	eng_exit: "工程艙艙門",
	eng_corridor: "工程艙走廊",

	com_entry: "通訊艙入口",
	com_relay: "中繼機房",
	com_antenna: "天線控制室",
	com_signal: "訊號處理室",
	com_archive: "通訊紀錄室",
	com_exit: "通訊艙艙門",
	com_corridor: "通訊艙走廊",

	br_entry: "艦橋入口",
	br_nav: "導航站",
	br_captain: "艦長室",
	br_security: "安全管制室",
	br_escape: "逃生艙紀錄室",
	br_exit: "艦橋艙門",
	br_corridor: "艦橋走廊",

	nv_entry: "核心艙入口",
	nv_monitor: "監控室",
	nv_memory: "記憶庫",
	nv_core: "NOVA 核心",
	nv_scheduler: "排程機房",
	nv_escape: "逃生艙",
	nv_corridor: "核心艙走廊",
};

/** 平面圖上的七個位置，`DECK_LAYOUTS` 每個甲板都要填齊。 */
export type RoomSlot = "start" | "second" | "third" | "fourth" | "fifth" | "exit" | "corridor";

/** 每個甲板七個位置對應的艙區 id。`scripts/build-map.mjs` 與劇本都照這張表。 */
export const DECK_ROOMS: Record<number, Record<RoomSlot, RoomId>> = {
	1: { start: "cryo", second: "lifesupport", third: "quarters", fourth: "power", fifth: "medbay", exit: "airlock", corridor: "corridor" },
	2: { start: "dc_entry", second: "dc_logs", third: "dc_racks", fourth: "dc_cooling", fifth: "dc_backup", exit: "dc_exit", corridor: "dc_corridor" },
	3: { start: "eng_entry", second: "eng_workshop", third: "eng_storage", fourth: "eng_reactor", fifth: "eng_config", exit: "eng_exit", corridor: "eng_corridor" },
	4: { start: "com_entry", second: "com_relay", third: "com_antenna", fourth: "com_signal", fifth: "com_archive", exit: "com_exit", corridor: "com_corridor" },
	5: { start: "br_entry", second: "br_nav", third: "br_captain", fourth: "br_security", fifth: "br_escape", exit: "br_exit", corridor: "br_corridor" },
	6: { start: "nv_entry", second: "nv_monitor", third: "nv_memory", fourth: "nv_core", fifth: "nv_scheduler", exit: "nv_escape", corridor: "nv_corridor" },
};

/** 章節數，`DECK_ROOMS` 與 `public/maps/deck{n}.json` 都是 1 到這個數。 */
export const CHAPTER_COUNT = 6;

// ---------------------------------------------------------------------------
// 過關演出（劇本宣告、Phaser 執行；經 registry 的 `terminalEffects` 傳遞，必須可 JSON 序列化）
// ---------------------------------------------------------------------------

/**
 * 終端機過關時地圖上的演出。劇本在 `TerminalDefinition.effect` 宣告，Station 依 id 查表執行；
 * 沒宣告的終端機在地圖上沒有變化（過關回饋由終端機畫面負責）。
 *
 * - `powerRestored`：燈從該終端機所在艙區一間一間亮起、走廊亮時人影閃一幀、最後整層亮（第一章 T4）。重整後直接全亮。
 * - `openDoor`：移除 `doorId` 那扇鎖門的 tile 與阻擋格、鏡頭閃全息藍、燈若還沒亮也一起亮（每章 T6 的出口門）。重整後直接開著。
 * - `shadowFlash`：走廊盡頭人影閃一幀加鏡頭微震，不改燈。
 * - `flicker`：燈閃一下（同環境反應階梯的燈閃），不改狀態。
 * - `blackout`：燈全滅回到斷電狀態（第六章用），重整後保持黑。
 */
export type SolvedEffect =
	| { kind: "powerRestored" }
	| { kind: "openDoor"; doorId: string }
	| { kind: "shadowFlash" }
	| { kind: "flicker" }
	| { kind: "blackout" };

/** 每章出口鎖門在地圖 `markers` 層的 doorId，六個甲板都一樣。 */
export const EXIT_DOOR_ID = "airlock";
