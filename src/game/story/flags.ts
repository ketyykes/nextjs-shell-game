/**
 * 劇情旗標的常數與型別守衛。
 *
 * 旗標存在 store 的 `storyFlags`，只有 true 才存；
 * 從存檔讀回來的是任意字串，要先過 `isStoryFlag` 才能當 `StoryFlag` 用。
 */

import type { RoomId } from "@/game/phaser/events";
import { isRoomId } from "./rooms";
import type { StoryFlag } from "./types";

/** 第一章固定的劇情旗標。艙區進入旗標用 `roomEnteredFlag` 產生。 */
export const STORY_FLAGS = {
	/** 開場 NOVA 台詞已顯示。 */
	introShown: "ch1.introShown",
	/** 配電箱（T4）過關，燈亮。 */
	powerRestored: "ch1.powerRestored",
	/** 燈亮時走廊盡頭的人影已閃過。 */
	sawShadow: "ch1.sawShadow",
	/** 艙門控制台（T6）過關，主艙門開啟。 */
	airlockOpened: "ch1.airlockOpened",
	/** 第一章結尾台詞已顯示。 */
	outroShown: "ch1.outroShown",
} as const satisfies Record<string, StoryFlag>;

/** 所有固定旗標的值，型別守衛用。 */
const FIXED_FLAGS: readonly string[] = Object.values(STORY_FLAGS);

/** 艙區進入旗標的格式，例如 `ch1.room.cryo.entered`。 */
const ROOM_ENTERED_PATTERN = /^ch1\.room\.([a-z]+)\.entered$/;

/** 產生「第一次走進某艙區」的旗標，NOVA 的 `onEnterRoom` 台詞只播一次就靠它。 */
export function roomEnteredFlag(roomId: RoomId): StoryFlag {
	return `ch1.room.${roomId}.entered`;
}

/** 字串是否為合法的劇情旗標；艙區旗標的 roomId 必須在七個艙區之內。 */
export function isStoryFlag(value: string): value is StoryFlag {
	if (FIXED_FLAGS.includes(value)) {
		return true;
	}

	const match = ROOM_ENTERED_PATTERN.exec(value);
	if (match === null) {
		return false;
	}

	return isRoomId(match[1]);
}
