import type { MetadataRoute } from "next";

/** 部署後在環境變數設定正式網域（例如 https://kepler9.example.com），沒設時用 localhost 佔位。 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** 列標題頁與練習模式；/play 沒有存檔會被導回標題，也帶 noindex（見 play/page.tsx）。 */
export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{ url: SITE_URL, priority: 1 },
		{ url: `${SITE_URL}/sandbox`, priority: 0.5 },
	];
}
