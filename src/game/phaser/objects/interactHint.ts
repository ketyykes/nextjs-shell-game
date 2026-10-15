import type Phaser from "phaser";
import { PIXEL_FONT_SIZE, pixelFontFamily } from "./pixelFont";

/** 「按 E」提示在互動區中心上方的距離（px）。 */
export const INTERACT_HINT_OFFSET_Y = 28;

/** 提示文字要在黑色遮罩（LightMask 深度 50）之上，不然斷電時會被蓋黑。 */
const HINT_DEPTH = 60;

/** 便條提示的深色底（同 --game-bg）：便條的告示 tile 是藍橘警示條，全息藍的字直接疊上去看不清楚。 */
const HINT_BACKDROP_COLOR = "rgba(3, 9, 21, 0.85)";

export interface InteractHintOptions {
	/** 字後面墊一塊深色底，給背景很花的地方用（地圖便條）。 */
	backdrop?: boolean;
}

/**
 * 建立地圖上的「按 E」提示（終端機與便條共用同一種樣子），一開始隱藏，靠近時由呼叫端搬過去再顯示。
 * 字型用 next/font 載入的 Fusion Pixel（跟終端機的中文同一套），解析度 1 讓鏡頭放大時維持像素顆粒。
 */
export function createInteractHint(scene: Phaser.Scene, options: InteractHintOptions = {}): Phaser.GameObjects.Text {
	const fontFamily = pixelFontFamily((name) => getComputedStyle(document.documentElement).getPropertyValue(name));
	const style: Phaser.Types.GameObjects.Text.TextStyle = {
		fontFamily,
		fontSize: `${PIXEL_FONT_SIZE}px`,
		color: "#5fb3e8",
	};
	if (options.backdrop === true) {
		style.backgroundColor = HINT_BACKDROP_COLOR;
		style.padding = { x: 2, y: 1 };
	}
	const hintText = scene.add.text(0, 0, "按 E", style);
	hintText.setOrigin(0.5, 0.5);
	hintText.setResolution(1);
	hintText.setDepth(HINT_DEPTH);
	hintText.setVisible(false);

	// next/font 的 display: swap 讓字型可能還沒下載完；Phaser 的 Text 只在設定改變時重畫（setFontFamily 同名會略過），
	// 所以載完後用 style.update(true) 重新量字並重畫
	void document.fonts
		.load(`${PIXEL_FONT_SIZE}px ${fontFamily}`, "按E")
		.then(() => {
			if (hintText.active) {
				hintText.style.update(true);
			}
		})
		.catch(() => {
			// 載入失敗就維持 monospace 備援
		});

	return hintText;
}
