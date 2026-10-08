import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NovaLogPanel } from "./NovaLogPanel";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("NovaLogPanel", () => {
	it("還沒有紀錄時顯示空狀態", () => {
		render(<NovaLogPanel entries={[]} />);
		expect(screen.getByText("NOVA 還沒在地圖上說過話")).toBeDefined();
		expect(screen.queryByRole("list")).toBeNull();
	});

	it("照紀錄順序列出台詞", () => {
		render(
			<NovaLogPanel
				entries={[
					{ id: "intro-1-0", text: "第一句", status: "shown" },
					{ id: "room-cryo-0", text: "第二句", status: "shown" },
				]}
			/>,
		);
		const items = within(screen.getByRole("list")).getAllByRole("listitem");
		expect(items.map((item) => item.textContent)).toEqual(["第一句", "第二句"]);
	});

	it("換艙區被略過的台詞標「未播出」，播完的不標", () => {
		render(
			<NovaLogPanel
				entries={[
					{ id: "room-cryo-0", text: "播完的", status: "shown" },
					{ id: "room-cryo-1", text: "沒播的", status: "missed" },
				]}
			/>,
		);
		const [shown, missed] = within(screen.getByRole("list")).getAllByRole("listitem");
		expect(within(shown).queryByText("未播出")).toBeNull();
		expect(within(missed).getByText("未播出")).toBeDefined();
	});

	it("說明紀錄的範圍", () => {
		render(<NovaLogPanel entries={[]} />);
		expect(screen.getByText("只記本章地圖上的台詞，重新整理後清空")).toBeDefined();
	});
});
