import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import type { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import type { TerminalDefinition } from "@/game/story";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { resolveShell } from "./useTerminalSessions";
import { TerminalModal } from "./TerminalModal";

const CRYO = getChapter(1).terminals[0];
const ON_OPEN = CRYO.nova?.onOpen ?? [];

function renderModal(
	options: {
		definition?: TerminalDefinition;
		onClose?: () => void;
		onExecuted?: (definition: TerminalDefinition, shell: Shell, execution: ShellExecution) => void;
	} = {},
) {
	const definition = options.definition ?? CRYO;
	const shell = resolveShell(new Map(), definition);
	render(
		<TerminalModal
			definition={definition}
			shell={shell}
			textSpeed="instant"
			onClose={options.onClose ?? vi.fn()}
			onExecuted={options.onExecuted ?? vi.fn()}
		/>,
	);
	return shell;
}

function getInput(): HTMLInputElement {
	return screen.getByLabelText("指令輸入") as HTMLInputElement;
}

function runCommand(command: string): void {
	fireEvent.change(getInput(), { target: { value: command } });
	fireEvent.keyDown(getInput(), { key: "Enter" });
}

function onOpenEntries() {
	const transcript = useGameStore.getState().terminals[CRYO.id]?.transcript ?? [];
	return transcript.filter((entry) => entry.id.startsWith(`nova-open-${CRYO.id}`));
}

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("TerminalModal", () => {
	it("顯示終端機名稱與存檔裡的輸出紀錄（banner）", () => {
		renderModal();
		expect(screen.getByText(CRYO.title)).toBeDefined();
		expect(screen.getByText(CRYO.banner?.[0] ?? "")).toBeDefined();
	});

	it("第一次開時把 NOVA 的開場白寫進輸出紀錄，再開不重說", () => {
		renderModal();
		expect(onOpenEntries()).toHaveLength(ON_OPEN.length);
		cleanup();

		// 同一個 session 再開一次（例如重整後）
		const shell = resolveShell(new Map(), CRYO);
		render(<TerminalModal definition={CRYO} shell={shell} textSpeed="instant" onClose={vi.fn()} onExecuted={vi.fn()} />);
		expect(onOpenEntries()).toHaveLength(ON_OPEN.length);
	});

	it("沒有 onOpen 台詞的終端機不寫", () => {
		const silent: TerminalDefinition = { ...CRYO, nova: undefined };
		renderModal({ definition: silent });
		expect(onOpenEntries()).toEqual([]);
	});

	it("執行指令後把輸出紀錄與 shell 狀態一起存回 store", () => {
		const shell = renderModal();
		runCommand("cd ..");

		const record = useGameStore.getState().terminals[CRYO.id];
		expect(record?.shell.cwd).toBe("/home");
		expect(record?.shell).toEqual(shell.toState());
		expect(record?.transcript.some((entry) => entry.kind === "command" && entry.input === "cd ..")).toBe(true);
	});

	it("執行結果連同定義與同一個 Shell 交給 onExecuted", () => {
		const onExecuted = vi.fn();
		const shell = renderModal({ onExecuted });
		runCommand("pwd");

		expect(onExecuted).toHaveBeenCalledTimes(1);
		const [definition, calledShell, execution] = onExecuted.mock.calls[0];
		expect(definition).toBe(CRYO);
		expect(calledShell).toBe(shell);
		expect(execution.isError).toBe(false);
	});

	it("Esc 呼叫 onClose", () => {
		const onClose = vi.fn();
		renderModal({ onClose });
		fireEvent.keyDown(getInput(), { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("已過關的終端機標題列標已完成", () => {
		useGameStore.getState().markTerminalSolved(CRYO.id);
		renderModal();
		expect(screen.getByText(/已完成/)).toBeDefined();
	});
});
