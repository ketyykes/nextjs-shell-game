/**
 * 章節的輕量 metadata：標題畫面的副標與選章選單用。
 *
 * 刻意不 import 任何劇本檔——標題頁 import 完整註冊表會把六章劇本加 zod
 * 全部拉進 `/` 的首載 JS（實測 351KB 的 chunk）。這裡手寫常數，
 * `chapters.test.ts` 會檢查跟 `CHAPTERS` 一致，改章節名或加章記得兩邊同步。
 */

/** 一章的 metadata，只有標題畫面需要的欄位，外加 `date` 用的章節時鐘。 */
export interface ChapterMeta {
	chapter: number;
	deckName: string;
	/**
	 * 這一章的「現在」（ISO 8601，UTC），終端機的 `date` 印這個時間（第十九場，設計文件 4.18）。
	 * 終端機劇本自己寫了 `now` 時以那個為準。遊戲沒有流逝的時鐘，同一章的終端機都停在這個時間；
	 * 值不早於那一章劇本裡任何檔案的 mtime（`meta.test.ts` 會檢查），`date` 才不會比 `ls -l` 還舊。
	 */
	clock: string;
}

/**
 * 全部章節的 metadata，index 0 是第一章。
 * 時鐘的來源：第一章是喚醒（`WAKE_MTIME`），第二章是資料中心門禁的到站紀錄，第四章是通訊艙的登錄時間；
 * 第三章取工單 09:40 到搬走東西 10:12 之後，第五、六章劇本沒有「現在」的線索，接在第四章的回信（14:26 到 14:31）之後依序往後。
 */
export const CHAPTER_METAS: readonly ChapterMeta[] = [
	{ chapter: 1, deckName: "冷凍艙", clock: "2031-03-12T08:15:00Z" },
	{ chapter: 2, deckName: "資料中心", clock: "2031-03-12T09:12:00Z" },
	{ chapter: 3, deckName: "工程艙", clock: "2031-03-12T10:15:00Z" },
	{ chapter: 4, deckName: "通訊艙", clock: "2031-03-12T14:02:00Z" },
	{ chapter: 5, deckName: "艦橋", clock: "2031-03-12T15:07:00Z" },
	{ chapter: 6, deckName: "NOVA 核心", clock: "2031-03-12T16:21:00Z" },
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

/** 終端機 id（`ch4-t2`）裡的章節號。 */
const TERMINAL_CHAPTER_PATTERN = /^ch(\d+)-t\d+$/;

/**
 * 依終端機 id 取那一章的時鐘（`date` 用）；不是 `chN-tM` 格式的 id 用第一章的時鐘，
 * 章節號超出範圍時跟 `getChapterMeta` 一樣用最後一章。
 */
export function chapterClockOf(terminalId: string): string {
	const match = TERMINAL_CHAPTER_PATTERN.exec(terminalId);
	if (match === null) {
		return CHAPTER_METAS[0].clock;
	}
	return getChapterMeta(Number(match[1])).clock;
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
