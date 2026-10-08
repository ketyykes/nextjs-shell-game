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

import { DECK_ROOMS, type RoomId, type RoomSlot } from "@/game/phaser/events";

/**
 * `public/scenes/scene-<名字>.png` 已存在的名字（`scenes.test.ts` 會跟目錄比對）。
 * 新增插圖時重跑 `docs/assets-draft/scenes/generate-ch2-6.sh`（只補缺的），
 * 再跑 `node scripts/resize-scenes.mjs` 並把名字加進來。
 */
export const AVAILABLE_SCENES: ReadonlySet<string> = new Set([
	// 第一章
	"cryo",
	"lifesupport",
	"quarters",
	"medbay",
	"power",
	"airlock",
	"intro",
	"outro",
	// 第二章
	"dc_entry",
	"dc_logs",
	"dc_racks",
	"dc_cooling",
	"dc_backup",
	"dc_exit",
	"ch2_outro",
	// 第三章
	"eng_entry",
	"eng_workshop",
	"eng_storage",
	"eng_reactor",
	"eng_config",
	"eng_exit",
	"ch3_outro",
	// 第四章
	"com_entry",
	"com_relay",
	"com_antenna",
	"com_signal",
	"com_archive",
	"com_exit",
	"ch4_outro",
	// 第五章
	"br_entry",
	"br_nav",
	"br_captain",
	"br_security",
	"br_escape",
	"br_exit",
	"ch5_outro",
	// 第六章與片尾
	"nv_entry",
	"nv_monitor",
	"nv_memory",
	"nv_core",
	"nv_scheduler",
	"nv_escape",
	"ch6_outro",
	"ending",
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

/** 有插圖的艙區位置，依 T1 到 T6 的順序（走廊沒有插圖）。 */
const ROOM_SLOTS_IN_ORDER: readonly RoomSlot[] = ["start", "second", "third", "fourth", "fifth", "exit"];

/**
 * 第 `chapter` 章要背景預載的插圖（審計 A3）：六間艙區依 T1 到 T6 的順序，最後是結尾過場。
 * 只列真的存在的圖；超出章節範圍回傳空陣列。
 */
export function chapterSceneImages(chapter: number): string[] {
	const rooms = DECK_ROOMS[chapter];
	if (rooms === undefined) {
		return [];
	}
	const images: string[] = [];
	for (const slot of ROOM_SLOTS_IN_ORDER) {
		const image = sceneImageForRoom(rooms[slot]);
		if (image !== undefined) {
			images.push(image);
		}
	}
	const outro = outroImageForChapter(chapter);
	if (outro !== undefined) {
		images.push(outro);
	}
	return images;
}

/**
 * 在標題流程就先預載的插圖：第一章會走 boot log，結束時馬上顯示開場插圖，所以排第一；
 * 其他章直接進 `/play`，跟本章清單一樣。
 */
export function openingSceneImages(chapter: number): string[] {
	if (chapter === 1) {
		return [INTRO_SCENE_IMAGE, ...chapterSceneImages(1)];
	}
	return chapterSceneImages(chapter);
}
