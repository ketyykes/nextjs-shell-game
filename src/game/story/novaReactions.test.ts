// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findTerminal } from "@/game/chapters";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { HOME_DIR, type ShellExecution } from "@/game/shell/types";
import { ABIN_NOTES, applyAbinOverlay, findAbinNote } from "./abinNotes";
import { NOVA_REACTION_KINDS, novaReactionFlag } from "./flags";
import {
	decideNovaReaction,
	detectNovaReactions,
	HINT_HEAVY_CHAPTER_COUNT,
	introFollowUpLine,
	novaPhase,
	novaReactionLines,
	type NovaPhase,
	type NovaReactionInput,
	type NovaReactionTrigger,
} from "./novaReactions";
import type { NovaReactionKind, TerminalDefinition } from "./types";

/** 劇本文字的性別檢查，跟各章測試同一條（「其他」「他們」也擋）。 */
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

function terminal(id: string): TerminalDefinition {
	const definition = findTerminal(id);
	if (definition === undefined) {
		throw new Error(`沒有 ${id}`);
	}
	return definition;
}

/** 用劇本快照開一台真的 shell，阿彬的留言照遊戲一樣用覆蓋層補上。 */
function openShell(id: string): Shell {
	const definition = terminal(id);
	const fs = VirtualFileSystem.fromSnapshot(definition.fs);
	applyAbinOverlay(fs, id, { found: [], includeFound: true, reply: null });
	return new Shell({
		fs,
		terminalId: id,
		hints: definition.hints,
		learnedCommands: [],
		cwd: definition.initialCwd,
		env: definition.env,
		processes: definition.processes,
	});
}

/** 偵測用的輸入，沒給的欄位是「什麼都沒發生」。 */
function input(execution: ShellExecution, overrides: Partial<NovaReactionInput> = {}): NovaReactionInput {
	return { execution, abin: null, chapterHints: 0, terminalHints: 0, hintStages: 3, ...overrides };
}

function kinds(triggers: NovaReactionTrigger[]): NovaReactionKind[] {
	return triggers.map((trigger) => trigger.kind);
}

describe("NOVA 的狀態：還在演、不演了、被終止", () => {
	it("第一到五章一律還在演", () => {
		for (let chapter = 1; chapter <= 5; chapter += 1) {
			expect(novaPhase(chapter, ["ch6-t3", "ch6-t4"])).toBe("acting");
		}
	});

	it("第六章讀到身分檔（T3 過關）之後不演了，T4 kill -9 之後被終止", () => {
		expect(novaPhase(6, [])).toBe("acting");
		expect(novaPhase(6, ["ch6-t1", "ch6-t2"])).toBe("acting");
		expect(novaPhase(6, ["ch6-t1", "ch6-t2", "ch6-t3"])).toBe("unmasked");
		expect(novaPhase(6, ["ch6-t1", "ch6-t2", "ch6-t3", "ch6-t4"])).toBe("silenced");
	});
});

describe("偵測：這道指令觸發了哪些反應", () => {
	it("什麼都沒發生就是空的", () => {
		const shell = openShell("ch1-t1");
		expect(detectNovaReactions(input(shell.execute("ls")))).toEqual([]);
	});

	it("新找到阿彬的留言：記下第一則與目前找到幾則", () => {
		const shell = openShell("ch1-t5");
		const note = findAbinNote("ch1-jokes");
		const triggers = detectNovaReactions(
			input(shell.execute("cat .abin_jokes.txt"), { abin: { found: [note!], foundCount: 3, reply: null } }),
		);
		expect(triggers).toEqual([{ kind: "abinNote", noteId: "ch1-jokes", foundCount: 3 }]);
	});

	it("回信被寫入或改寫", () => {
		const shell = openShell("ch4-t5");
		const triggers = detectNovaReactions(
			input(shell.execute("echo 我醒了 > /home/abin/reply.txt"), { abin: { found: [], foundCount: 1, reply: "我醒了" } }),
		);
		expect(kinds(triggers)).toEqual(["abinReply"]);
	});

	it("工作目錄走進 /home/abin 或底下的目錄；名字只是開頭一樣的不算", () => {
		const shell = openShell("ch1-t3");
		expect(kinds(detectNovaReactions(input(shell.execute("cd /home/abin"))))).toEqual(["abinHome"]);
		// 人已經在裡面，打別的指令也算（每章只說一次由旗標擋）
		expect(kinds(detectNovaReactions(input(shell.execute("ls"))))).toEqual(["abinHome"]);
		expect(kinds(detectNovaReactions(input(shell.execute("cd /home/abin/.."))))).toEqual([]);
		shell.execute("cd ~");
		expect(detectNovaReactions(input(shell.execute("ls /home/abin")))).toEqual([]);
		const lookalike: ShellExecution = { ...shell.execute("pwd"), cwd: "/home/abinx" };
		expect(detectNovaReactions(input(lookalike))).toEqual([]);
		const deeper: ShellExecution = { ...shell.execute("pwd"), cwd: "/home/abin/old" };
		expect(kinds(detectNovaReactions(input(deeper)))).toEqual(["abinHome"]);
	});

	it("用 ; 串起來時，任一段跑完當下的工作目錄在阿彬的家目錄就算", () => {
		const shell = openShell("ch1-t3");
		const execution = shell.execute("cd /home/abin ; ls ; cd ~");
		expect(execution.cwd).toBe(HOME_DIR);
		expect(kinds(detectNovaReactions(input(execution)))).toEqual(["abinHome"]);
	});

	it(`hint：本章累計 ${HINT_HEAVY_CHAPTER_COUNT} 次起，或同一台三段都看完還在打`, () => {
		const shell = openShell("ch1-t1");
		const hint = shell.execute("hint");
		expect(detectNovaReactions(input(hint, { chapterHints: HINT_HEAVY_CHAPTER_COUNT - 1, terminalHints: 3 }))).toEqual([]);
		expect(
			kinds(detectNovaReactions(input(hint, { chapterHints: HINT_HEAVY_CHAPTER_COUNT, terminalHints: 1 }))),
		).toEqual(["hintHeavy"]);
		expect(kinds(detectNovaReactions(input(hint, { chapterHints: 4, terminalHints: 4 })))).toEqual(["hintHeavy"]);
		// 不是 hint 的指令，次數再多也不算
		expect(detectNovaReactions(input(shell.execute("ls"), { chapterHints: 20, terminalHints: 9 }))).toEqual([]);
	});

	it("unset NOVA_DIR：那一段跑完 NOVA_DIR 就不在了；別的變數、echo 出來的字都不算", () => {
		const shell = openShell("ch5-t4");
		expect(detectNovaReactions(input(shell.execute("echo unset NOVA_DIR")))).toEqual([]);
		expect(detectNovaReactions(input(shell.execute("unset NOVA_DIRX")))).toEqual([]);
		expect(kinds(detectNovaReactions(input(shell.execute("unset NOVA_DIR"))))).toEqual(["unsetNovaDir"]);
		// 本來就沒有這個變數也算：玩家做的是同一件事
		expect(kinds(detectNovaReactions(input(shell.execute("unset NOVA_DIR"))))).toEqual(["unsetNovaDir"]);
		// 同一行先拿掉再設回去：拿掉的那一段算
		expect(
			kinds(detectNovaReactions(input(shell.execute("unset NOVA_DIR ; export NOVA_DIR=/opt/nova"))))
		).toEqual(["unsetNovaDir"]);
		// 被 && 跳過的不算
		expect(detectNovaReactions(input(shell.execute("cd /nowhere && unset NOVA_DIR")))).toEqual([]);
	});

	it("whoami、id、id tech 是查自己；id abin 與打錯的不算", () => {
		const shell = openShell("ch2-t1");
		expect(kinds(detectNovaReactions(input(shell.execute("whoami"))))).toEqual(["identity"]);
		expect(kinds(detectNovaReactions(input(shell.execute("id"))))).toEqual(["identity"]);
		expect(kinds(detectNovaReactions(input(shell.execute("id tech"))))).toEqual(["identity"]);
		expect(kinds(detectNovaReactions(input(shell.execute("whoami | cat"))))).toEqual(["identity"]);
		expect(detectNovaReactions(input(shell.execute("id abin")))).toEqual([]);
		expect(detectNovaReactions(input(shell.execute("whoami tech")))).toEqual([]);
	});

	it("同一道指令觸發好幾種時依優先順序排：unset、回信、留言、阿彬的家、查自己、hint", () => {
		const shell = openShell("ch4-t5");
		const note = findAbinNote("ch4-reply");
		const execution = shell.execute("cd /home/abin ; cat .plan ; echo 在 > reply.txt ; whoami ; unset NOVA_DIR ; hint");
		const triggers = detectNovaReactions(
			input(execution, {
				abin: { found: [note!], foundCount: 1, reply: "在" },
				chapterHints: HINT_HEAVY_CHAPTER_COUNT,
				terminalHints: 1,
			}),
		);
		expect(kinds(triggers)).toEqual(["unsetNovaDir", "abinReply", "abinNote", "abinHome", "identity", "hintHeavy"]);
	});
});

/** 每章每種狀態下的台詞，測文字規則用。 */
function everyLine(): { label: string; lines: string[] }[] {
	const result: { label: string; lines: string[] }[] = [];
	const phases: NovaPhase[] = ["acting", "unmasked"];
	for (let chapter = 1; chapter <= 6; chapter += 1) {
		for (const phase of phases) {
			for (const kind of NOVA_REACTION_KINDS) {
				if (kind === "abinNote") {
					for (const note of ABIN_NOTES) {
						const lines = novaReactionLines({ kind, noteId: note.id, foundCount: 4 }, chapter, phase);
						if (lines !== null) {
							result.push({ label: `${chapter} ${phase} ${note.id}`, lines });
						}
					}
					continue;
				}
				const lines = novaReactionLines({ kind }, chapter, phase);
				if (lines !== null) {
					result.push({ label: `${chapter} ${phase} ${kind}`, lines });
				}
			}
		}
	}
	return result;
}

describe("台詞", () => {
	it("每種反應都是一句，不指涉性別", () => {
		const all = everyLine();
		expect(all.length).toBeGreaterThan(20);
		for (const { label, lines } of all) {
			expect(lines, label).toHaveLength(1);
			expect(lines[0].length, label).toBeGreaterThan(0);
			expect(GENDERED_PATTERN.test(lines[0]), `${label}：${lines[0]}`).toBe(false);
		}
	});

	it("hint 與查自己：六章都有；第六章不演了之後換一句", () => {
		for (const kind of ["hintHeavy", "identity"] as const) {
			for (let chapter = 1; chapter <= 6; chapter += 1) {
				expect(novaReactionLines({ kind }, chapter, "acting"), `${kind} ${chapter}`).not.toBeNull();
			}
			expect(novaReactionLines({ kind }, 6, "unmasked")).not.toEqual(novaReactionLines({ kind }, 6, "acting"));
		}
	});

	it("unset NOVA_DIR 只在第五章起有台詞：前四章還沒揭露那三秒", () => {
		for (let chapter = 1; chapter <= 4; chapter += 1) {
			expect(novaReactionLines({ kind: "unsetNovaDir" }, chapter, "acting"), String(chapter)).toBeNull();
		}
		expect(novaReactionLines({ kind: "unsetNovaDir" }, 5, "acting")).not.toBeNull();
		expect(novaReactionLines({ kind: "unsetNovaDir" }, 6, "acting")).not.toBeNull();
		expect(novaReactionLines({ kind: "unsetNovaDir" }, 6, "unmasked")).not.toBeNull();
	});

	it("回信只有第四章；阿彬的家目錄只在有那個目錄的第一章、第四章", () => {
		expect(novaReactionLines({ kind: "abinReply" }, 4, "acting")).not.toBeNull();
		for (const chapter of [1, 2, 3, 5, 6]) {
			expect(novaReactionLines({ kind: "abinReply" }, chapter, "acting"), String(chapter)).toBeNull();
		}
		expect(novaReactionLines({ kind: "abinHome" }, 1, "acting")).not.toBeNull();
		expect(novaReactionLines({ kind: "abinHome" }, 4, "acting")).not.toBeNull();
		for (const chapter of [2, 3, 5, 6]) {
			expect(novaReactionLines({ kind: "abinHome" }, chapter, "acting"), String(chapter)).toBeNull();
		}
	});

	it("留言的台詞跟著那一則；第五章那則帶著找到幾則；第六章那則在 NOVA 被終止後的終端機，沒有台詞", () => {
		for (const note of ABIN_NOTES.filter((item) => item.chapter <= 5)) {
			expect(novaReactionLines({ kind: "abinNote", noteId: note.id, foundCount: 1 }, note.chapter, "acting"), note.id).not.toBeNull();
		}
		expect(novaReactionLines({ kind: "abinNote", noteId: "ch5-rations", foundCount: 6 }, 5, "acting")?.[0]).toContain(
			"第 6 份",
		);
		expect(novaReactionLines({ kind: "abinNote", noteId: "ch6-shift", foundCount: 8 }, 6, "acting")).toBeNull();
		expect(novaReactionLines({ kind: "abinNote", noteId: "nope", foundCount: 1 }, 1, "acting")).toBeNull();
	});

	it("NOVA 被終止之後什麼都沒有", () => {
		for (const kind of NOVA_REACTION_KINDS) {
			expect(novaReactionLines({ kind, noteId: "ch6-shift", foundCount: 8 }, 6, "silenced"), kind).toBeNull();
		}
	});

	it("提到的路徑與程序都是真的：第一章的家目錄、第六章 ps 裡玩家的 -sh 與啟動時間", () => {
		expect(novaReactionLines({ kind: "abinHome" }, 1, "acting")?.[0]).toContain(HOME_DIR);
		const identity = novaReactionLines({ kind: "identity" }, 6, "acting")?.[0] ?? "";
		expect(identity).toContain("最下面那個 -sh");
		// 第六章還在演的三台（T1 到 T3）：ps 最下面一列都是玩家自己的 -sh，啟動時間跟台詞一樣
		for (const id of ["ch6-t1", "ch6-t2", "ch6-t3"]) {
			const lastRow = openShell(id).execute("ps").lines.at(-1) ?? "";
			expect(lastRow, id).toMatch(/ -sh$/);
			expect(lastRow, id).toContain(identity.match(/\d\d:\d\d/)?.[0] ?? "沒有時間");
		}
	});
});

describe("決定這道指令要不要說", () => {
	const unset: NovaReactionTrigger = { kind: "unsetNovaDir" };
	const identity: NovaReactionTrigger = { kind: "identity" };
	const hintHeavy: NovaReactionTrigger = { kind: "hintHeavy" };

	it("說優先的那一句並給出要立的旗標，其餘的留到下一道指令", () => {
		const decision = decideNovaReaction({
			chapter: 5,
			phase: "acting",
			storyFlags: {},
			pending: [],
			detected: [unset, identity],
			novaAlreadySpoke: false,
		});
		expect(decision.say?.kind).toBe("unsetNovaDir");
		expect(decision.say?.flag).toBe(novaReactionFlag(5, "unsetNovaDir"));
		expect(decision.say?.lines).toEqual(novaReactionLines(unset, 5, "acting"));
		expect(decision.pending).toEqual([identity]);
	});

	it("這一章說過的（旗標在）不再說", () => {
		const decision = decideNovaReaction({
			chapter: 5,
			phase: "acting",
			storyFlags: { [novaReactionFlag(5, "unsetNovaDir")]: true },
			pending: [],
			detected: [unset],
			novaAlreadySpoke: false,
		});
		expect(decision).toEqual({ say: null, pending: [] });
	});

	it("別章的旗標不影響這一章", () => {
		const decision = decideNovaReaction({
			chapter: 2,
			phase: "acting",
			storyFlags: { [novaReactionFlag(1, "identity")]: true },
			pending: [],
			detected: [identity],
			novaAlreadySpoke: false,
		});
		expect(decision.say?.flag).toBe("ch2.nova.identity");
	});

	it("這道指令 NOVA 已經說過話（過關、卡關、第 9 次錯誤）：不說，全部留到下一道", () => {
		const decision = decideNovaReaction({
			chapter: 5,
			phase: "acting",
			storyFlags: {},
			pending: [],
			detected: [unset, identity],
			novaAlreadySpoke: true,
		});
		expect(decision).toEqual({ say: null, pending: [unset, identity] });
	});

	it("留下來的先說，同一種只留一個", () => {
		const decision = decideNovaReaction({
			chapter: 5,
			phase: "acting",
			storyFlags: {},
			pending: [identity],
			detected: [unset, identity, hintHeavy],
			novaAlreadySpoke: false,
		});
		expect(decision.say?.kind).toBe("identity");
		expect(decision.pending).toEqual([unset, hintHeavy]);
	});

	it("這一章沒有台詞的反應直接丟掉，不留", () => {
		const decision = decideNovaReaction({
			chapter: 2,
			phase: "acting",
			storyFlags: {},
			pending: [],
			detected: [unset, { kind: "abinHome" }],
			novaAlreadySpoke: true,
		});
		expect(decision).toEqual({ say: null, pending: [] });
	});

	it("NOVA 被終止之後：不說，留著的也全部丟掉", () => {
		const decision = decideNovaReaction({
			chapter: 6,
			phase: "silenced",
			storyFlags: {},
			pending: [identity],
			detected: [hintHeavy],
			novaAlreadySpoke: false,
		});
		expect(decision).toEqual({ say: null, pending: [] });
	});

	it("第六章不演了之後說的是不演的那一句", () => {
		const decision = decideNovaReaction({
			chapter: 6,
			phase: "unmasked",
			storyFlags: {},
			pending: [],
			detected: [hintHeavy],
			novaAlreadySpoke: false,
		});
		expect(decision.say?.lines).toEqual(novaReactionLines(hintHeavy, 6, "unmasked"));
		expect(decision.say?.lines).not.toEqual(novaReactionLines(hintHeavy, 6, "acting"));
	});
});

describe("開場多一句：看前一章的阿彬留言（E3）", () => {
	it("第一章沒有前一章", () => {
		expect(introFollowUpLine(1, { found: ABIN_NOTES.map((note) => note.id), reply: "在" })).toBeNull();
	});

	it("前一章一則都沒找到就不加", () => {
		for (let chapter = 2; chapter <= 6; chapter += 1) {
			expect(introFollowUpLine(chapter, { found: [], reply: null }), String(chapter)).toBeNull();
		}
		// 找到的是別章的也不算
		expect(introFollowUpLine(3, { found: ["ch1-jokes"], reply: null })).toBeNull();
	});

	it("前一章找到過留言就多一句，每章一句、不指涉性別", () => {
		const seen = new Set<string>();
		for (let chapter = 2; chapter <= 6; chapter += 1) {
			const previous = ABIN_NOTES.filter((note) => note.chapter === chapter - 1).map((note) => note.id);
			for (const id of previous) {
				const line = introFollowUpLine(chapter, { found: [id], reply: null });
				expect(line, `${chapter} ${id}`).not.toBeNull();
				expect(GENDERED_PATTERN.test(line ?? ""), line ?? "").toBe(false);
				seen.add(line ?? "");
			}
		}
		expect(seen.size).toBe(5);
	});

	it("第五章：第四章寫過回信就換成回信那一句", () => {
		const withReply = introFollowUpLine(5, { found: [], reply: "我醒了" });
		const withNote = introFollowUpLine(5, { found: ["ch4-relay"], reply: null });
		expect(withReply).not.toBeNull();
		expect(withReply).not.toEqual(withNote);
		expect(introFollowUpLine(5, { found: ["ch4-relay"], reply: "我醒了" })).toEqual(withReply);
		// 回信的原文 NOVA 不念出來（第六章記憶庫才揭露它讀過）
		expect(withReply).not.toContain("我醒了");
	});
});
