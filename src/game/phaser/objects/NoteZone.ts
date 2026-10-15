import Phaser from "phaser";
import { NOTE_INTERACT_RADIUS } from "../constants";
import { emitGameEvent } from "../EventBus";
import type { NoteMarker } from "../scenes/mapObjects";
import { createInteractHint, INTERACT_HINT_OFFSET_Y } from "./interactHint";
import { findNearestNote } from "./nearby";
import { shouldOpenNote } from "./noteInteract";

/**
 * 管理場景內所有地圖便條（設計文件 4.19）的互動區：靠近顯示「按 E」、按 E 發 `note:open` 並暫停場景。
 * 比照 `TerminalZones`，但不發光（便條不是方向指引），也不發 `terminal:nearby`（目標面板只看終端機）。
 *
 * 整合方式：Station 的 `create()` 建立一次，`update()` 每幀傳入玩家座標與「是否正靠近終端機」；
 * 場景 shutdown 或 destroy 時呼叫 `destroy()`。React 關閉閱讀視窗時發 `note:close`，由 Station 恢復場景。
 */
export class NoteZones {
	private readonly scene: Phaser.Scene;
	private readonly notes: readonly NoteMarker[];

	private hintText!: Phaser.GameObjects.Text;
	private eKey!: Phaser.Input.Keyboard.Key;

	private currentNoteId: string | null = null;
	private isDestroyed = false;
	/** 暫停選單或設定選單開著時為 false，按 E 不開便條（場景本身沒暫停，鍵盤事件還會進來）。 */
	private interactEnabled = true;
	/** 上一次拿來打開便條的 keydown，Phaser 同一幀重跑鍵盤佇列時會再送來，要認得出來。 */
	private lastHandledEvent: KeyboardEvent | undefined;

	constructor(scene: Phaser.Scene, notes: NoteMarker[]) {
		this.scene = scene;
		this.notes = notes;
		this.hintText = createInteractHint(scene, { backdrop: true });
		this.createKey();
	}

	/** 目前靠近的便條 id，沒有靠近任何一張為 null。 */
	get nearbyNoteId(): string | null {
		return this.currentNoteId;
	}

	/** 每幀呼叫：更新靠近狀態。同時靠近終端機時終端機優先，便條的提示收起來。 */
	update(playerX: number, playerY: number, terminalNearby: boolean): void {
		if (this.isDestroyed) {
			return;
		}

		const nearest = findNearestNote(playerX, playerY, this.notes, NOTE_INTERACT_RADIUS, terminalNearby);
		const nextNoteId = nearest ? nearest.noteId : null;
		if (nextNoteId === this.currentNoteId) {
			return;
		}
		this.currentNoteId = nextNoteId;

		if (nearest === null) {
			this.hintText.setVisible(false);
			return;
		}
		this.hintText.setPosition(nearest.x, nearest.y - INTERACT_HINT_OFFSET_Y);
		this.hintText.setVisible(true);
	}

	/** 開關 E 鍵互動。Station 在 `game:pause` 時關、`game:resume` 時開，靠近提示照常顯示。 */
	setInteractEnabled(enabled: boolean): void {
		this.interactEnabled = enabled;
	}

	/** 清掉提示文字與按鍵。可重複呼叫。 */
	destroy(): void {
		if (this.isDestroyed) {
			return;
		}
		this.isDestroyed = true;

		this.hintText.destroy();
		this.eKey.off(Phaser.Input.Keyboard.Events.DOWN, this.handleInteract, this);
		// E 鍵物件跟 TerminalZones 共用（addKey 同一個鍵碼回傳同一個 Key），誰先拆都一樣：另一邊的 removeKey 會變成什麼都不做
		this.scene.input.keyboard?.removeKey(this.eKey, true, true);
		this.currentNoteId = null;
	}

	/**
	 * E 鍵按下：有靠近的便條就發 `note:open` 並暫停場景，跟 `TerminalZones.handleInteract` 同一套做法。
	 * 要不要開由 `shouldOpenNote` 判斷：按住的重複事件、Phaser 重跑佇列送回的舊事件都不算（原因見 noteInteract.ts）。
	 */
	private handleInteract(_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent | undefined): void {
		if (this.isDestroyed) {
			return;
		}
		const noteId = this.currentNoteId;
		const open = shouldOpenNote(
			{
				nearbyNoteId: noteId,
				interactEnabled: this.interactEnabled,
				sceneActive: this.scene.scene.isActive(),
				lastHandledEvent: this.lastHandledEvent,
			},
			event,
		);
		if (!open || noteId === null) {
			return;
		}
		this.lastHandledEvent = event;
		event?.preventDefault();
		emitGameEvent("note:open", { noteId });
		this.scene.scene.pause();
	}

	/** 註冊 E 鍵，不開全域 capture（終端機輸入框才打得出字母 e，見 TerminalZones）。 */
	private createKey(): void {
		const keyboard = this.scene.input.keyboard;
		if (!keyboard) {
			throw new Error("[NoteZones] 鍵盤輸入未啟用，無法註冊 E 鍵");
		}
		this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
		this.eKey.on(Phaser.Input.Keyboard.Events.DOWN, this.handleInteract, this);
	}
}
