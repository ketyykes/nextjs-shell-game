import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setSaveIssue } from "@/game/store/saveStatus";
import { SaveStatusNotice } from "./SaveStatusNotice";

beforeEach(() => {
	setSaveIssue(null);
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
});
