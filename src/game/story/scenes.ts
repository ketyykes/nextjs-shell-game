/**
 * 場景插圖的路徑（設計文件 6.3，codex 產的圖）。
 *
 * 每章六個艙區各一張（走廊沒有）、每章一張結尾過場、第一章多一張開場、第六章多一張片尾。
 * 原圖在 `docs/assets-draft/scenes/*-original.png`（不進版控），`public/scenes/` 是 640x360 的縮圖，
 * 由 `node scripts/resize-scenes.mjs` 產生。
 *
 * `AVAILABLE_SCENES` 列的是 `public/scenes/` 裡真的存在的圖，沒產出來的艙區回傳 undefined，
 * 插圖卡會略過、章節結束畫面顯示佔位塊，不會出現破圖。產圖完成後把名字加進來。
 */

import type { RoomId } from "@/game/phaser/events";

/** `public/scenes/scene-<名字>.png` 已存在的名字。 */
export const AVAILABLE_SCENES: ReadonlySet<string> = new Set([
	"cryo",
	"lifesupport",
	"quarters",
	"medbay",
	"power",
	"airlock",
	"intro",
	"outro",
]);

/** 第一章開場過場。 */
export const INTRO_SCENE_IMAGE = "/scenes/scene-intro.png";
/** 第一章結尾過場（檔名沿用第一版的 `scene-outro.png`）。 */
export const OUTRO_SCENE_IMAGE = "/scenes/scene-outro.png";
/** 第六章之後的片尾：救援船的終端機亮起。 */
export const ENDING_SCENE_IMAGE = "/scenes/scene-ending.png";

/** 圖存在才回傳路徑。 */
function sceneImage(name: string): string | undefined {
	if (!AVAILABLE_SCENES.has(name)) {
		return undefined;
	}
	return `/scenes/scene-${name}.png`;
}

/** 艙區的插圖路徑，走廊這類沒有插圖的回傳 undefined。 */
export function sceneImageForRoom(roomId: RoomId): string | undefined {
	return sceneImage(roomId);
}

/** 第 `chapter` 章結尾過場的插圖，沒產出來回傳 undefined。 */
export function outroImageForChapter(chapter: number): string | undefined {
	if (chapter === 1) {
		return sceneImage("outro");
	}
	return sceneImage(`ch${chapter}_outro`);
}

/** 片尾插圖，沒產出來回傳 undefined。 */
export function endingImage(): string | undefined {
	return sceneImage("ending");
}
