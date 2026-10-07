import type { MetadataRoute } from "next";

/** 全站開放索引；sitemap 的網域由 NEXT_PUBLIC_SITE_URL 決定（見 sitemap.ts）。 */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/" },
	};
}
