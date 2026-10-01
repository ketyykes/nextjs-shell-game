import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCommandDoc } from "@/game/shell/commands/docs";
import { CommandCheatSheet } from "./CommandCheatSheet";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("CommandCheatSheet", () => {
	it("收起時只有標籤，沒有指令面板", () => {
		render(<CommandCheatSheet learnedCommands={["pwd"]} open={false} onOpenChange={() => {}} />);
		const tab = screen.getByRole("button", { name: /已學指令/ });
		expect(tab.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByTestId("command-cheat-sheet-panel")).toBeNull();
		expect(screen.queryByText("pwd")).toBeNull();
	});

	it("收起時點標籤會呼叫 onOpenChange(true)", () => {
		const onOpenChange = vi.fn();
		render(<CommandCheatSheet learnedCommands={["pwd"]} open={false} onOpenChange={onOpenChange} />);
		fireEvent.click(screen.getByRole("button", { name: /已學指令/ }));
		expect(onOpenChange).toHaveBeenCalledWith(true);
	});

	it("展開時點標籤會呼叫 onOpenChange(false)", () => {
		const onOpenChange = vi.fn();
		render(<CommandCheatSheet learnedCommands={["pwd"]} open onOpenChange={onOpenChange} />);
		const tab = screen.getByRole("button", { name: /已學指令/ });
		expect(tab.getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(tab);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("展開時列出 pwd 與完整字串 ls -a，且 ls -a 顯示 ls 的 summary", () => {
		render(<CommandCheatSheet learnedCommands={["pwd", "ls -a"]} open onOpenChange={() => {}} />);
		expect(screen.getByText("pwd")).toBeDefined();
		expect(screen.getByText("ls -a")).toBeDefined();
		const lsDoc = getCommandDoc("ls");
		expect(lsDoc).toBeDefined();
		expect(screen.getByText(lsDoc?.summary ?? "")).toBeDefined();
	});

	it("點 ls -a 展開 usage 與範例，再點一次收起", () => {
		render(<CommandCheatSheet learnedCommands={["pwd", "ls -a"]} open onOpenChange={() => {}} />);
		const lsDoc = getCommandDoc("ls");
		const usage = lsDoc?.usage ?? "";
		const firstExample = lsDoc?.examples[0];
		const itemButton = screen.getByRole("button", { name: /ls -a/ });
		expect(itemButton.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText(usage)).toBeNull();

		fireEvent.click(itemButton);
		expect(itemButton.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText(usage)).toBeDefined();
		expect(screen.getByText(`$ ${firstExample?.command}`)).toBeDefined();
		expect(screen.getByText(firstExample?.explanation ?? "")).toBeDefined();

		fireEvent.click(itemButton);
		expect(itemButton.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText(usage)).toBeNull();
	});

	it("同時只展開一項：點另一項時前一項收起", () => {
		render(<CommandCheatSheet learnedCommands={["pwd", "ls -a"]} open onOpenChange={() => {}} />);
		const pwdButton = screen.getByRole("button", { name: /pwd/ });
		const lsButton = screen.getByRole("button", { name: /ls -a/ });
		fireEvent.click(pwdButton);
		fireEvent.click(lsButton);
		expect(pwdButton.getAttribute("aria-expanded")).toBe("false");
		expect(lsButton.getAttribute("aria-expanded")).toBe("true");
	});

	it("已學為空時顯示引導文案", () => {
		render(<CommandCheatSheet learnedCommands={[]} open onOpenChange={() => {}} />);
		expect(screen.getByText("還沒學會任何指令，走到終端機前按 E")).toBeDefined();
	});

	it("查不到 docs 的指令只顯示名稱，不是按鈕", () => {
		render(<CommandCheatSheet learnedCommands={["foo"]} open onOpenChange={() => {}} />);
		expect(screen.getByText("foo")).toBeDefined();
		expect(screen.queryByRole("button", { name: /foo/ })).toBeNull();
	});

	it("顯示 man 提示，且所有按鈕都不進 Tab 順序", () => {
		render(<CommandCheatSheet learnedCommands={["pwd", "ls -a"]} open onOpenChange={() => {}} />);
		expect(screen.getByText(/終端機內輸入 man/)).toBeDefined();
		for (const button of screen.getAllByRole("button")) {
			expect(button.getAttribute("tabindex")).toBe("-1");
		}
	});
});
