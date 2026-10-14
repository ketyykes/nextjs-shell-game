import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findTerminal } from "@/game/chapters";
import { onGameEvent } from "@/game/phaser/EventBus";
import type { Shell } from "@/game/shell/shell";
import { novaReactionFlag, novaReactionLines, type TerminalDefinition } from "@/game/story";
import { createInitialSaveData, useGameStore } from "@/game/store";
import type { OutputEntry } from "@/game/store/types";
import { createDialogueEntries } from "./terminalSession";
import { useAbinNotes } from "./useAbinNotes";
import { useNovaReactions, type InnerExecutedHandler } from "./useNovaReactions";
import { useSolveFlow } from "./useSolveFlow";
import type { UseTerminalPressureResult } from "./useTerminalPressure";
import { resolveShell } from "./useTerminalSessions";

function terminal(id: string): TerminalDefinition {
	const definition = findTerminal(id);
	if (definition === undefined) {
		throw new Error(`沒有 ${id}`);
	}
	return definition;
}

/** 照 PlayScreen 的接法串起來：過關流程 → 阿彬的留言 → NOVA 看狀態。卡關計數換成假的。 */
function setup(chapter: number) {
	const pressure: UseTerminalPressureResult = {
		recordExecution: vi.fn<UseTerminalPressureResult["recordExecution"]>(),
		reset: vi.fn<UseTerminalPressureResult["reset"]>(),
	};
	return renderHook(() => {
		const solve = useSolveFlow({ pressure, onSolved: vi.fn() });
		const abin = useAbinNotes({ onExecuted: solve.handleExecuted, shortcutLabel: "Alt+A" });
		return useNovaReactions({ chapter, onExecuted: abin.handleExecuted });
	});
}

type Handler = ReturnType<typeof useNovaReactions>["handleExecuted"];

/** 在 shell 上執行一行，再交給 handleExecuted，模擬 TerminalModal 的流程。 */
function run(handleExecuted: Handler, definition: TerminalDefinition, shell: Shell, command: string): void {
	const execution = shell.execute(command);
	act(() => {
		handleExecuted(definition, shell, execution);
	});
}

function transcriptOf(terminalId: string): OutputEntry[] {
	return useGameStore.getState().terminals[terminalId]?.transcript ?? [];
}

/** 這台輸出區裡 NOVA 看狀態插的那幾句。 */
function reactionTexts(terminalId: string): string[] {
	return transcriptOf(terminalId)
		.filter((entry) => entry.kind === "dialogue" && entry.id.startsWith("nova-react-"))
		.map((entry) => (entry.kind === "dialogue" ? entry.text : ""));
}

function lineFor(kind: Parameters<typeof novaReactionLines>[0]["kind"], chapter: number, extra = {}): string {
	return novaReactionLines({ kind, ...extra }, chapter, "acting")?.[0] ?? "沒有台詞";
}

const flickers: unknown[] = [];
const unsubscribers: (() => void)[] = [];

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
	flickers.length = 0;
	unsubscribers.push(onGameEvent("ambient:flicker", (payload) => flickers.push(payload)));
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	for (const unsubscribe of unsubscribers.splice(0)) {
		unsubscribe();
	}
	localStorage.clear();
});

describe("useNovaReactions：觸發時插一句", () => {
	it("沒有觸發就不插", () => {
		const { result } = setup(1);
		const cryo = terminal("ch1-t1");
		const shell = resolveShell(new Map(), cryo);
		run(result.current.handleExecuted, cryo, shell, "ls");
		expect(reactionTexts("ch1-t1")).toEqual([]);
	});

	it("第五章安全管制台 unset NOVA_DIR：終端機插一句 NOVA、立這一章的旗標、燈閃一下", () => {
		useGameStore.setState((state) => ({ progress: { ...state.progress, chapter: 5 } }));
		const { result } = setup(5);
		const security = terminal("ch5-t4");
		const shell = resolveShell(new Map(), security);

		run(result.current.handleExecuted, security, shell, "unset NOVA_DIR");

		expect(reactionTexts("ch5-t4")).toEqual([lineFor("unsetNovaDir", 5)]);
		const last = transcriptOf("ch5-t4").at(-1);
		expect(last).toMatchObject({ kind: "dialogue", speaker: "NOVA", text: lineFor("unsetNovaDir", 5) });
		expect(useGameStore.getState().storyFlags[novaReactionFlag(5, "unsetNovaDir")]).toBe(true);
		expect(flickers).toHaveLength(1);
	});

	it("關閉閃爍時只說話，燈不閃", () => {
		useGameStore.getState().updateSettings({ flickerEnabled: false });
		const { result } = setup(5);
		const security = terminal("ch5-t4");
		const shell = resolveShell(new Map(), security);

		run(result.current.handleExecuted, security, shell, "unset NOVA_DIR");

		expect(reactionTexts("ch5-t4")).toHaveLength(1);
		expect(flickers).toEqual([]);
	});

	it("每章只說一次；重玩本章（旗標清掉）之後會再說", () => {
		useGameStore.setState((state) => ({ progress: { ...state.progress, chapter: 5, furthestChapter: 5 } }));
		const security = terminal("ch5-t4");
		const first = setup(5);
		const shell = resolveShell(new Map(), security);
		run(first.result.current.handleExecuted, security, shell, "unset NOVA_DIR");
		run(first.result.current.handleExecuted, security, shell, "unset NOVA_DIR");
		expect(reactionTexts("ch5-t4")).toHaveLength(1);
		first.unmount();

		// 重整頁面後旗標還在，一樣不說
		const reloaded = setup(5);
		run(reloaded.result.current.handleExecuted, security, shell, "unset NOVA_DIR");
		expect(reactionTexts("ch5-t4")).toHaveLength(1);
		reloaded.unmount();

		act(() => {
			useGameStore.getState().resetChapter(5);
		});
		expect(useGameStore.getState().storyFlags[novaReactionFlag(5, "unsetNovaDir")]).toBeUndefined();
		const replay = setup(5);
		const freshShell = resolveShell(new Map(), security);
		run(replay.result.current.handleExecuted, security, freshShell, "unset NOVA_DIR");
		expect(reactionTexts("ch5-t4")).toEqual([lineFor("unsetNovaDir", 5)]);
	});

	it("讀到阿彬的留言：收進的系統行之後接 NOVA 一句", () => {
		const { result } = setup(1);
		const medbay = terminal("ch1-t5");
		const shell = resolveShell(new Map(), medbay);

		run(result.current.handleExecuted, medbay, shell, "cat .abin_jokes.txt");

		const tail = transcriptOf("ch1-t5").slice(-2);
		expect(tail[0]).toMatchObject({ kind: "system", id: "abin-note-ch1-jokes" });
		expect(tail[1]).toMatchObject({ kind: "dialogue", text: lineFor("abinNote", 1, { noteId: "ch1-jokes" }) });
	});

	it("第四章寫給阿彬的回信：NOVA 一句", () => {
		useGameStore.setState((state) => ({ progress: { ...state.progress, chapter: 4 } }));
		const { result } = setup(4);
		const archive = terminal("ch4-t5");
		const shell = resolveShell(new Map(), archive);

		run(result.current.handleExecuted, archive, shell, "echo 我醒了 > /home/abin/reply.txt");

		expect(reactionTexts("ch4-t5")).toEqual([lineFor("abinReply", 4)]);
	});

	it("走進阿彬的家目錄", () => {
		const { result } = setup(1);
		const quarters = terminal("ch1-t3");
		const shell = resolveShell(new Map(), quarters);

		run(result.current.handleExecuted, quarters, shell, "cd /home/abin");

		expect(reactionTexts("ch1-t3")).toEqual([lineFor("abinHome", 1)]);
	});

	it("同一台三段提示都看完還在打 hint：第四次 hint 之後 NOVA 吃醋", () => {
		const { result } = setup(1);
		const cryo = terminal("ch1-t1");
		const shell = resolveShell(new Map(), cryo);

		for (let index = 0; index < 3; index += 1) {
			run(result.current.handleExecuted, cryo, shell, "hint");
		}
		expect(reactionTexts("ch1-t1")).toEqual([]);

		run(result.current.handleExecuted, cryo, shell, "hint");
		expect(reactionTexts("ch1-t1")).toEqual([lineFor("hintHeavy", 1)]);
	});

	it("whoami 查自己", () => {
		useGameStore.setState((state) => ({ progress: { ...state.progress, chapter: 2 } }));
		const { result } = setup(2);
		const lobby = terminal("ch2-t1");
		const shell = resolveShell(new Map(), lobby);

		run(result.current.handleExecuted, lobby, shell, "whoami");

		expect(reactionTexts("ch2-t1")).toEqual([lineFor("identity", 2)]);
	});
});

describe("useNovaReactions：同一道指令不連出兩段 NOVA", () => {
	it("過關那一道不插嘴：輸出停在過關台詞，反應留到下一道指令", () => {
		useGameStore.setState((state) => ({ progress: { ...state.progress, chapter: 5 } }));
		const { result } = setup(5);
		const security = terminal("ch5-t4");
		const shell = resolveShell(new Map(), security);
		run(result.current.handleExecuted, security, shell, "chmod 644 scheduler/cron_2028-06-02.log");

		run(result.current.handleExecuted, security, shell, "unset NOVA_DIR ; cat scheduler/cron_2028-06-02.log");

		expect(useGameStore.getState().progress.solvedTerminals).toContain("ch5-t4");
		const solvedLines = security.nova?.onSolved ?? [];
		const tail = transcriptOf("ch5-t4").slice(-solvedLines.length);
		expect(tail.map((entry) => (entry.kind === "dialogue" ? entry.text : ""))).toEqual(solvedLines);
		expect(reactionTexts("ch5-t4")).toEqual([]);
		expect(useGameStore.getState().storyFlags[novaReactionFlag(5, "unsetNovaDir")]).toBeUndefined();

		run(result.current.handleExecuted, security, shell, "ls");
		expect(reactionTexts("ch5-t4")).toEqual([lineFor("unsetNovaDir", 5)]);
	});

	it("別的 NOVA 台詞（例如第 9 次錯誤）撞在同一道指令：不插嘴，下一道再說", () => {
		const cryo = terminal("ch1-t1");
		const shell = resolveShell(new Map(), cryo);
		// 模擬卡關階梯在同一道指令裡先說了一句 NOVA
		let speakFirst = true;
		const inner = vi.fn<InnerExecutedHandler>((definition) => {
			if (speakFirst) {
				useGameStore.getState().appendTranscript(definition.id, createDialogueEntries("nova-error-test", ["你確定你是技師？"]));
			}
			return null;
		});
		const { result } = renderHook(() => useNovaReactions({ chapter: 1, onExecuted: inner }));

		run(result.current.handleExecuted, cryo, shell, "whoami");
		expect(reactionTexts("ch1-t1")).toEqual([]);

		speakFirst = false;
		run(result.current.handleExecuted, cryo, shell, "pwd");
		expect(reactionTexts("ch1-t1")).toEqual([lineFor("identity", 1)]);
		expect(inner).toHaveBeenCalledTimes(2);
	});

	it("一道指令觸發兩種：先說優先的那一句，另一句等下一道", () => {
		const { result } = setup(1);
		const quarters = terminal("ch1-t3");
		const shell = resolveShell(new Map(), quarters);

		run(result.current.handleExecuted, quarters, shell, "cd /home/abin ; whoami");
		expect(reactionTexts("ch1-t3")).toEqual([lineFor("abinHome", 1)]);

		run(result.current.handleExecuted, quarters, shell, "pwd");
		expect(reactionTexts("ch1-t3")).toEqual([lineFor("abinHome", 1), lineFor("identity", 1)]);
	});
});

describe("useNovaReactions：第六章 NOVA 被終止之後", () => {
	it("T4 kill -9 過關之後，任何反應都不說", () => {
		useGameStore.setState((state) => ({
			progress: { ...state.progress, chapter: 6, solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3", "ch6-t4"] },
		}));
		const { result } = setup(6);
		const scheduler = terminal("ch6-t5");
		const shell = resolveShell(new Map(), scheduler);

		run(result.current.handleExecuted, scheduler, shell, "whoami");
		run(result.current.handleExecuted, scheduler, shell, "unset NOVA_DIR");
		for (let index = 0; index < 4; index += 1) {
			run(result.current.handleExecuted, scheduler, shell, "hint");
		}
		run(result.current.handleExecuted, scheduler, shell, "cat ~/.night_shift");

		expect(transcriptOf("ch6-t5").filter((entry) => entry.kind === "dialogue")).toEqual([]);
	});

	it("殺掉核心的那一道觸發的反應不說，留著的也丟掉", () => {
		useGameStore.setState((state) => ({
			progress: { ...state.progress, chapter: 6, solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3"] },
		}));
		const { result } = setup(6);
		const core = terminal("ch6-t4");
		const shell = resolveShell(new Map(), core);

		run(result.current.handleExecuted, core, shell, "whoami ; kill -9 1207");
		expect(useGameStore.getState().progress.solvedTerminals).toContain("ch6-t4");
		run(result.current.handleExecuted, core, shell, "ps");

		expect(reactionTexts("ch6-t4")).toEqual([]);
	});

	it("T4 過關前（不演了）說的是不演的那一句", () => {
		useGameStore.setState((state) => ({
			progress: { ...state.progress, chapter: 6, solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3"] },
		}));
		const { result } = setup(6);
		const core = terminal("ch6-t4");
		const shell = resolveShell(new Map(), core);

		run(result.current.handleExecuted, core, shell, "whoami");

		expect(reactionTexts("ch6-t4")).toEqual(novaReactionLines({ kind: "identity" }, 6, "unmasked"));
	});
});
