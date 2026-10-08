/**
 * 章節的輕量 metadata：標題畫面的副標與選章選單用。
 *
 * 刻意不 import 任何劇本檔——標題頁 import 完整註冊表會把六章劇本加 zod
 * 全部拉進 `/` 的首載 JS（實測 351KB 的 chunk）。這裡手寫常數，
 * `chapters.test.ts` 會檢查跟 `CHAPTERS` 一致，改章節名或加章記得兩邊同步。
 */

/** 一章的 metadata，只有標題畫面需要的欄位。 */
export interface ChapterMeta {
	chapter: number;
	deckName: string;
}

/** 全部章節的 metadata，index 0 是第一章。 */
export const CHAPTER_METAS: readonly ChapterMeta[] = [
	{ chapter: 1, deckName: "冷凍艙" },
	{ chapter: 2, deckName: "資料中心" },
	{ chapter: 3, deckName: "工程艙" },
	{ chapter: 4, deckName: "通訊艙" },
	{ chapter: 5, deckName: "艦橋" },
	{ chapter: 6, deckName: "NOVA 核心" },
];

/** 最後一章的章節號（等於 `CHAPTERS` 的 `FINAL_CHAPTER`），存檔的通關判斷用。 */
export const LAST_CHAPTER = CHAPTER_METAS[CHAPTER_METAS.length - 1].chapter;

/** 開場 boot log 最後接的 NOVA 第一句，等於第一章 `intro[0]`。 */
export const NOVA_FIRST_LINE = "……連線建立。站務系統 NOVA，低功率模式。";

/** 依章節號取 metadata；超出範圍回傳最後一章（跟 `getChapter` 同樣的容錯）。 */
export function getChapterMeta(chapter: number): ChapterMeta {
	const found = CHAPTER_METAS.find((item) => item.chapter === chapter);
	if (found !== undefined) {
		return found;
	}
	return CHAPTER_METAS[CHAPTER_METAS.length - 1];
}

const CHINESE_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 章節號的中文數字，例如 3 → 「三」；超過九就用阿拉伯數字。 */
export function chapterNumeral(chapter: number): string {
	return CHINESE_NUMERALS[chapter] ?? String(chapter);
}

/** 選章清單、通關紀錄與匯入確認用的章節名，例如「第三章 工程艙」。 */
export function chapterLabel(chapter: number): string {
	return `第${chapterNumeral(chapter)}章 ${getChapterMeta(chapter).deckName}`;
}
