/**
 * 地圖上「按 E」提示的像素字型（設計文件 4.9：Phaser 內的文字只有這一個）。
 *
 * 不另外做 bitmap 字型：next/font 已經把 Fusion Pixel（有中文字）掛成 html 上的 CSS 變數 `--font-fusion-pixel`，
 * 值是雜湊過的 font-family 名稱，這裡讀出來給 Phaser 的 Text 用。刻意不 import Phaser，方便單元測試。
 */

/** Fusion Pixel 用 12 的整數倍最清楚。地圖鏡頭放大兩倍，畫面上約 24px。 */
export const PIXEL_FONT_SIZE = 12;

const FONT_VARIABLE = "--font-fusion-pixel";
const FALLBACK = "monospace";

/** `read` 讀 CSS 變數（瀏覽器裡是 `getComputedStyle(document.documentElement).getPropertyValue`）。 */
export function pixelFontFamily(read: (name: string) => string): string {
	const family = read(FONT_VARIABLE).trim();
	if (family === "") {
		return FALLBACK;
	}
	return `${family}, ${FALLBACK}`;
}
