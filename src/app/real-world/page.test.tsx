import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chapterLabel } from "@/game/chapters/meta";
import { CHAPTER_COMMANDS } from "./chapterCommands";
import RealWorldPage, { metadata } from "./page";

// Esc 回標題用到 useRouter，測試環境沒有 App Router context，用假的頂替
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn() }),
}));

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

/** 標題為 name 的那一節的文字。 */
function sectionText(name: string): string {
	return screen.getByRole("region", { name }).textContent ?? "";
}

describe("RealWorldPage（設計文件 4.20）", () => {
	it("頁面標題是「下一步：真的終端機」，有「返回標題」連到 /", () => {
		render(<RealWorldPage />);

		expect(screen.getByRole("heading", { level: 1, name: "下一步：真的終端機" })).toBeDefined();
		for (const link of screen.getAllByRole("link", { name: "返回標題" })) {
			expect(link.getAttribute("href")).toBe("/");
		}
		expect(metadata.title).toBe("Kepler-9 — 下一步：真的終端機");
	});

	it("怎麼打開終端機：macOS、Windows（WSL）、Linux 各一段", () => {
		render(<RealWorldPage />);
		const text = sectionText("打開終端機");
		for (const keyword of ["macOS", "「終端機」", "iTerm2", "zsh", "wsl --install", "Windows Terminal", "PowerShell", "命令提示字元", "Linux", "Ctrl+Alt+T"]) {
			expect(text, keyword).toContain(keyword);
		}
	});

	it("差異表：遊戲專用的求助指令、rm 沒有回收桶、sudo 與 kill 是真的、export 只在這個視窗有效", () => {
		render(<RealWorldPage />);
		const table = within(screen.getByRole("region", { name: "跟遊戲不一樣的地方" })).getByRole("table");
		const text = table.textContent ?? "";
		for (const keyword of ["hint", "help", "explain", "man", "--help", "tldr", "rm", "回收桶", "sudo", "kill", "export", "~/.zshrc"]) {
			expect(text, keyword).toContain(keyword);
		}
	});

	it("英文錯誤訊息逐條對照", () => {
		render(<RealWorldPage />);
		const text = sectionText("英文錯誤訊息");
		for (const message of [
			"No such file or directory",
			"Permission denied",
			"command not found",
			"Is a directory",
			"Not a directory",
		]) {
			expect(text, message).toContain(message);
		}
	});

	it("真的 shell 多出來的按鍵：Ctrl+C、D、L、A、E、R", () => {
		render(<RealWorldPage />);
		const text = sectionText("真的 shell 多出來的按鍵");
		for (const key of ["Ctrl+C", "Ctrl+D", "Ctrl+L", "Ctrl+A", "Ctrl+E", "Ctrl+R"]) {
			expect(text, key).toContain(key);
		}
	});

	it("六章學過的指令逐章列出，每一項都在", () => {
		render(<RealWorldPage />);
		const section = screen.getByRole("region", { name: "六章學過的，真的系統都有" });
		for (const entry of CHAPTER_COMMANDS) {
			const group = within(section).getByRole("group", { name: chapterLabel(entry.chapter) });
			const items = within(group)
				.getAllByRole("listitem")
				.map((item) => item.textContent);
			expect(items).toEqual([...entry.items]);
		}
	});

	it("macOS 的小差異：ls -l 的日期、sed -i ''、top 按 q 離開、grep -r 一樣", () => {
		render(<RealWorldPage />);
		const text = sectionText("macOS 的小差異");
		for (const keyword of ["ls -l", "sed -i ''", "top", "q", "grep -r"]) {
			expect(text, keyword).toContain(keyword);
		}
	});

	it("接下來可以學什麼：man 怎麼讀、管線、~/.zshrc 與別名、檔案權限、ssh", () => {
		render(<RealWorldPage />);
		const text = sectionText("接下來可以學什麼");
		for (const keyword of ["man", "|", "~/.zshrc", "alias", "chmod", "ssh"]) {
			expect(text, keyword).toContain(keyword);
		}
	});
});
