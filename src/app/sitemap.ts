import type { MetadataRoute } from "next";

/** 部署後在環境變數設定正式網域（例如 https://kepler9.example.com），沒設時用 localhost 佔位。 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{ url: SITE_URL, priority: 1 },
		{ url: `${SITE_URL}/play`, priority: 0.8 },
	];
}
