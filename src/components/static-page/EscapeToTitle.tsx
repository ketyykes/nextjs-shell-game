"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 靜態頁（製作名單、真實世界橋接頁，設計文件 4.20）的 Esc 回標題。
 *
 * 只掛鍵盤監聽、不畫任何東西；頁面上看得到的「返回標題」是一般連結，沒有 JavaScript 也能用。
 * 長按的連發不理，只導一次頁。
 */
export function EscapeToTitle() {
	const router = useRouter();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape" || event.repeat) {
				return;
			}
			event.preventDefault();
			router.push("/");
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [router]);

	return null;
}
