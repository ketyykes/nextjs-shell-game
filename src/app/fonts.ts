import { Press_Start_2P, VT323 } from "next/font/google";
import localFont from "next/font/local";

// 終端機內文與 NOVA 台詞的英數字型
export const vt323 = VT323({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-vt323",
	display: "swap",
});

// 只用在標題與章節名（字寬很大，長文字會難讀）
export const pressStart2P = Press_Start_2P({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-press-start",
});

// 繁體中文像素字型（12px 比例版），負責所有中文字，像素字型不需要度量補償
export const fusionPixel = localFont({
	src: "./fonts/fusion-pixel-12px-proportional-zh_hant.woff2",
	variable: "--font-fusion-pixel",
	display: "swap",
	adjustFontFallback: false,
});
