import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
