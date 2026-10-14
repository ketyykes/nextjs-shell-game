import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSaveIssue } from "@/game/store/saveStatus";
import { SaveStatusNotice } from "./SaveStatusNotice";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
	usePathname: () => pathname.current,
}));

beforeEach(() => {
	setSaveIssue(null);
	pathname.current = "/";
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
