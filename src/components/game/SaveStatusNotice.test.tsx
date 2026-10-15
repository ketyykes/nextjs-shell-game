import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSaveIssue } from "@/game/store/saveStatus";
import { reloadPage } from "./reloadPage";
import { SaveStatusNotice } from "./SaveStatusNotice";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
	usePathname: () => pathname.current,
}));

// jsdom 的 window.location.reload 不能被替換，整個模組換成 spy
vi.mock("./reloadPage", () => ({ reloadPage: vi.fn() }));

beforeEach(() => {
	setSaveIssue(null);
	pathname.current = "/";
	vi.mocked(reloadPage).mockClear();
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("SaveStatusNotice", () => {
	it("存檔正常時不渲染", () => {
		const { container } = render(<SaveStatusNotice />);
		expect(container.firstChild).toBeNull();
	});

	it("寫入失敗時用 alert 顯示繁中提示，寫入恢復後消失", () => {
		render(<SaveStatusNotice />);

		act(() => {
			setSaveIssue("write-failed");
		});
		expect(screen.getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("存檔失敗"));

		act(() => {
			setSaveIssue(null);
		});
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("存檔版本比程式新時，說明這次不讀也不寫", () => {
		setSaveIssue("newer-version");
		render(<SaveStatusNotice />);

		const text = screen.getByRole("alert").textContent ?? "";
		expect(text).toContain("較新版本");
		expect(text).toContain("不讀取也不寫入");
	});

	it("整個儲存空間不能用時，說明這次的進度不會存檔", () => {
		setSaveIssue("unavailable");
		render(<SaveStatusNotice />);

		expect(screen.getByRole("alert").textContent).toContain("不會存檔");
	});

	it("另一個分頁改了存檔：說明這個分頁已停止存檔，按「重新載入」整頁重新載入接續最新進度", () => {
		setSaveIssue("other-tab");
		render(<SaveStatusNotice />);

		const text = screen.getByRole("alert").textContent ?? "";
		expect(text).toContain("另一個分頁改了存檔");
		expect(text).toContain("已停止存檔");
		expect(text).toContain("最新進度");

		fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
		expect(reloadPage).toHaveBeenCalledTimes(1);
	});

	it("提示本身不擋地圖的點擊，只有「重新載入」按鈕接得到滑鼠", () => {
		setSaveIssue("other-tab");
		render(<SaveStatusNotice />);

		expect(screen.getByRole("alert").className).toContain("pointer-events-none");
		expect(screen.getByRole("button", { name: "重新載入" }).className).toContain("pointer-events-auto");
	});

	it.each(["write-failed", "newer-version", "unavailable"] as const)("%s 的提示重新載入也沒用，不放「重新載入」按鈕", (issue) => {
		setSaveIssue(issue);
		render(<SaveStatusNotice />);

		expect(screen.queryByRole("button", { name: "重新載入" })).toBeNull();
	});

	it("練習模式本來就不存檔，另一個分頁改了存檔也不在練習模式提示", () => {
		pathname.current = "/sandbox";
		setSaveIssue("other-tab");
		const { container } = render(<SaveStatusNotice />);

		expect(container.firstChild).toBeNull();
	});

	it("練習模式本來就不存檔，不顯示存檔提示", () => {
		pathname.current = "/sandbox";
		setSaveIssue("write-failed");
		const { container } = render(<SaveStatusNotice />);

		expect(container.firstChild).toBeNull();
	});

	it("擺在上方 HUD 那一排（O2、操作提示、艙區名）與 O2 下方除役倒數的下面，不蓋住它們", () => {
		setSaveIssue("write-failed");
		render(<SaveStatusNotice />);

		// 除役倒數在 top-12（48 到 80 px），提示從 96 px 開始；實際排版由 e2e 的 save-v2 量
		const className = screen.getByRole("alert").className;
		expect(className).toContain("top-24");
		expect(className).not.toContain("top-16");
		expect(className).not.toContain("top-4");
	});
});
