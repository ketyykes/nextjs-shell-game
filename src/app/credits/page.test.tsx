import { existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreditsPage, { metadata } from "./page";

// Esc 回標題用到 useRouter，測試環境沒有 App Router context，用假的頂替
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn() }),
}));

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

/** 標題為 name 的那一節。 */
function section(name: string): HTMLElement {
	return screen.getByRole("region", { name });
}

describe("CreditsPage（設計文件 4.20、審計 A53）", () => {
	it("頁面標題是製作名單，上下都有「返回標題」連到 /", () => {
		render(<CreditsPage />);

		expect(screen.getByRole("heading", { level: 1, name: "製作名單" })).toBeDefined();
		const backLinks = screen.getAllByRole("link", { name: "返回標題" });
		expect(backLinks.length).toBeGreaterThanOrEqual(1);
		for (const link of backLinks) {
			expect(link.getAttribute("href")).toBe("/");
		}
		expect(metadata.title).toBe("Kepler-9 — 製作名單");
	});

	it("遊戲本身是自製、繁體中文", () => {
		render(<CreditsPage />);
		const game = section("遊戲");
		expect(game.textContent).toContain("自製");
		expect(game.textContent).toContain("繁體中文");
	});

	it("引擎與框架列出 Phaser、Next.js、React、zustand、zod、motion，都是 MIT", () => {
		render(<CreditsPage />);
		const engines = section("引擎與框架");
		for (const name of ["Phaser", "Next.js", "React", "zustand", "zod", "motion"]) {
			expect(engines.textContent).toContain(name);
		}
		expect(engines.textContent).toContain("MIT");
	});

	it("圖塊：Buch 的 Sci-fi Interior tiles，CC0，連到 OpenGameArt", () => {
		render(<CreditsPage />);
		const tiles = section("地圖圖塊");
		expect(tiles.textContent).toContain("Buch");
		expect(tiles.textContent).toContain("CC0");
		expect(within(tiles).getByRole("link", { name: "Sci-fi Interior tiles" }).getAttribute("href")).toBe(
			"https://opengameart.org/content/sci-fi-interior-tiles",
		);
	});

	it("音效：Kenney 的 Sci-fi Sounds 與 Interface Sounds，CC0，附授權檔", () => {
		render(<CreditsPage />);
		const sounds = section("音效");
		expect(within(sounds).getByRole("link", { name: "Sci-fi Sounds" }).getAttribute("href")).toBe(
			"https://kenney.nl/assets/sci-fi-sounds",
		);
		expect(within(sounds).getByRole("link", { name: "Interface Sounds" }).getAttribute("href")).toBe(
			"https://kenney.nl/assets/interface-sounds",
		);
		expect(sounds.textContent).toContain("CC0");
		expect(within(sounds).getByRole("link", { name: /授權/ }).getAttribute("href")).toBe("/licenses/LICENSE-kenney.txt");
	});

	it("字型：Fusion Pixel（TakWolf）、VT323（Peter Hull）、Press Start 2P（CodeMan38），OFL-1.1，附授權全文與著作權聲明", () => {
		render(<CreditsPage />);
		const fonts = section("字型");
		expect(fonts.textContent).toContain("Fusion Pixel Font");
		expect(fonts.textContent).toContain("TakWolf");
		expect(fonts.textContent).toContain("VT323");
		expect(fonts.textContent).toContain("Peter Hull");
		expect(fonts.textContent).toContain("Press Start 2P");
		expect(fonts.textContent).toContain("CodeMan38");
		expect(fonts.textContent).toContain("OFL-1.1");
		// OFL 第 2 條：散佈時要附著作權聲明與授權全文
		expect(fonts.textContent).toContain("Copyright 2011, The VT323 Project Authors");
		expect(fonts.textContent).toContain("Copyright 2012 The Press Start 2P Project Authors");
		const hrefs = within(fonts)
			.getAllByRole("link")
			.map((link) => link.getAttribute("href"));
		expect(hrefs).toContain("/licenses/LICENSE-fusion-pixel.txt");
		expect(hrefs).toContain("/licenses/OFL-1.1.txt");
	});

	it("插圖、NOVA 立繪與角色 sprite 是用 codex 產生後自行修整的自產素材", () => {
		render(<CreditsPage />);
		const art = section("插圖與角色");
		expect(art.textContent).toContain("NOVA");
		expect(art.textContent).toContain("sprite");
		expect(art.textContent).toContain("codex");
		expect(art.textContent).toContain("自產");
	});

	it("頁面上連到 /licenses/ 的檔案都真的在 public/licenses 裡", () => {
		render(<CreditsPage />);
		const licenseHrefs = screen
			.getAllByRole("link")
			.map((link) => link.getAttribute("href") ?? "")
			.filter((href) => href.startsWith("/licenses/"));
		expect(licenseHrefs.length).toBeGreaterThanOrEqual(3);
		for (const href of licenseHrefs) {
			expect(existsSync(path.join(process.cwd(), "public", href)), href).toBe(true);
		}
	});
});
