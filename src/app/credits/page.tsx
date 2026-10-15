import type { Metadata } from "next";
import { STATIC_LINK_CLASS, StaticPage, StaticSection } from "@/components/static-page/StaticPage";

export const metadata: Metadata = {
	title: "Kepler-9 — 製作名單",
	description: "Kepler-9 用到的引擎、框架、圖塊、音效與字型，以及各自的授權。",
};

/** 引擎與框架：名稱、在遊戲裡負責什麼，授權都是 MIT（版本不列）。 */
const ENGINES: readonly { name: string; role: string }[] = [
	{ name: "Phaser", role: "地圖、角色移動、燈光與音效" },
	{ name: "Next.js、React", role: "網頁、標題選單與終端機畫面" },
	{ name: "zustand", role: "遊戲狀態與存檔" },
	{ name: "zod", role: "劇本與匯入存檔的格式檢查" },
	{ name: "motion", role: "選單與面板的動畫" },
	{ name: "Tailwind CSS", role: "畫面樣式" },
];

/** OFL 字型：著作權聲明照各字型官方授權檔的第一行抄（OFL 第 2 條要求散佈時附上）。 */
const OFL_FONTS: readonly { name: string; author: string; usage: string; copyright: string; href: string }[] = [
	{
		name: "Fusion Pixel Font",
		author: "TakWolf",
		usage: "所有中文字（12px 比例版，只留遊戲用到的字）",
		copyright: "Copyright (c) 2022, TakWolf (https://takwolf.com).",
		href: "https://github.com/TakWolf/fusion-pixel-font",
	},
	{
		name: "VT323",
		author: "Peter Hull",
		usage: "終端機與內文的英文、數字",
		copyright: "Copyright 2011, The VT323 Project Authors (peter.hull@oikoi.com)",
		href: "https://fonts.google.com/specimen/VT323",
	},
	{
		name: "Press Start 2P",
		author: "CodeMan38",
		usage: "標題與章節名",
		copyright:
			'Copyright 2012 The Press Start 2P Project Authors (cody@zone38.net), with Reserved Font Name "Press Start 2P".',
		href: "https://fonts.google.com/specimen/Press+Start+2P",
	},
];

/** 授權標記，例如「MIT」「CC0」。 */
function LicenseTag({ children }: { children: string }) {
	return <span className="whitespace-nowrap border border-game-dim px-2 text-lg text-game-success">{children}</span>;
}

/**
 * 製作名單（設計文件 4.20、審計 A53）：列出第三方素材與授權，授權全文放在 public/licenses 隨網站散佈。
 * 靜態頁，不讀存檔；標題選單的最後一項「製作名單」進來，「返回標題」或 Esc 回去。
 */
export default function CreditsPage() {
	return (
		<StaticPage title="製作名單" lead={<p className="text-game-prompt">Kepler-9 用到的程式、素材與授權。</p>}>
			<StaticSection id="credits-game" title="遊戲">
				<p>《Kepler-9》的劇本、謎題、虛擬 shell 與畫面配置都是自製的，文字是繁體中文。</p>
			</StaticSection>

			<StaticSection id="credits-engines" title="引擎與框架">
				<ul className="flex flex-col gap-2">
					{ENGINES.map((engine) => (
						<li key={engine.name} className="flex flex-wrap items-baseline gap-x-3">
							<span className="text-game-text">{engine.name}</span>
							<span className="text-game-prompt">{engine.role}</span>
							<LicenseTag>MIT</LicenseTag>
						</li>
					))}
				</ul>
			</StaticSection>

			<StaticSection id="credits-tiles" title="地圖圖塊">
				<p className="flex flex-wrap items-baseline gap-x-3">
					<span>
						<a href="https://opengameart.org/content/sci-fi-interior-tiles" className={STATIC_LINK_CLASS}>
							Sci-fi Interior tiles
						</a>
						，作者 Buch（OpenGameArt）
					</span>
					<LicenseTag>CC0</LicenseTag>
				</p>
				<p className="text-game-prompt">太空站的地板、牆、門、控制台與家具都出自這套圖塊。</p>
			</StaticSection>

			<StaticSection id="credits-sounds" title="音效">
				<p className="flex flex-wrap items-baseline gap-x-3">
					<span>
						Kenney 的{" "}
						<a href="https://kenney.nl/assets/sci-fi-sounds" className={STATIC_LINK_CLASS}>
							Sci-fi Sounds
						</a>{" "}
						與{" "}
						<a href="https://kenney.nl/assets/interface-sounds" className={STATIC_LINK_CLASS}>
							Interface Sounds
						</a>
					</span>
					<LicenseTag>CC0</LicenseTag>
				</p>
				<p>
					<a href="/licenses/LICENSE-kenney.txt" className={STATIC_LINK_CLASS}>
						Kenney 的授權說明
					</a>
				</p>
			</StaticSection>

			<StaticSection id="credits-fonts" title="字型">
				<ul className="flex flex-col gap-5">
					{OFL_FONTS.map((font) => (
						<li key={font.name} className="flex flex-col gap-1">
							<p className="flex flex-wrap items-baseline gap-x-3">
								<a href={font.href} className={STATIC_LINK_CLASS}>
									{font.name}
								</a>
								<span>（{font.author}）</span>
								<LicenseTag>OFL-1.1</LicenseTag>
							</p>
							<p className="text-game-prompt">{font.usage}</p>
							<p className="break-words text-lg text-game-prompt">{font.copyright}</p>
						</li>
					))}
				</ul>
				<p>三種字型都經 next/font 跟網站放在一起，瀏覽器不會另外連到字型服務。</p>
				<ul className="flex flex-col gap-1">
					<li>
						<a href="/licenses/LICENSE-fusion-pixel.txt" className={STATIC_LINK_CLASS}>
							Fusion Pixel Font 的授權全文
						</a>
					</li>
					<li>
						<a href="/licenses/OFL-1.1.txt" className={STATIC_LINK_CLASS}>
							SIL Open Font License 1.1 全文
						</a>
						<span className="text-game-prompt">（VT323、Press Start 2P）</span>
					</li>
				</ul>
			</StaticSection>

			<StaticSection id="credits-art" title="插圖與角色">
				<p>
					各章的場景插圖、NOVA 的立繪與四位技師的角色 sprite，是用 OpenAI codex 的 image_generation
					產生，再自行修整、重切對齊的自產素材。
				</p>
			</StaticSection>
		</StaticPage>
	);
}
