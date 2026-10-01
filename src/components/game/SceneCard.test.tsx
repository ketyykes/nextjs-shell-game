import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneCard } from "./SceneCard";

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

describe("SceneCard", () => {
	it("card 為 null 時不渲染任何東西", () => {
		const { container } = render(<SceneCard card={null} onShown={vi.fn()} />);
		expect(container.querySelector("[data-testid='scene-card']")).toBeNull();
	});

	it("顯示插圖、標題與副標", () => {
		render(
			<SceneCard
				card={{ id: "cryo", src: "/scenes/scene-cryo.png", title: "冷凍艙", subtitle: "Kepler-9" }}
				onShown={vi.fn()}
			/>,
		);
		expect(screen.getByText("冷凍艙")).toBeDefined();
		expect(screen.getByText("Kepler-9")).toBeDefined();
		expect(screen.getByRole("img", { name: "冷凍艙的插圖" })).toBeDefined();
		expect(document.querySelector("img")?.getAttribute("src")).toBe("/scenes/scene-cryo.png");
	});

	it("停留時間過後呼叫 onShown 並帶上 id", async () => {
		const onShown = vi.fn();
		render(<SceneCard card={{ id: "medbay", src: "/x.png", title: "醫療艙" }} holdMs={10} onShown={onShown} />);
		await waitFor(() => {
			expect(onShown).toHaveBeenCalledWith("medbay");
		});
		expect(onShown).toHaveBeenCalledTimes(1);
	});
});
