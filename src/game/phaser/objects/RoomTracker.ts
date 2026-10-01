/**
 * 追蹤玩家目前所在的艙區，進入新艙區時發 `room:enter`。
 *
 * 刻意不 import Phaser：建構子收純資料矩形，自己做 `contains` 判定，
 * 這樣不需要 Phaser 執行環境就能單元測試。Station 的 `StationRoom`
 * （rect 是 `Phaser.Geom.Rectangle`）結構上相容，可以直接傳入。
 */

import { emitGameEvent } from "../EventBus";
import type { RoomId } from "../events";

/** 純資料矩形，x、y 是左上角。 */
export interface RoomRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface TrackedRoom {
	roomId: RoomId;
	rect: RoomRect;
}

/**
 * 半開區間判定：左、上邊界算在內，右、下邊界不算。
 * 相鄰艙區共用邊界時（例如主走廊與主艙門）不會同時命中兩間。
 */
function containsPoint(rect: RoomRect, x: number, y: number): boolean {
	return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export class RoomTracker {
	private readonly rooms: readonly TrackedRoom[];
	private currentRoomId: RoomId | null = null;

	constructor(rooms: readonly TrackedRoom[]) {
		this.rooms = rooms;
	}

	/** 目前所在艙區，不在任何艙區為 null。 */
	get roomId(): RoomId | null {
		return this.currentRoomId;
	}

	/**
	 * 每幀呼叫。只在艙區改變且新位置在某個艙區內時發 `room:enter`；
	 * 走出所有艙區只更新狀態（回傳 null），不發事件，所以走回原本的艙區會再發一次。
	 * 多個艙區重疊時取陣列中較前面的那個。
	 */
	update(playerX: number, playerY: number): RoomId | null {
		const room = this.rooms.find((candidate) => containsPoint(candidate.rect, playerX, playerY));
		const nextRoomId = room ? room.roomId : null;

		if (nextRoomId !== this.currentRoomId) {
			this.currentRoomId = nextRoomId;
			if (nextRoomId !== null) {
				emitGameEvent("room:enter", { roomId: nextRoomId });
			}
		}

		return nextRoomId;
	}
}
