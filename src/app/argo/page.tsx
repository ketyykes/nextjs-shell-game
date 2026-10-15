import type { Metadata } from "next";
import { ArgoFlow } from "@/components/argo/ArgoFlow";

export const metadata: Metadata = {
	title: "Kepler-9 — 救援船 ARGO",
	// 沒通關直接開會被導回標題，收錄這頁沒有意義；robots.txt 不擋它，搜尋引擎才讀得到這個 noindex
	robots: { index: false },
};

/** 救援船 ARGO 的醫療終端機（設計文件 4.23）：片尾之後的尾聲。互動都在 client component `ArgoFlow` 裡。 */
export default function ArgoPage() {
	return <ArgoFlow />;
}
