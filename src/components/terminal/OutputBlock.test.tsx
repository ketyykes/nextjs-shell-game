import { StrictMode, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestFs } from "@/game/shell/commands/testFixtures";
import { Shell } from "@/game/shell/shell";
import type { OutputEntry } from "@/game/store/types";
import { DisplayInstabilityContext } from "./DisplayInstabilityContext";
import { OutputBlock, type OutputBlockEntry } from "./OutputBlock";
import { resetLegendAutoExpand } from "./outputFields";
import { Terminal } from "./Terminal";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面；欄位說明「本頁自動展開過」的紀錄也一起清掉
afterEach(() => {
	cleanup();
	resetLegendAutoExpand();
});

describe("OutputBlock", () => {
	it("command 第一行是提示符加輸入，提示符用提示符色", () => {
		const { container } = render(
			<OutputBlock
				entry={{
					kind: "command",
					id: "e-1",
					prompt: "crew@kepler9:~$",
					input: "pwd",
					lines: ["/home/tech"],
					isError: false,
				}}
			/>,
		);

		const prompt = screen.getByText("crew@kepler9:~$");
		expect(prompt.className).toContain("text-game-prompt");
		const block = container.firstElementChild;
		expect(block?.children[0].textContent).toBe("crew@kepler9:~$ pwd");
		expect(block?.children[1].textContent).toBe("/home/tech");
		expect(block?.children[1].className).not.toContain("text-game-amber");
	});

	it("isError 時輸出行用琥珀色", () => {
		render(
			<OutputBlock
				entry={{
					kind: "command",
					id: "e-1",
					prompt: "crew@kepler9:~$",
					input: "xyz",
					lines: ["找不到指令"],
					isError: true,
				}}
			/>,
		);

		expect(screen.getByText("找不到指令").className).toContain("text-game-amber");
	});

	it("沒有輸出時只渲染提示符那一行", () => {
		const { container } = render(
			<OutputBlock
				entry={{
					kind: "command",
					id: "e-1",
					prompt: "crew@kepler9:~$",
					input: "cd pod_06",
					lines: [],
					isError: false,
				}}
			/>,
		);

		expect(container.firstElementChild?.children).toHaveLength(1);
	});

	it("輸出中的空行仍佔一行", () => {
		const { container } = render(
			<OutputBlock
				entry={{
					kind: "command",
					id: "e-1",
					prompt: "crew@kepler9:~$",
					input: "cat a.txt",
					lines: ["第一行", "", "第三行"],
					isError: false,
				}}
			/>,
		);

		const lines = container.firstElementChild?.children;
		expect(lines).toHaveLength(4);
		expect(lines?.[2].textContent).toBe(" ");
	});

	it("多行輸出保留空白並允許任意斷行", () => {
		render(
			<OutputBlock
				entry={{
					kind: "command",
					id: "e-1",
					prompt: "crew@kepler9:~$",
					input: "ls",
					lines: ["pod_01/  pod_02/"],
					isError: false,
				}}
			/>,
		);

		const line = screen.getByText("pod_01/  pod_02/", { normalizer: (text) => text });
		expect(line.className).toContain("whitespace-pre-wrap");
		expect(line.className).toContain("break-all");
	});

	it("system 區塊用暗色顯示", () => {
		const { container } = render(
			<OutputBlock entry={{ kind: "system", id: "s-1", lines: ["help  hint  history"] }} />,
		);

		const block = container.firstElementChild;
		expect(block?.className).toContain("text-game-dim");
		expect(block?.textContent).toBe("help  hint  history");
	});

	it("tone 為 success 的 system 區塊用青綠成功色，不用暗色", () => {
		const { container } = render(
			<OutputBlock
				entry={{ kind: "system", id: "s-1", tone: "success", lines: ["☑ 目標達成：讀取冷凍艙的喚醒排程"] }}
			/>,
		);

		const block = container.firstElementChild;
		expect(block?.className).toContain("text-game-success");
		expect(block?.className).not.toContain("text-game-dim");
		expect(block?.textContent).toBe("☑ 目標達成：讀取冷凍艙的喚醒排程");
	});
});

type CommandEntry = Extract<OutputBlockEntry, { kind: "command" }>;

function commandEntry(id: string, input: string, lines: string[], isError = false): CommandEntry {
	return { kind: "command", id, prompt: "crew@kepler9:~$", input, lines, isError };
}

const LS_LONG_LINES = [
	"total 2",
	"drwxr-xr-x  tech  4096  2031-03-10 00:00  logs/",
	"-rw-r--r--  tech   822  2027-08-14 05:30  README.txt",
];
const PS_LINES = [
	"PID  USER  %CPU  %MEM  STARTED           COMMAND",
	"  1  root   0.0   0.1  2027-08-14 05:29  /sbin/init",
];

function getLegendButton(name = "ls -l 欄位說明"): HTMLElement {
	return screen.getByRole("button", { name });
}

describe("OutputBlock 的欄位說明（4.17）", () => {
	it("ls -l 的輸出在第一行右側有「[?] 欄位說明」按鈕，預設收合", () => {
		const { container } = render(<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} />);

		const button = getLegendButton();
		expect(button.textContent).toBe("[?] 欄位說明");
		expect(button.getAttribute("aria-expanded")).toBe("false");
		expect(container.firstElementChild?.children[0].contains(button)).toBe(true);
		expect(container.firstElementChild?.children[0].textContent).toContain("crew@kepler9:~$ ls -l");
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("點按鈕在區塊下方展開表格（欄位、例子、說明一行一欄），再點收合", () => {
		const { container } = render(<OutputBlock entry={commandEntry("e-1", "ls -la", LS_LONG_LINES)} />);
		const button = getLegendButton();

		fireEvent.click(button);

		expect(button.getAttribute("aria-expanded")).toBe("true");
		const table = screen.getByRole("table", { name: "ls -l 欄位說明" });
		const controlled = document.getElementById(button.getAttribute("aria-controls") ?? "");
		expect(controlled?.contains(table)).toBe(true);
		const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
		expect(headers).toEqual(["欄位", "例子", "說明"]);
		const permission = within(table).getByRole("row", { name: /^權限/ });
		expect(within(permission).getAllByRole("cell").map((cell) => cell.textContent?.trim())).toEqual([
			"權限",
			"-rw-r--r--",
			expect.stringContaining("九碼"),
		]);
		expect(within(table).getByRole("row", { name: /第 2-4 碼/ }).textContent).toContain("rw-");
		// 表格在輸出行的下面
		const lines = Array.from(container.firstElementChild?.children ?? []);
		expect(lines.findIndex((element) => element.contains(table))).toBe(lines.length - 1);
		expect(screen.getByText(/以這一行為例/).textContent).toContain("-rw-r--r--  tech   822  2027-08-14 05:30  README.txt");
		expect(screen.getByText(/chmod/)).toBeDefined();

		fireEvent.click(button);

		expect(button.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("ps 的表格用 ps 自己的欄位", () => {
		render(<OutputBlock entry={commandEntry("e-1", "ps aux", PS_LINES)} />);

		fireEvent.click(getLegendButton("ps 欄位說明"));

		const table = screen.getByRole("table", { name: "ps 欄位說明" });
		const fields = within(table)
			.getAllByRole("row")
			.slice(1)
			.map((row) => within(row).getAllByRole("cell")[0].textContent);
		expect(fields).toEqual(["PID", "USER", "%CPU", "%MEM", "STARTED", "COMMAND"]);
	});

	it.each([
		["不是多欄輸出", commandEntry("e-1", "pwd", ["/home/tech"])],
		["管線最後是別的指令", commandEntry("e-1", "ps | grep init", [PS_LINES[1]])],
		["錯誤輸出", commandEntry("e-1", "ls -l /nope", ["找不到 `/nope`。"], true)],
		["沒有輸出", commandEntry("e-1", "ls -l > out.txt", [])],
	])("%s沒有按鈕", (_label, entry) => {
		render(<OutputBlock entry={entry} />);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("系統訊息沒有按鈕", () => {
		render(<OutputBlock entry={{ kind: "system", id: "s-1", lines: LS_LONG_LINES }} />);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("按下滑鼠不會把焦點從輸入框搶走", () => {
		render(
			<>
				<input aria-label="指令輸入" />
				<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} />
			</>,
		);
		const input = screen.getByLabelText("指令輸入");
		input.focus();

		const notPrevented = fireEvent.mouseDown(getLegendButton());
		fireEvent.click(getLegendButton());

		expect(notPrevented).toBe(false);
		expect(document.activeElement).toBe(input);
		expect(screen.getByRole("table")).toBeDefined();
	});

	it("按鈕本身可以取得焦點；點擊不往外傳，鍵盤操作後焦點留在按鈕上", () => {
		const onOuterClick = vi.fn();
		render(
			<div onClick={onOuterClick}>
				<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} />
			</div>,
		);
		const button = getLegendButton();
		button.focus();

		fireEvent.click(button);

		expect(document.activeElement).toBe(button);
		expect(onOuterClick).not.toHaveBeenCalled();
	});

	describe("自動展開", () => {
		it("新產生的輸出：同一種說明本頁第一次出現時自動展開，之後不再自動展開", () => {
			const { rerender } = render(
				<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} autoExpandLegend />,
			);
			expect(screen.getAllByRole("table")).toHaveLength(1);

			rerender(
				<>
					<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} autoExpandLegend />
					<OutputBlock entry={commandEntry("e-2", "ls -la", LS_LONG_LINES)} autoExpandLegend />
				</>,
			);

			const buttons = screen.getAllByRole("button", { name: "ls -l 欄位說明" });
			expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
			expect(screen.getAllByRole("table")).toHaveLength(1);
		});

		it("不同種類各自自動展開一次", () => {
			render(
				<>
					<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} autoExpandLegend />
					<OutputBlock entry={commandEntry("e-2", "ps", PS_LINES)} autoExpandLegend />
				</>,
			);

			expect(screen.getByRole("table", { name: "ls -l 欄位說明" })).toBeDefined();
			expect(screen.getByRole("table", { name: "ps 欄位說明" })).toBeDefined();
		});

		it("還原的舊輸出（沒有 autoExpandLegend）不自動展開，也不佔掉第一次", () => {
			const { rerender } = render(<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} />);
			expect(screen.queryByRole("table")).toBeNull();

			rerender(
				<>
					<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} />
					<OutputBlock entry={commandEntry("e-2", "ls -l", LS_LONG_LINES)} autoExpandLegend />
				</>,
			);

			const buttons = screen.getAllByRole("button", { name: "ls -l 欄位說明" });
			expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
		});

		it("StrictMode 重複執行也照樣自動展開", () => {
			render(
				<StrictMode>
					<OutputBlock entry={commandEntry("e-1", "ls -l", LS_LONG_LINES)} autoExpandLegend />
				</StrictMode>,
			);

			expect(getLegendButton().getAttribute("aria-expanded")).toBe("true");
			expect(screen.getByRole("table")).toBeDefined();
		});
	});
});

/** 模擬父層持有 entries，跟 TerminalModal、沙盒一樣。 */
function TerminalHarness({ initialEntries }: { initialEntries: OutputEntry[] }) {
	const [shell] = useState(
		() => new Shell({ fs: createTestFs(), terminalId: "ch1-t1", hints: [], learnedCommands: ["ls"] }),
	);
	const [entries, setEntries] = useState<OutputEntry[]>(initialEntries);
	return (
		<Terminal
			title="冷凍艙控制台"
			shell={shell}
			entries={entries}
			onEntriesChange={setEntries}
			onClose={() => {}}
			learnedCommands={["ls"]}
			textSpeed="instant"
		/>
	);
}

function submit(command: string): void {
	const input = screen.getByLabelText("指令輸入");
	fireEvent.change(input, { target: { value: command } });
	fireEvent.keyDown(input, { key: "Enter" });
}

describe("終端機裡的欄位說明", () => {
	it("重開終端機還原的 ls -l 不自動展開；新打的第一次自動展開，再打一次不展開", () => {
		render(<TerminalHarness initialEntries={[commandEntry("old-1", "ls -l", LS_LONG_LINES)]} />);
		expect(screen.queryByRole("table")).toBeNull();

		submit("ls -l");
		expect(screen.getAllByRole("table")).toHaveLength(1);

		submit("ls -la");
		const buttons = screen.getAllByRole("button", { name: "ls -l 欄位說明" });
		expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
	});

	it("用鍵盤點開說明後焦點留在按鈕上，不會被終端機拉回輸入框", () => {
		render(<TerminalHarness initialEntries={[commandEntry("old-1", "ls -l", LS_LONG_LINES)]} />);
		const button = getLegendButton();
		button.focus();

		fireEvent.click(button);

		expect(document.activeElement).toBe(button);
		expect(screen.getByRole("table")).toBeDefined();
	});
});

describe("OutputBlock 在低氧顯示不穩時（4.25）", () => {
	const LONG_OUTPUT = "crew_manifest.txt  pod_01/  pod_02/  pod_03/  pod_04/  pod_05/  pod_06/  wake_up.txt";

	it("指令輸出照原文顯示：低氧只影響 NOVA 斷句、心跳與 HUD 標示，不動終端機的字（文字亂碼已拿掉）", () => {
		const entry = { kind: "command" as const, id: "e-low-o2", prompt: "tech@kepler9:~$", input: "ls", lines: [LONG_OUTPUT], isError: false };
		const { container } = render(
			<DisplayInstabilityContext value={{ stutter: true }}>
				<OutputBlock entry={entry} />
			</DisplayInstabilityContext>,
		);
		const block = container.firstElementChild;
		expect(block?.children[0].textContent).toBe("tech@kepler9:~$ ls");
		expect(block?.children[1].textContent).toBe(LONG_OUTPUT);
	});
});
