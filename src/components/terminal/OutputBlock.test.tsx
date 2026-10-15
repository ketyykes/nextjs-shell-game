import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DisplayInstabilityContext } from "./DisplayInstabilityContext";
import { OutputBlock } from "./OutputBlock";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

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

describe("OutputBlock 在低氧顯示不穩時（4.25）", () => {
	const LONG_OUTPUT = "crew_manifest.txt  pod_01/  pod_02/  pod_03/  pod_04/  pod_05/  pod_06/  wake_up.txt";
	const UNSTABLE = { glitchRate: 0.08, stutter: true };

	function commandEntry(input: string, lines: string[], id = "e-glitch") {
		return { kind: "command" as const, id, prompt: "tech@kepler9:~$", input, lines, isError: false };
	}

	function renderUnstable(entry: Parameters<typeof OutputBlock>[0]["entry"]) {
		return render(
			<DisplayInstabilityContext value={UNSTABLE}>
				<OutputBlock entry={entry} />
			</DisplayInstabilityContext>,
		);
	}

	it("指令輸出有字被換掉，但提示符與玩家打的那一行不變", () => {
		const { container } = renderUnstable(commandEntry("ls", [LONG_OUTPUT]));
		const block = container.firstElementChild;
		expect(block?.children[0].textContent).toBe("tech@kepler9:~$ ls");
		const shown = block?.children[1].textContent ?? "";
		expect(shown).not.toBe(LONG_OUTPUT);
		expect(Array.from(shown)).toHaveLength(Array.from(LONG_OUTPUT).length);
	});

	it("同一筆輸出重新 render 還是同一組亂碼（不跳動）", () => {
		const entry = commandEntry("ls", [LONG_OUTPUT]);
		const { container, rerender } = renderUnstable(entry);
		const first = container.firstElementChild?.children[1].textContent;
		rerender(
			<DisplayInstabilityContext value={{ ...UNSTABLE }}>
				<OutputBlock entry={{ ...entry, lines: [...entry.lines] }} />
			</DisplayInstabilityContext>,
		);
		expect(container.firstElementChild?.children[1].textContent).toBe(first);
	});

	it("hint 與 help 的輸出不亂碼，新手照著打不會錯", () => {
		const hintLine = "輸入 ls，然後輸入 cat wake_up.txt。喚醒排程寫在那個檔案裡。這一行夠長，一定會被抽到。";
		const { container } = renderUnstable(commandEntry("hint", [hintLine]));
		expect(container.firstElementChild?.children[1].textContent).toBe(hintLine);
		cleanup();

		const { container: helpContainer } = renderUnstable(commandEntry("help", [LONG_OUTPUT]));
		expect(helpContainer.firstElementChild?.children[1].textContent).toBe(LONG_OUTPUT);
	});

	it("系統行（目標達成、☆、Tab 候選）不亂碼", () => {
		const line = "☑ 目標達成：讀取冷凍艙的喚醒排程　crew_manifest.txt  pod_01/  pod_02/  pod_03/";
		const { container } = renderUnstable({ kind: "system", id: "s-glitch", tone: "success", lines: [line] });
		expect(container.firstElementChild?.textContent).toBe(line);
	});

	it("沒有提供不穩狀態（沙盒）時照原樣顯示", () => {
		const { container } = render(<OutputBlock entry={commandEntry("ls", [LONG_OUTPUT])} />);
		expect(container.firstElementChild?.children[1].textContent).toBe(LONG_OUTPUT);
	});

	it("氧氣回到 20% 以上（比例 0）立刻恢復原文", () => {
		const entry = commandEntry("ls", [LONG_OUTPUT]);
		const { container, rerender } = renderUnstable(entry);
		expect(container.firstElementChild?.children[1].textContent).not.toBe(LONG_OUTPUT);
		rerender(
			<DisplayInstabilityContext value={{ glitchRate: 0, stutter: false }}>
				<OutputBlock entry={entry} />
			</DisplayInstabilityContext>,
		);
		expect(container.firstElementChild?.children[1].textContent).toBe(LONG_OUTPUT);
	});
});
