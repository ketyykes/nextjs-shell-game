import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_STORAGE_KEY, SAVE_VERSION } from "@/game/store/types";
import SandboxPage from "./page";

const push = vi.fn();

// next/navigation 的 useRouter 在測試環境沒有 App Router context，用假的頂替
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

beforeEach(() => {
	localStorage.clear();
	push.mockClear();
});

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function runCommand(text: string): void {
	const input = screen.getByLabelText("指令輸入");
	fireEvent.change(input, { target: { value: text } });
	fireEvent.keyDown(input, { key: "Enter" });
}

describe("SandboxPage", () => {
	it("讀檔完成後顯示練習終端機，打指令與重置都不寫 localStorage", async () => {
		const existingSave = JSON.stringify({ state: { progress: { chapter: 3 } }, version: SAVE_VERSION });
		localStorage.setItem(SAVE_STORAGE_KEY, existingSave);
		const setItem = vi.spyOn(Storage.prototype, "setItem");

		render(<SandboxPage />);
		await waitFor(() => {
			expect(screen.getByLabelText("指令輸入")).toBeDefined();
		});

		runCommand("mkdir scratch");
		runCommand("rm -r logs");
		fireEvent.keyDown(window, { key: "®", code: "KeyR", altKey: true });
		runCommand("ls");

		expect(setItem).not.toHaveBeenCalled();
		expect(localStorage.getItem(SAVE_STORAGE_KEY)).toBe(existingSave);
	});

	it("確認離開後導回標題", async () => {
		render(<SandboxPage />);
		await waitFor(() => {
			expect(screen.getByLabelText("指令輸入")).toBeDefined();
		});
		fireEvent.keyDown(screen.getByLabelText("指令輸入"), { key: "Escape" });
		fireEvent.click(screen.getByRole("button", { name: "回標題" }));
		expect(push).toHaveBeenCalledWith("/");
	});
});
