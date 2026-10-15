// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TILE_SIZE } from "@/game/phaser/constants";
import { CHAPTER_COUNT, DECK_ROOMS } from "@/game/phaser/events";
import { buildDeckLayout } from "../../../scripts/build-map.mjs";
import { findMapNote, MAP_NOTES, mapNotesForChapter, noteInteractCenter } from "./mapNotes";

const CHAPTERS = Array.from({ length: CHAPTER_COUNT }, (_, index) => index + 1);
/** 放便條的章節：第一章與第六章不放（4.19）。 */
const NOTE_CHAPTERS = [2, 3, 4, 5];

/** 每則便條玩家看得到的文字：物件名與內容。 */
function noteTexts(): string[] {
	return MAP_NOTES.flatMap((note) => [note.objectName, ...note.lines]);
}

describe("便條清單", () => {
	it("共六到八則，第二到五章每章一到兩則，第一章與第六章沒有", () => {
		expect(MAP_NOTES.length).toBeGreaterThanOrEqual(6);
		expect(MAP_NOTES.length).toBeLessThanOrEqual(8);
		for (const chapter of CHAPTERS) {
			const count = mapNotesForChapter(chapter).length;
			if (NOTE_CHAPTERS.includes(chapter)) {
				expect(count, `第 ${chapter} 章`).toBeGreaterThanOrEqual(1);
				expect(count, `第 ${chapter} 章`).toBeLessThanOrEqual(2);
			} else {
				expect(count, `第 ${chapter} 章`).toBe(0);
			}
		}
	});

	it("id 唯一，而且以章節開頭（ch<n>-）", () => {
		const ids = MAP_NOTES.map((note) => note.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const note of MAP_NOTES) {
			expect(note.id).toMatch(new RegExp(`^ch${note.chapter}-[a-z0-9-]+$`));
		}
	});

	it("放在那一章有終端機的房間，不放走廊與艙門區", () => {
		for (const note of MAP_NOTES) {
			const rooms = DECK_ROOMS[note.chapter];
			const roomIds: string[] = [rooms.start, rooms.second, rooms.third, rooms.fourth, rooms.fifth];
			expect(roomIds, note.id).toContain(note.roomId);
		}
	});

	it("物件名一到八個字，內容二到八行、每行不超過 30 字", () => {
		for (const note of MAP_NOTES) {
			expect(note.objectName.length, note.id).toBeGreaterThanOrEqual(1);
			expect(note.objectName.length, note.id).toBeLessThanOrEqual(8);
			expect(note.lines.length, note.id).toBeGreaterThanOrEqual(2);
			expect(note.lines.length, note.id).toBeLessThanOrEqual(8);
			for (const line of note.lines) {
				expect(line.length, `${note.id}：${line}`).toBeLessThanOrEqual(30);
			}
		}
	});

	it("座標跟 scripts/build-map.mjs 產生地圖用的那一份一致", () => {
		for (const chapter of CHAPTERS) {
			const expected = mapNotesForChapter(chapter).map((note) => ({
				noteId: note.id,
				roomId: note.roomId,
				x: note.tileX,
				y: note.tileY,
			}));
			expect(buildDeckLayout(chapter).notes, `第 ${chapter} 章`).toEqual(expected);
		}
	});
});

describe("便條的文字規則", () => {
	it("不指涉性別", () => {
		const pattern = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;
		expect(noteTexts().filter((text) => pattern.test(text))).toEqual([]);
	});

	it("不劇透：不提 NOVA、阿彬、回滾、名單、冷凍艙、除役與點名", () => {
		const pattern = /NOVA|nova|阿彬|abin|回滾|rollback|名單|冷凍|pod|除役|點名|人數/;
		expect(noteTexts().filter((text) => pattern.test(text))).toEqual([]);
	});

	it("不給解法：不出現指令、路徑或變數", () => {
		const commandPattern =
			/\b(ls|cd|cat|pwd|grep|find|head|tail|wc|mkdir|touch|cp|mv|rm|chmod|export|env|unset|man|echo|sort|uniq|ps|kill|top|hint|less|sudo)\b/;
		const pathOrVariablePattern = /\/[A-Za-z_.~]|~\/|\$[A-Za-z{]/;
		const offending = noteTexts().filter((text) => commandPattern.test(text) || pathOrVariablePattern.test(text));
		expect(offending).toEqual([]);
	});
});

describe("查詢", () => {
	it("findMapNote 依 id 找便條，找不到回 undefined", () => {
		const first = MAP_NOTES[0];
		expect(findMapNote(first.id)).toBe(first);
		expect(findMapNote("ch9-nothing")).toBeUndefined();
	});

	it("noteInteractCenter 是互動區（牆面正下方那一格）的中心像素座標", () => {
		const note = MAP_NOTES[0];
		expect(noteInteractCenter(note)).toEqual({
			x: note.tileX * TILE_SIZE + TILE_SIZE / 2,
			y: (note.tileY + 1) * TILE_SIZE + TILE_SIZE / 2,
		});
	});
});
