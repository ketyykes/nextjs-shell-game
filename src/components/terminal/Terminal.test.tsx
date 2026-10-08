import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestFs } from "@/game/shell/commands/testFixtures";
import { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import type { OutputEntry, TextSpeed } from "@/game/store/types";
import { Terminal } from "./Terminal";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

function createShell(): Shell {
	return new Shell({
		fs: createTestFs(),
		terminalId: "ch1-t1",
		hints: ["a", "b", "c"],
		learnedCommands: ["pwd", "ls"],
	});
}

interface HarnessProps {
	shell?: Shell;
	initialEntries?: OutputEntry[];
	learnedCommands?: string[];
	textSpeed?: TextSpeed;
	solved?: boolean;
	onEntriesChange?: (next: OutputEntry[]) => void;
	onExecuted?: (execution: ShellExecution) => void;
	onClose?: () => void;
}

/** 模擬父層：持有 entries state，並把每次變更轉給 spy。 */
function Harness({
	shell: providedShell,
	initialEntries = [],
	learnedCommands = ["pwd", "ls"],
	textSpeed = "instant",
	solved,
	onEntriesChange,
	onExecuted,
	onClose = () => {},
}: HarnessProps) {
	// shell 實例必須跨 render 保持同一個，否則 cwd 與歷史每次都會重置
	const [shell] = useState(() => providedShell ?? createShell());
	const [entries, setEntries] = useState<OutputEntry[]>(initialEntries);
	return (
		<Terminal
			title="冷凍艙控制台"
			shell={shell}
			entries={entries}
			onEntriesChange={(next) => {
				onEntriesChange?.(next);
				setEntries(next);
			}}
			onExecuted={onExecuted}
			onClose={onClose}
			learnedCommands={learnedCommands}
			textSpeed={textSpeed}
			solved={solved}
		/>
	);
}

function getInput(): HTMLInputElement {
	return screen.getByLabelText("指令輸入") as HTMLInputElement;
}

function getLog(): HTMLElement {
	return screen.getByRole("log");
}

function typeText(text: string): void {
	fireEvent.change(getInput(), { target: { value: text } });
}

function pressKey(key: string, init: Partial<KeyboardEventInit> = {}): void {
	fireEvent.keyDown(getInput(), { key, ...init });
}

function runCommand(text: string): void {
	typeText(text);
	pressKey("Enter");
}

describe("Terminal", () => {
	it("掛載時輸入框自動取得焦點", () => {
		render(<Harness />);
		expect(document.activeElement).toBe(getInput());
	});

	it("輸入 ls 按 Enter 會出現檔案列表與執行當下的提示符", () => {
		render(<Harness />);
		runCommand("ls");

		const log = getLog();
		expect(within(log).getByText(/wake_up\.txt/)).toBeDefined();
		expect(within(log).getByText("crew@kepler9:~$")).toBeDefined();
		expect(getInput().value).toBe("");
	});

	it("cat 不存在的檔案時，錯誤輸出行用琥珀色", () => {
		render(<Harness />);
		runCommand("cat nope");

		const errorLine = within(getLog()).getByText(/nope/, { selector: "div.text-game-amber" });
		expect(errorLine.className).toContain("text-game-amber");
	});

	it("cd 之後的下一筆指令使用新的提示符，輸入列也跟著換", () => {
		render(<Harness />);
		runCommand("cd pod_06");
		runCommand("pwd");

		const prompts = within(getLog()).getAllByText(/^crew@kepler9:/);
		expect(prompts.map((prompt) => prompt.textContent)).toEqual([
			"crew@kepler9:~$",
			"crew@kepler9:~/pod_06$",
		]);
		expect(screen.getAllByText("crew@kepler9:~/pod_06$")).toHaveLength(2);
	});

	it("輸入 cat wa 按 Tab 會補全成 cat wake_up.txt", () => {
		render(<Harness />);
		typeText("cat wa");
		pressKey("Tab");

		expect(getInput().value).toBe("cat wake_up.txt ");
	});

	it("輸入 h 按 Tab 會列出多個候選的系統訊息", () => {
		const onEntriesChange = vi.fn();
		render(<Harness onEntriesChange={onEntriesChange} />);
		typeText("h");
		pressKey("Tab");

		const systemBlock = getLog().querySelector('[data-entry-kind="system"]');
		expect(systemBlock).not.toBeNull();
		const text = systemBlock?.textContent ?? "";
		expect(text).toContain("help");
		expect(text).toContain("hint");
		expect(text).toContain("history");
		expect(onEntriesChange).toHaveBeenCalledTimes(1);
	});

	it("只有一個候選時不會多出系統訊息", () => {
		const onEntriesChange = vi.fn();
		render(<Harness onEntriesChange={onEntriesChange} />);
		typeText("cat wa");
		pressKey("Tab");

		expect(onEntriesChange).not.toHaveBeenCalled();
	});

	it("↑ 叫回較舊的指令，↓ 往較新的走", () => {
		render(<Harness />);
		runCommand("pwd");
		runCommand("ls");

		pressKey("ArrowUp");
		expect(getInput().value).toBe("ls");
		pressKey("ArrowUp");
		expect(getInput().value).toBe("pwd");
		pressKey("ArrowDown");
		expect(getInput().value).toBe("ls");
	});

	it("沒有歷史時按 ↑ 不改變輸入", () => {
		render(<Harness />);
		typeText("cat");
		pressKey("ArrowUp");

		expect(getInput().value).toBe("cat");
	});

	it("按 Esc 會呼叫 onClose 一次", () => {
		const onClose = vi.fn();
		render(<Harness onClose={onClose} />);
		pressKey("Escape");

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("按 Esc 關閉時不把 keydown 往 window 傳，地圖的暫停監聽不會跟著觸發", () => {
		const onClose = vi.fn();
		const windowKeyDown = vi.fn();
		window.addEventListener("keydown", windowKeyDown);
		try {
			render(<Harness onClose={onClose} />);
			pressKey("Escape");

			expect(onClose).toHaveBeenCalledTimes(1);
			expect(windowKeyDown).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener("keydown", windowKeyDown);
		}
	});

	it("點「[Esc] 關閉」按鈕會呼叫 onClose 一次", () => {
		const onClose = vi.fn();
		render(<Harness onClose={onClose} />);
		fireEvent.click(screen.getByRole("button", { name: "關閉終端機" }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("button", { name: "關閉終端機" }).textContent).toBe("[Esc] 關閉");
	});

	it("輸入 clear 會把輸出區清空", () => {
		const onEntriesChange = vi.fn();
		render(<Harness onEntriesChange={onEntriesChange} />);
		runCommand("ls");
		runCommand("clear");

		expect(onEntriesChange).toHaveBeenLastCalledWith([]);
		expect(getLog().children).toHaveLength(0);
	});

	it("clear 之後同一行還有輸出（clear ; pwd）時清完畫面只留這一行", () => {
		const onEntriesChange = vi.fn();
		render(<Harness onEntriesChange={onEntriesChange} />);
		runCommand("ls");
		runCommand("clear ; pwd");

		const last = onEntriesChange.mock.lastCall?.[0] as OutputEntry[];
		expect(last).toHaveLength(1);
		expect(last[0]).toMatchObject({ kind: "command", input: "clear ; pwd", lines: ["/home/tech"], isError: false });
	});

	it("輸入含全形空白時顯示全形提示，改回半形後消失", () => {
		render(<Harness />);
		typeText("cd　pod");
		expect(screen.getByRole("alert").textContent).toContain("全形");

		typeText("cd pod");
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByText(/全形/)).toBeNull();
	});

	it("onExecuted 收到的 execution 帶有正確的 isError", () => {
		const onExecuted = vi.fn();
		render(<Harness onExecuted={onExecuted} />);
		runCommand("ls");
		runCommand("cat nope");

		expect(onExecuted).toHaveBeenCalledTimes(2);
		expect(onExecuted.mock.calls[0][0]).toMatchObject({ input: "ls", isError: false });
		expect(onExecuted.mock.calls[1][0]).toMatchObject({ input: "cat nope", isError: true });
	});

	it("新增的 command entry 帶有唯一 id 與執行結果", () => {
		const onEntriesChange = vi.fn();
		render(<Harness onEntriesChange={onEntriesChange} />);
		runCommand("pwd");
		runCommand("pwd");

		const last = onEntriesChange.mock.lastCall?.[0] as OutputEntry[];
		expect(last).toHaveLength(2);
		expect(last[0]).toMatchObject({ kind: "command", input: "pwd", lines: ["/home/tech"], isError: false });
		expect(last[0].id).not.toBe(last[1].id);
	});

	it("輸入法組字中按 Enter、Tab、↑ 都不處理", () => {
		const onEntriesChange = vi.fn();
		render(<Harness onEntriesChange={onEntriesChange} />);
		runCommand("pwd");
		onEntriesChange.mockClear();

		typeText("h");
		pressKey("Enter", { isComposing: true });
		pressKey("Tab", { isComposing: true });
		pressKey("ArrowUp", { isComposing: true });

		expect(onEntriesChange).not.toHaveBeenCalled();
		expect(getInput().value).toBe("h");
	});

	it("底部列顯示已學指令與提示", () => {
		render(<Harness />);
		expect(screen.getByText("已學：pwd ls")).toBeDefined();
		expect(screen.getByText("提示：輸入 hint")).toBeDefined();
	});

	it("還沒學任何指令時底部列顯示「過關後記錄」", () => {
		render(<Harness learnedCommands={[]} />);
		expect(screen.getByText("已學：（過關後記錄）")).toBeDefined();
	});

	it("標題列顯示終端機名稱", () => {
		render(<Harness />);
		expect(screen.getByRole("heading", { name: "冷凍艙控制台" })).toBeDefined();
	});

	it("已過關的終端機在標題列標「已完成」，用青綠成功色", () => {
		render(<Harness solved />);
		const badge = screen.getByTestId("terminal-solved-badge");
		expect(badge.textContent).toContain("已完成");
		expect(badge.className).toContain("text-game-success");
	});

	it("還沒過關的終端機標題列沒有「已完成」", () => {
		render(<Harness />);
		expect(screen.queryByTestId("terminal-solved-badge")).toBeNull();
		expect(screen.queryByText(/已完成/)).toBeNull();
	});

	it("點輸出區會把焦點放回輸入框", () => {
		render(<Harness />);
		getInput().blur();
		expect(document.activeElement).not.toBe(getInput());

		fireEvent.click(getLog());
		expect(document.activeElement).toBe(getInput());
	});

	it("掛載時已存在的 NOVA 對話直接整段顯示，不重播打字動畫", () => {
		const initialEntries: OutputEntry[] = [
			{ kind: "dialogue", id: "d-1", speaker: "NOVA", text: "早安，技師。" },
		];
		render(<Harness initialEntries={initialEntries} textSpeed="slow" />);

		expect(screen.getByTestId("dialogue-text").textContent).toBe("早安，技師。");
	});
});
