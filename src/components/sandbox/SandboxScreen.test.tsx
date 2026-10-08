import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SANDBOX_BANNER } from "@/game/sandbox/practice";
import { SandboxScreen, type SandboxScreenProps } from "./SandboxScreen";

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

function renderSandbox(overrides: Partial<SandboxScreenProps> = {}) {
	const props: SandboxScreenProps = {
		onExit: vi.fn(),
		textSpeed: "instant",
		...overrides,
	};
	render(<SandboxScreen {...props} />);
	return props;
}

function getInput(): HTMLInputElement {
	return screen.getByLabelText("指令輸入") as HTMLInputElement;
}

function getLog(): HTMLElement {
	return screen.getByRole("log");
}

function runCommand(text: string): void {
	fireEvent.change(getInput(), { target: { value: text } });
	fireEvent.keyDown(getInput(), { key: "Enter" });
}

/** Alt+R：Mac 的 Option+R 的 key 是「®」，只能靠 code 認。 */
function pressReset(target: Window | Element = getInput()): void {
	fireEvent.keyDown(target, { key: "®", code: "KeyR", altKey: true });
}

describe("SandboxScreen", () => {
	it("一進來就是終端機，輸出區最上面是歡迎行，畫面標明練習模式", () => {
		renderSandbox();
		expect(screen.getByRole("heading", { name: "練習模式" })).toBeDefined();
		expect(getLog().textContent).toContain(SANDBOX_BANNER[0]);
		expect(document.activeElement).toBe(getInput());
	});

	it("可以直接打指令，所有指令都開放", () => {
		renderSandbox();
		runCommand("help");
		expect(getLog().textContent).toContain("kill");
		runCommand("hint");
		expect(getLog().textContent).toContain("練習建議 1/");
	});

	it("Alt+R 把檔案系統、工作目錄與輸出區還原成剛進來的樣子", () => {
		renderSandbox();
		runCommand("mkdir my_scratch");
		runCommand("cd logs");
		expect(getLog().textContent).toContain("mkdir my_scratch");

		pressReset();

		expect(getLog().textContent).not.toContain("mkdir my_scratch");
		expect(getLog().textContent).toContain("練習環境已重置");
		expect(getLog().textContent).toContain(SANDBOX_BANNER[0]);
		runCommand("ls");
		expect(getLog().textContent).not.toContain("my_scratch");
		expect(getLog().textContent).toContain("crew@kepler9:~$");
		expect(getInput().value).toBe("");
	});

	it("Alt+R 擋掉預設行為，Mac 的 Option+R 不會在輸入框打出 ®", () => {
		renderSandbox();
		fireEvent.change(getInput(), { target: { value: "ls" } });
		const event = new KeyboardEvent("keydown", { key: "®", code: "KeyR", altKey: true, bubbles: true, cancelable: true });
		getInput().dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});

	it("點「重置」按鈕也會還原", () => {
		renderSandbox();
		runCommand("rm README.txt");
		fireEvent.click(screen.getByRole("button", { name: /重置/ }));
		runCommand("ls");
		expect(getLog().textContent).toContain("README.txt");
		expect(getLog().textContent).not.toContain("rm README.txt");
	});

	it("Esc 先問要不要回標題，預設選「取消」，Esc 或取消就回到終端機", () => {
		const props = renderSandbox();
		fireEvent.keyDown(getInput(), { key: "Escape" });
		expect(screen.getByText("離開練習模式，回到標題畫面？練習的內容不會保留。")).toBeDefined();

		// 確認面板預設選「取消」：Enter 不會離開
		fireEvent.keyDown(window, { key: "Enter" });
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onExit).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(getInput());

		fireEvent.keyDown(getInput(), { key: "Escape" });
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onExit).not.toHaveBeenCalled();
	});

	it("確認面板選「回標題」才呼叫 onExit", () => {
		const props = renderSandbox();
		fireEvent.keyDown(getInput(), { key: "Escape" });
		fireEvent.keyDown(window, { key: "ArrowLeft" });
		fireEvent.keyDown(window, { key: "Enter" });
		expect(props.onExit).toHaveBeenCalledTimes(1);
	});

	it("點終端機標題列的「[Esc] 關閉」也會先確認", () => {
		const props = renderSandbox();
		fireEvent.click(screen.getByRole("button", { name: "關閉終端機" }));
		fireEvent.click(screen.getByRole("button", { name: "回標題" }));
		expect(props.onExit).toHaveBeenCalledTimes(1);
	});

	it("確認面板開著時 Alt+R 不重置", () => {
		renderSandbox();
		runCommand("mkdir my_scratch");
		fireEvent.keyDown(getInput(), { key: "Escape" });
		pressReset(window);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(getLog().textContent).toContain("mkdir my_scratch");
	});

	it("Apple 鍵盤把快捷鍵顯示成 ⌥R", () => {
		renderSandbox({ appleKeyboard: true });
		expect(screen.getByRole("button", { name: /重置/ }).textContent).toContain("⌥R");
		cleanup();
		renderSandbox({ appleKeyboard: false });
		expect(screen.getByRole("button", { name: /重置/ }).textContent).toContain("Alt+R");
	});
});
