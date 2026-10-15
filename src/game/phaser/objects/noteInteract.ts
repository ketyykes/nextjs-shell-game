/**
 * 地圖便條「按 E 要不要打開」的判斷（設計文件 4.19），不依賴 Phaser，方便單元測試；`NoteZones` 用它。
 */

export interface NoteInteractState {
	/** 目前靠近的便條，沒有是 null（靠近終端機時也是 null，終端機優先）。 */
	nearbyNoteId: string | null;
	/** 暫停選單或設定選單開著時 false。 */
	interactEnabled: boolean;
	/** 場景在跑（沒被終端機或便條暫停）。 */
	sceneActive: boolean;
	/** 上一次拿來打開便條的那個 keydown 事件物件。 */
	lastHandledEvent: object | undefined;
}

/**
 * 這一下 E 要不要打開便條。除了靠近、能互動、場景在跑，還要是「新的按下」：
 * - 按住不放的重複事件不算：用 E 關掉之後 Station 會重設按鍵狀態，還按著的 E 會被當成新的按下。
 * - 已經處理過的同一個事件物件不算：Phaser 的鍵盤佇列整幀累積、每來一個按鍵事件就從頭重跑一次
 *   （只跳過跟上一筆相同的），重設按鍵狀態之後，佇列裡打開便條的那個 keydown 會再送來一次，
 *   同一幀內用 E 關掉的便條就會又被打開。
 */
export function shouldOpenNote(state: NoteInteractState, event: { repeat: boolean } | undefined): boolean {
	if (state.nearbyNoteId === null || !state.interactEnabled || !state.sceneActive) {
		return false;
	}
	if (event === undefined) {
		return true;
	}
	if (event.repeat) {
		return false;
	}
	return event !== state.lastHandledEvent;
}
