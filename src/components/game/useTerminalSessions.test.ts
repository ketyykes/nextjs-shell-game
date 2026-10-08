import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import { onGameEvent } from "@/game/phaser/EventBus";
import type { Shell } from "@/game/shell/shell";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { createDialogueEntries } from "./terminalSession";
import { resolveShell, useTerminalSessions } from "./useTerminalSessions";

const CRYO = getChapter(1).terminals[0];

const closeEvents: string[] = [];
let unsubscribe: () => void = () => {};

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
	closeEvents.length = 0;
	unsubscribe = onGameEvent("terminal:close", ({ terminalId }) => {
		closeEvents.push(terminalId);
	});
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	unsubscribe();
	localStorage.clear();
});

describe("useTerminalSessions", () => {
	it("一開始沒有開著的終端機", () => {
		const { result } = renderHook(() => useTerminalSessions());
		expect(result.current.openTerminal).toBeNull();
	});

	it("開劇本裡的終端機：帶出定義與 Shell，store 多一筆 session", () => {
		const { result } = renderHook(() => useTerminalSessions());
		act(() => {
			result.current.openTerminalById("ch1-t1");
		});

		expect(result.current.openTerminal?.definition.id).toBe("ch1-t1");
		expect(result.current.openTerminal?.shell.cwd).toBe("/home/tech");
		expect(useGameStore.getState().terminals["ch1-t1"]).toBeDefined();
	});

	it("劇本裡沒有的 id：不開，發 terminal:close 讓 Phaser 恢復", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { result } = renderHook(() => useTerminalSessions());
		act(() => {
			result.current.openTerminalById("ch9-t9");
		});

		expect(result.current.openTerminal).toBeNull();
		expect(closeEvents).toEqual(["ch9-t9"]);
		warn.mockRestore();
	});

	it("關閉：發 terminal:close、回傳 true；本來就關著回傳 false 且不發事件", () => {
		const { result } = renderHook(() => useTerminalSessions());
		act(() => {
			result.current.openTerminalById("ch1-t1");
		});

		let closed = false;
		act(() => {
			closed = result.current.closeTerminal();
		});
		expect(closed).toBe(true);
		expect(result.current.openTerminal).toBeNull();
		expect(closeEvents).toEqual(["ch1-t1"]);

		act(() => {
			closed = result.current.closeTerminal();
		});
		expect(closed).toBe(false);
		expect(closeEvents).toEqual(["ch1-t1"]);
	});

	it("關掉再開同一台沿用同一個 Shell 實例", () => {
		const { result } = renderHook(() => useTerminalSessions());
		act(() => {
			result.current.openTerminalById("ch1-t1");
		});
		const shell = result.current.openTerminal?.shell;
		act(() => {
			result.current.closeTerminal();
		});
		act(() => {
			result.current.openTerminalById("ch1-t1");
		});

		expect(result.current.openTerminal?.shell).toBe(shell);
	});

	it("開啟的函式在重新 render 後維持同一個", () => {
		const { result, rerender } = renderHook(() => useTerminalSessions());
		const first = result.current;
		rerender();
		expect(result.current).toBe(first);
	});
});

describe("resolveShell", () => {
	it("第一次開：建 Shell、放進快取、在 store 存第一筆只有 banner 的 session", () => {
		const cache = new Map<string, Shell>();
		const shell = resolveShell(cache, CRYO);

		expect(cache.get(CRYO.id)).toBe(shell);
		const record = useGameStore.getState().terminals[CRYO.id];
		expect(record?.transcript).toEqual([{ kind: "system", id: `banner-${CRYO.id}`, lines: CRYO.banner }]);
		expect(record?.shell).toEqual(shell.toState());
	});

	it("新 Shell 的已學清單只放指令名", () => {
		useGameStore.getState().learnCommand("ls -a");
		const shell = resolveShell(new Map(), CRYO);
		expect(shell.learnedCommands).toContain("ls");
		expect(shell.learnedCommands).not.toContain("ls -a");
	});

	it("快取裡有就直接回傳同一個實例，不再寫 store", () => {
		const cache = new Map<string, Shell>();
		const first = resolveShell(cache, CRYO);
		useGameStore.getState().appendTranscript(CRYO.id, createDialogueEntries("x", ["不該被洗掉"]));

		expect(resolveShell(cache, CRYO)).toBe(first);
		expect(useGameStore.getState().terminals[CRYO.id]?.transcript).toHaveLength(2);
	});

	it("快取沒有但 store 有 session（重整後）：從存檔還原，不覆寫原本的輸出紀錄", () => {
		const played = resolveShell(new Map(), CRYO);
		played.execute("cd ..");
		const transcript = createDialogueEntries("old", ["舊紀錄"]);
		useGameStore.getState().saveTerminalSession(CRYO.id, { shell: played.toState(), transcript });

		const shell = resolveShell(new Map(), CRYO);
		expect(shell).not.toBe(played);
		expect(shell.cwd).toBe("/home");
		expect(useGameStore.getState().terminals[CRYO.id]?.transcript).toEqual(transcript);
	});

	it("劇本改版（存檔的雜湊對不上）：已過關的照存檔還原，還沒過關的用新版劇本重建（M12-4）", () => {
		const played = resolveShell(new Map(), CRYO);
		played.execute("cd ..");
		const stale = { shell: played.toState(), transcript: [], scriptHash: "0000000000000000" };

		useGameStore.getState().saveTerminalSession(CRYO.id, stale);
		useGameStore.getState().markTerminalSolved(CRYO.id);
		expect(resolveShell(new Map(), CRYO).cwd).toBe("/home");

		useGameStore.setState({ progress: { ...useGameStore.getState().progress, solvedTerminals: [] } });
		useGameStore.getState().saveTerminalSession(CRYO.id, stale);
		const rebuilt = resolveShell(new Map(), CRYO);
		expect(rebuilt.cwd).toBe(CRYO.initialCwd ?? "/home/tech");
		expect(rebuilt.historyEntries).toEqual(["cd .."]);
		expect(useGameStore.getState().terminals[CRYO.id]?.scriptHash).not.toBe("0000000000000000");
	});

	it("store 裡的 session 壞掉：丟掉重建並寫回一筆新的（M12-5）", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		useGameStore.setState({
			terminals: { [CRYO.id]: { shell: "壞掉", transcript: [] } as unknown as never },
		});

		const shell = resolveShell(new Map(), CRYO);
		expect(shell.cwd).toBe(CRYO.initialCwd);
		expect(useGameStore.getState().terminals[CRYO.id]?.shell).toEqual(shell.toState());
		warn.mockRestore();
	});
});
