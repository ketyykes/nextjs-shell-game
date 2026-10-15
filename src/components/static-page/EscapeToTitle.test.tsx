import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EscapeToTitle } from "./EscapeToTitle";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

// next/navigation 的 useRouter 在測試環境沒有 App Router context，用假的頂替
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

beforeEach(() => {
	push.mockClear();
});

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

describe("EscapeToTitle", () => {
	it("按 Esc 回標題", () => {
		render(<EscapeToTitle />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(push).toHaveBeenCalledTimes(1);
		expect(push).toHaveBeenCalledWith("/");
	});

	it("其他鍵、長按的連發都不動", () => {
		render(<EscapeToTitle />);
		fireEvent.keyDown(window, { key: "Enter" });
		fireEvent.keyDown(window, { key: "q" });
		fireEvent.keyDown(window, { key: "Escape", repeat: true });
		expect(push).not.toHaveBeenCalled();
	});

	it("卸載後不再監聽", () => {
		const { unmount } = render(<EscapeToTitle />);
		unmount();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(push).not.toHaveBeenCalled();
	});
});
