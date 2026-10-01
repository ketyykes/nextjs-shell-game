import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterSelect } from "./CharacterSelect";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
});

function press(key: string) {
	fireEvent.keyDown(window, { key });
}

describe("CharacterSelect", () => {
	it("顯示四個外觀代號與提示，不顯示背景故事", () => {
		render(<CharacterSelect onConfirm={vi.fn()} onBack={vi.fn()} />);
		for (const code of ["A", "C", "D", "E"]) {
			expect(screen.getByRole("button", { name: `外觀 ${code}` })).toBeDefined();
		}
		expect(screen.getByText("劇情不受外觀影響")).toBeDefined();
	});

	it("sprite 用站立幀的背景圖並放大四倍", () => {
		render(<CharacterSelect onConfirm={vi.fn()} onBack={vi.fn()} />);
		const sprite = screen.getByTestId("character-sprite-d");
		expect(sprite.style.backgroundImage).toContain("/sprites/technician-d.png");
		expect(sprite.style.width).toBe("128px");
		expect(sprite.style.height).toBe("192px");
		expect(sprite.style.backgroundSize).toBe("512px 768px");
	});

	it("預設選 a，Enter 確認得到 a", () => {
		const onConfirm = vi.fn();
		render(<CharacterSelect onConfirm={onConfirm} onBack={vi.fn()} />);
		expect(screen.getByRole("button", { name: "外觀 A" }).getAttribute("aria-pressed")).toBe("true");
		press("Enter");
		expect(onConfirm).toHaveBeenCalledWith("a");
	});

	it("→ 兩次再 Enter 得到 d", () => {
		const onConfirm = vi.fn();
		render(<CharacterSelect onConfirm={onConfirm} onBack={vi.fn()} />);
		press("ArrowRight");
		press("ArrowRight");
		press("Enter");
		expect(onConfirm).toHaveBeenCalledWith("d");
	});

	it("initial 指定初始外觀", () => {
		const onConfirm = vi.fn();
		render(<CharacterSelect initial="c" onConfirm={onConfirm} onBack={vi.fn()} />);
		press("Enter");
		expect(onConfirm).toHaveBeenCalledWith("c");
	});

	it("Esc 呼叫 onBack", () => {
		const onBack = vi.fn();
		render(<CharacterSelect onConfirm={vi.fn()} onBack={onBack} />);
		press("Escape");
		expect(onBack).toHaveBeenCalledTimes(1);
	});

	it("點 e 只選取不確認，再 Enter 得到 e", () => {
		const onConfirm = vi.fn();
		render(<CharacterSelect onConfirm={onConfirm} onBack={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "外觀 E" }));
		expect(onConfirm).not.toHaveBeenCalled();
		press("Enter");
		expect(onConfirm).toHaveBeenCalledWith("e");
	});

	it("點已選取的外觀直接確認", () => {
		const onConfirm = vi.fn();
		render(<CharacterSelect onConfirm={onConfirm} onBack={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "外觀 A" }));
		expect(onConfirm).toHaveBeenCalledWith("a");
	});
});
