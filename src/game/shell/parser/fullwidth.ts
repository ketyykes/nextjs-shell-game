/**
 * 全形字元偵測。
 *
 * 繁中玩家最常見的痛點是忘了切換輸入法，打出全形空白或全形標點，
 * 真的 shell 只會回「找不到指令」，玩家看不出哪裡錯。
 * 這裡在解析前先掃一遍，讓 shell 能回專屬的友善訊息。
 *
 * 注意：中文字（CJK 漢字）不是全形標點，不能誤判。
 * 檔案內容與劇情都是繁中，玩家之後可能會打中文檔名。
 */

/** 全形空白（U+3000）。 */
const IDEOGRAPHIC_SPACE = 0x3000;

/**
 * 全形 ASCII 區段（U+FF01 到 U+FF5E），
 * 涵蓋 `！＂＃＄％＆＇（）＊＋，－．／０-９：；＜＝＞？＠Ａ-Ｚ［＼］＾＿｀ａ-ｚ｛｜｝～`。
 */
const FULLWIDTH_ASCII_START = 0xff01;
const FULLWIDTH_ASCII_END = 0xff5e;

/**
 * 不在全形 ASCII 區段、但中文輸入法常打出來的標點。
 * 彎引號（`“”‘’`）不是嚴格意義的全形字元，
 * 但中文輸入法按 `"` 或 `'` 時打出來的就是它們，shell 不認得，一併攔下。
 */
const EXTRA_FULLWIDTH_PUNCTUATION = new Set<string>([
	"、", // U+3001
	"。", // U+3002
	"〈", // U+3008
	"〉", // U+3009
	"《", // U+300A
	"》", // U+300B
	"「", // U+300C
	"」", // U+300D
	"『", // U+300E
	"』", // U+300F
	"【", // U+3010
	"】", // U+3011
	"〜", // U+301C
	"“", // U+201C
	"”", // U+201D
	"‘", // U+2018
	"’", // U+2019
]);

/** 判斷單一字元是否為要攔下的全形字元。 */
function isFullwidthChar(char: string): boolean {
	const codePoint = char.codePointAt(0);
	if (codePoint === undefined) {
		return false;
	}
	if (codePoint === IDEOGRAPHIC_SPACE) {
		return true;
	}
	if (codePoint >= FULLWIDTH_ASCII_START && codePoint <= FULLWIDTH_ASCII_END) {
		return true;
	}
	return EXTRA_FULLWIDTH_PUNCTUATION.has(char);
}

/**
 * 找出輸入中第一個全形空白或全形標點（含全形英數字）。
 * 找不到回傳 `null`。中文漢字不算。
 */
export function findFullwidthChar(input: string): string | null {
	// 用 for...of 逐個 code point 走，避免把代理對拆成兩半
	for (const char of input) {
		if (isFullwidthChar(char)) {
			return char;
		}
	}
	return null;
}
