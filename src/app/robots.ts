import type { MetadataRoute } from "next";

/** 跟 sitemap.ts 一樣吃 NEXT_PUBLIC_SITE_URL，沒設時用 localhost 佔位。 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** 全站開放索引，並指出 sitemap 的位置。 */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/" },
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
