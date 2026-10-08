/**
 * 劇情旗標的產生函式與型別守衛。
 *
 * 旗標存在 store 的 `storyFlags`，只有 true 才存；每章一組，都以 `ch<n>.` 開頭（終端機旗標也是），
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

/**
 * 「這台終端機的 NOVA 開場白說過了」的旗標，例如 `ch2.terminal.ch2-t3.opened`。
 * 章節前綴取自終端機 id（劇本 schema 保證是 `ch<n>-t<k>`），所以重玩本章時跟著清掉。
 * 不用輸出紀錄裡有沒有開場白來判斷：`clear` 或輸出紀錄超過上限被截掉後就看不到了。
 */
export function terminalOpenedFlag(terminalId: string): StoryFlag {
	// `ch2-t3` 的 `ch2` 就是章節前綴
	const [chapterPart] = terminalId.split("-");
	return `${chapterPart}.terminal.${terminalId}.opened` as StoryFlag;
}

/** 旗標的格式：`ch<n>.introShown`、`ch<n>.outroShown`、`ch<n>.room.<艙區>.entered`、`ch<n>.terminal.ch<n>-t<k>.opened`。 */
const FLAG_PATTERN = /^ch(\d+)\.(?:introShown|outroShown|room\.([a-z_]+)\.entered|terminal\.ch(\d+)-t\d+\.opened)$/;

/** 字串是否為合法的劇情旗標；艙區旗標的 roomId 必須是已知艙區。 */
export function isStoryFlag(value: string): value is StoryFlag {
	const match = FLAG_PATTERN.exec(value);
	if (match === null) {
		return false;
	}
	const [, chapter, roomId, terminalChapter] = match;
	if (terminalChapter !== undefined) {
		// 終端機旗標的章節前綴要跟終端機 id 的章節一致，重玩本章才清得到
		return Number(terminalChapter) === Number(chapter);
	}
	if (roomId === undefined) {
		return true;
	}
	return isRoomId(roomId);
}

/** NOVA 對話框的立繪：`eye` 是像瞳孔的像素球體，`core` 是第六章核心艙裡看到的本體（損毀的全息多面體）。 */
export type NovaPortrait = "eye" | "core";

/**
 * 第六章第一次走進 NOVA 核心艙（`nv_core`）之後，玩家已經看過它的本體，對話框改用 `core`；
 * 其他章節與進核心艙之前都是 `eye`（設計文件 4.1）。用艙區旗標判定，重整後也維持。
 */
export function novaPortraitFor(chapter: number, flags: Readonly<Record<string, true>>): NovaPortrait {
	if (chapter !== 6) {
		return "eye";
	}
	if (flags[roomEnteredFlag(6, "nv_core")] === true) {
		return "core";
	}
	return "eye";
}
