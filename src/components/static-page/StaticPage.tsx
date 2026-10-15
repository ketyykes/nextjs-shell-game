import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EscapeToTitle } from "./EscapeToTitle";

/**
 * 製作名單與真實世界橋接頁（設計文件 4.20）共用的外框：黑底、終端機字型、--game-* 配色，跟標題畫面同一套。
 *
 * 是 server component，內容在伺服器就排好，沒有 JavaScript 也讀得完；「返回標題」是一般連結，
 * Esc 回標題才需要 client 端的 `EscapeToTitle`。不疊 CRT 掃描線：這兩頁是拿來讀的。
 */

/** 內文連結：全息藍加底線，跟標題選單選取中的顏色一樣。 */
export const STATIC_LINK_CLASS =
	"text-game-holo underline underline-offset-4 hover:text-game-text focus-visible:outline-2 focus-visible:outline-game-holo";

export interface StaticPageProps {
	/** 頁面標題（h1）。 */
	title: string;
	/** 標題下面的一段引言。 */
	lead?: ReactNode;
	children: ReactNode;
}

function BackToTitleLink() {
	return (
		<p className="flex items-baseline gap-3">
			<Link href="/" className={STATIC_LINK_CLASS}>
				返回標題
			</Link>
			<span className="text-lg text-game-prompt">（或按 Esc）</span>
		</p>
	);
}

export function StaticPage({ title, lead, children }: StaticPageProps) {
	return (
		<main className="min-h-screen bg-black px-4 py-10 font-terminal text-xl leading-relaxed text-game-text sm:py-14 sm:text-2xl">
			<EscapeToTitle />
			<div className="mx-auto flex max-w-3xl flex-col gap-10">
				<header className="flex flex-col gap-4">
					<BackToTitleLink />
					<h1 className="font-title text-2xl leading-snug text-game-holo sm:text-3xl">{title}</h1>
					{lead}
				</header>
				{children}
				<footer className="border-t-2 border-game-dim pt-6">
					<BackToTitleLink />
				</footer>
			</div>
		</main>
	);
}

export interface StaticSectionProps {
	/** 給 aria-labelledby 用的 id，同一頁不能重複。 */
	id: string;
	title: string;
	children: ReactNode;
	className?: string;
}

/** 一節：h2 加內容，`section` 用標題當名稱，螢幕閱讀器的區域清單看得到。 */
export function StaticSection({ id, title, children, className }: StaticSectionProps) {
	return (
		<section aria-labelledby={id} className={cn("flex flex-col gap-4", className)}>
			<h2 id={id} className="text-2xl text-game-holo sm:text-3xl">
				{title}
			</h2>
			{children}
		</section>
	);
}
