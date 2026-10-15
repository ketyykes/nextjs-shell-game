import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARGO_BANNER } from "@/game/story/argo";
import { ArgoScreen, type ArgoScreenProps } from "./ArgoScreen";

// vitest 沒開 globals，Testing Library 不會自動 cleanup
afterEach(cleanup);

const EXIT_MESSAGE = "斷線回標題？在這台終端機做的變更不會保留。";

function renderArgo(overrides: Partial<ArgoScreenProps> = {}) {
	const props: ArgoScreenProps = {
		onExit: vi.fn(),
		textSpeed: "instant",
		progress: { found: [], reply: null },
		...overrides,
	};
	render(<ArgoScreen {...props} />);
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

describe("ArgoScreen", () => {
	it("一進來就是救援船的終端機：標題、歡迎行，焦點在輸入框，沒有 NOVA 的對話框", () => {
		renderArgo();
		expect(screen.getByRole("heading", { name: "救援船 ARGO" })).toBeDefined();
		expect(getLog().textContent).toContain(ARGO_BANNER[0]);
		expect(document.activeElement).toBe(getInput());
		expect(screen.queryByText("NOVA")).toBeNull();
	});

	it("提示符是 tech@argo，ps 看得到 nova 在還原上傳", () => {
		renderArgo();
		runCommand("ps");
		expect(getLog().textContent).toContain("tech@argo:~$");
		expect(getLog().textContent).toContain("nova --restore /mnt/upload/kepler9/core.part");
	});

	it("上傳的 abin/ 只有存檔裡找到的留言", () => {
		renderArgo({ progress: { found: ["ch1-jokes"], reply: null } });
		runCommand("ls /mnt/upload/kepler9/abin");
		expect(getLog().textContent).toContain("20280418-1005.txt");
		expect(getLog().textContent).not.toContain("reply.txt");
	});

	it("Esc 先問要不要斷線回標題，預設選「取消」，Enter 回到終端機", () => {
		const props = renderArgo();
		fireEvent.keyDown(getInput(), { key: "Escape" });
		expect(screen.getByText(EXIT_MESSAGE)).toBeDefined();

		fireEvent.keyDown(window, { key: "Enter" });
		expect(screen.queryByTestId("confirm-panel")).toBeNull();
		expect(props.onExit).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(getInput());
	});

	it("確認面板選「回標題」才呼叫 onExit；點「[Esc] 關閉」也會先確認", () => {
		const props = renderArgo();
		fireEvent.click(screen.getByRole("button", { name: "關閉終端機" }));
		expect(props.onExit).not.toHaveBeenCalled();
		fireEvent.keyDown(window, { key: "ArrowLeft" });
		fireEvent.keyDown(window, { key: "Enter" });
		expect(props.onExit).toHaveBeenCalledTimes(1);
	});
});
