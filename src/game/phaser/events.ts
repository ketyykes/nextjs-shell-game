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
	/** React 發：某台終端機過關。Phaser 播對應演出（燈亮、門開、人影）。 */
	"puzzle:solved": { terminalId: string };
	/** Phaser 發：玩家走進某個艙區。React 觸發 NOVA 的進房台詞。 */
	"room:enter": { roomId: RoomId };
	/** React 發：請 Phaser 播音效。 */
	"sfx:play": { sound: SfxName };
	/** Phaser 發：Station 場景建立完成，React 可以開始互動。 */
	"scene:ready": { sceneKey: string };
}

export type GameEventName = keyof GameEventMap;

/** 第一章的艙區 id，對應設計文件第 9 節的地圖配置。 */
export type RoomId = "cryo" | "lifesupport" | "quarters" | "medbay" | "power" | "corridor" | "airlock";

/** 艙區 id 對應的繁中名稱，HUD 與 NOVA 台詞用。 */
export const ROOM_NAMES: Record<RoomId, string> = {
	cryo: "冷凍艙",
	lifesupport: "維生艙",
	quarters: "宿舍",
	medbay: "醫療艙",
	power: "配電室",
	corridor: "主走廊",
	airlock: "主艙門",
};
