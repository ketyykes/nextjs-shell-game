import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findTerminal } from "@/game/chapters";
import type { Shell } from "@/game/shell/shell";
import type { TerminalDefinition } from "@/game/story";
import { ABIN_NOTES, findAbinNote } from "@/game/story/abinNotes";
import { createInitialSaveData, useGameStore } from "@/game/store";
import type { OutputEntry } from "@/game/store/types";
import { useAbinNotes, type AbinNotesEvent, type ExecutedHandler } from "./useAbinNotes";
import { resolveShell } from "./useTerminalSessions";

const MEDBAY = findTerminal("ch1-t5") as TerminalDefinition;
const CRYO = findTerminal("ch1-t1") as TerminalDefinition;

function setup(shortcutLabel = "Alt+A") {
	const onExecuted = vi.fn<ExecutedHandler>();
	const onAbinEvent = vi.fn<(event: AbinNotesEvent) => void>();
	const rendered = renderHook(() => useAbinNotes({ onExecuted, shortcutLabel, onAbinEvent }));
	return { ...rendered, onExecuted, onAbinEvent };
}

/** 在 shell 上執行一行，再交給 handleExecuted，模擬 TerminalModal 的流程；回傳 hook 的回傳值。 */
function run(
	handleExecuted: ReturnType<typeof useAbinNotes>["handleExecuted"],
	definition: TerminalDefinition,
	shell: Shell,
	command: string,
): AbinNotesEvent | null {
	const execution = shell.execute(command);
	let result: AbinNotesEvent | null = null;
	act(() => {
		result = handleExecuted(definition, shell, execution);
	});
	return result;
}

function transcriptOf(terminalId: string): OutputEntry[] {
	return useGameStore.getState().terminals[terminalId]?.transcript ?? [];
}

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("useAbinNotes：讀到留言", () => {
	it("看到留言的 signature：收進存檔、終端機插一行系統行、通知外面，最後照樣交給原本的 onExecuted", () => {
		const { result, onExecuted, onAbinEvent } = setup();
		const shell = resolveShell(new Map(), MEDBAY);

		expect(run(result.current.handleExecuted, MEDBAY, shell, "ls -a")).toBeNull();
		expect(onAbinEvent).not.toHaveBeenCalled();

		const event = run(result.current.handleExecuted, MEDBAY, shell, "cat .abin_jokes.txt");

		const note = findAbinNote("ch1-jokes");
		expect(event).toEqual({ terminalId: "ch1-t5", found: [note], foundCount: 1, reply: null });
		expect(onAbinEvent).toHaveBeenCalledWith(event);
		expect(useGameStore.getState().abinNotes.found).toEqual(["ch1-jokes"]);
		expect(transcriptOf("ch1-t5").at(-1)).toEqual({
			kind: "system",
			id: "abin-note-ch1-jokes",
			lines: ["［已收進「阿彬的留言」1/8　Alt+A 打開］"],
		});
		expect(onExecuted).toHaveBeenCalledTimes(2);
		expect(onExecuted.mock.calls[1][0]).toBe(MEDBAY);
	});

	it("已經找到的再讀一次不再插行也不通知", () => {
		useGameStore.setState({ abinNotes: { found: ["ch1-jokes"], reply: null } });
		const { result, onAbinEvent } = setup();
		const shell = resolveShell(new Map(), MEDBAY);
		const before = transcriptOf("ch1-t5").length;

		expect(run(result.current.handleExecuted, MEDBAY, shell, "cat .abin_jokes.txt")).toBeNull();

		expect(onAbinEvent).not.toHaveBeenCalled();
		expect(transcriptOf("ch1-t5")).toHaveLength(before);
	});

	it("沒有留言的終端機：只交給原本的 onExecuted", () => {
		const { result, onExecuted, onAbinEvent } = setup();
		const shell = resolveShell(new Map(), CRYO);

		expect(run(result.current.handleExecuted, CRYO, shell, "cat wake_up.txt")).toBeNull();

		expect(onExecuted).toHaveBeenCalledTimes(1);
		expect(onAbinEvent).not.toHaveBeenCalled();
		expect(useGameStore.getState().abinNotes.found).toEqual([]);
	});

	it("指令出錯但輸出裡看得到留言也算（例如 cat 一次給兩個檔案，其中一個不存在）", () => {
		const { result } = setup();
		const shell = resolveShell(new Map(), MEDBAY);

		const event = run(result.current.handleExecuted, MEDBAY, shell, "cat .abin_jokes.txt nothing.txt");

		expect(event?.found.map((note) => note.id)).toEqual(["ch1-jokes"]);
	});

	it("找齊最後一則時系統行說全部找齊了；快捷鍵文字照傳進來的（Mac 是 ⌥A）", () => {
		const others = ABIN_NOTES.filter((note) => note.id !== "ch1-jokes").map((note) => note.id);
		useGameStore.setState({ abinNotes: { found: others, reply: null } });
		const { result } = setup("⌥A");
		const shell = resolveShell(new Map(), MEDBAY);

		const event = run(result.current.handleExecuted, MEDBAY, shell, "cat .abin_jokes.txt");

		expect(event?.foundCount).toBe(8);
		expect(transcriptOf("ch1-t5").at(-1)).toMatchObject({ lines: ["［已收進「阿彬的留言」8/8，全部找齊了　⌥A 打開］"] });
	});
});
