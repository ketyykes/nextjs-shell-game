/**
 * 場景插圖的路徑（設計文件 6.3，M6-1 用 codex 產的八張圖）。
 *
 * 六個艙區各一張，走廊沒有自己的插圖；開場與結尾各一張過場。
 * 原圖在 `docs/assets-draft/scenes/*-original.png`（不進版控），`public/scenes/` 是 640x360 的縮圖。
 */

import type { RoomId } from "@/game/phaser/events";

export const SCENE_IMAGES: Partial<Record<RoomId, string>> = {
	cryo: "/scenes/scene-cryo.png",
	lifesupport: "/scenes/scene-lifesupport.png",
	quarters: "/scenes/scene-quarters.png",
	medbay: "/scenes/scene-medbay.png",
	power: "/scenes/scene-power.png",
	airlock: "/scenes/scene-airlock.png",
};

export const INTRO_SCENE_IMAGE = "/scenes/scene-intro.png";
export const OUTRO_SCENE_IMAGE = "/scenes/scene-outro.png";

/** 艙區的插圖路徑，走廊這類沒有插圖的回傳 undefined。 */
export function sceneImageForRoom(roomId: RoomId): string | undefined {
	return SCENE_IMAGES[roomId];
}
