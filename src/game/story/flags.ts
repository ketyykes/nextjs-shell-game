/**
 * 劇情旗標的產生函式與型別守衛。
 *
 * 旗標存在 store 的 `storyFlags`，只有 true 才存；每章一組，都以 `ch<n>.` 開頭，
 * 所以「重玩本章」只要刪掉同前綴的旗標。從存檔讀回來的是任意字串，要先過 `isStoryFlag` 才能當 `StoryFlag` 用。
 */

import type { RoomId } from "@/game/phaser/events";
import { isRoomId } from "./rooms";
import type { StoryFlag } from "./types";

/** 第 `chapter` 章所有旗標的共同前綴，例如 `ch2.`。 */
export function chapterFlagPrefix(chapter: number): string {
	return `ch${chapter}.`;
}

/** 開場 NOVA 台詞已顯示。 */
export function introShownFlag(chapter: number): StoryFlag {
	return `ch${chapter}.introShown`;
}

/** 章節結尾台詞已顯示（章節結束畫面只播一次）。 */
export function outroShownFlag(chapter: number): StoryFlag {
	return `ch${chapter}.outroShown`;
}

/** 「第一次走進某艙區」的旗標，NOVA 的 `onEnterRoom` 台詞與插圖卡只出現一次就靠它。 */
export function roomEnteredFlag(chapter: number, roomId: RoomId): StoryFlag {
	return `ch${chapter}.room.${roomId}.entered`;
}

/** 旗標的格式：`ch<n>.introShown`、`ch<n>.outroShown`、`ch<n>.room.<艙區>.entered`。 */
const FLAG_PATTERN = /^ch\d+\.(?:introShown|outroShown|room\.([a-z_]+)\.entered)$/;

/** 字串是否為合法的劇情旗標；艙區旗標的 roomId 必須是已知艙區。 */
export function isStoryFlag(value: string): value is StoryFlag {
	const match = FLAG_PATTERN.exec(value);
	if (match === null) {
		return false;
	}
	const roomId = match[1];
	if (roomId === undefined) {
		return true;
	}
	return isRoomId(roomId);
}
