// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTERS, findTerminal } from "@/game/chapters";
import { extractHintSteps } from "@/game/chapters/hintCommands";
import { SOLUTIONS } from "@/game/chapters/solutions";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import { canRead, type ShellExecution } from "@/game/shell/types";
import {
	ABIN_NOTE_TOTAL,
	ABIN_NOTES,
	ABIN_OWNER,
	ABIN_REPLY_MAX_LENGTH,
	ABIN_REPLY_PATH,
	ABIN_REPLY_TERMINAL_ID,
	abinEvidenceFiles,
	abinNotesByTime,
	applyAbinOverlay,
	countFoundAbinNotes,
	findAbinNote,
	readAbinReply,
	revealedAbinNotes,
	sanitizeReplyText,
	type AbinNote,
	type AbinOverlayOptions,
} from "./abinNotes";
import { createObjectiveContext, evaluateObjective, visibleOutputLines } from "./objectives";
import { terminalScriptHash } from "./scriptHash";
import type { TerminalDefinition } from "./types";

const ALL_TERMINALS: TerminalDefinition[] = CHAPTERS.flatMap((chapter) => chapter.terminals);

/** 劇本文字的性別檢查，跟各章測試同一條（「其他」「他們」也擋）。 */
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

/** 撤離的時間點（各章同一個）。 */
const EVACUATION = Date.parse("2028-06-02T04:40:00Z");

/** 第一章宿舍那份兩天前修改的 day_900.txt：設計文件 4.3 定案，這是阿彬留給玩家的最後一則訊息。 */
function lastMessageTime(): number {
	const quarters = findTerminal("ch1-t3");
	if (quarters === undefined) {
		throw new Error("找不到 ch1-t3");
	}
	return Date.parse(VirtualFileSystem.fromSnapshot(quarters.fs).getFile("/", "/home/abin/day_900.txt").mtime);
}

function terminalOf(note: AbinNote): TerminalDefinition {
	const terminal = findTerminal(note.terminalId);
	if (terminal === undefined) {
		throw new Error(`劇本裡沒有 ${note.terminalId}`);
	}
	return terminal;
}

/** 照遊戲開終端機的方式建 Shell；有給覆蓋層選項就先補寫。 */
function openTerminal(terminal: TerminalDefinition, overlay?: AbinOverlayOptions): Shell {
	const fs = VirtualFileSystem.fromSnapshot(terminal.fs);
	if (overlay !== undefined) {
		applyAbinOverlay(fs, terminal.id, overlay);
	}
	return new Shell({
		fs,
		terminalId: terminal.id,
		hints: terminal.hints,
		learnedCommands: [],
		cwd: terminal.initialCwd,
		env: terminal.env,
		processes: terminal.processes,
	});
}

/** 全新建立的終端機：每則都補，沒有回信。 */
const FRESH: AbinOverlayOptions = { found: [], includeFound: true, reply: null };
/** 最長的回信，用來量檔案大小的上限。 */
const LONGEST_REPLY = "回".repeat(ABIN_REPLY_MAX_LENGTH);
const WITH_REPLY: AbinOverlayOptions = { found: [], includeFound: true, reply: LONGEST_REPLY };

/** 執行結果裡玩家看得到的東西，用來比對有沒有覆蓋層時輸出一不一樣。 */
function visible(execution: ShellExecution): string[] {
	return [...visibleOutputLines(execution), execution.isError ? "<error>" : "<ok>"];
}

/** 終端機在全劇本裡的順序（章、台），比對「教過」用。 */
function terminalOrder(terminalId: string): number {
	return ALL_TERMINALS.findIndex((terminal) => terminal.id === terminalId);
}

/** 第一台教 `teach` 的終端機在全劇本裡的順序，沒有回傳 -1。 */
function taughtAt(teach: string): number {
	return ALL_TERMINALS.findIndex((terminal) => terminal.teaches.includes(teach));
}

describe("留言資料", () => {
	it(`總共 ${ABIN_NOTE_TOTAL} 則：第一章 1、第二章 2、第三章 1、第四章 2、第五章 1、第六章 1，id 不重複`, () => {
		expect(ABIN_NOTES).toHaveLength(8);
		expect(ABIN_NOTE_TOTAL).toBe(8);
		const perChapter = [1, 2, 3, 4, 5, 6].map((chapter) => ABIN_NOTES.filter((note) => note.chapter === chapter).length);
		expect(perChapter).toEqual([1, 2, 1, 2, 1, 1]);
		expect(new Set(ABIN_NOTES.map((note) => note.id)).size).toBe(8);
	});

	it("每則都放在那一章劇本裡真的存在的終端機，路徑是絕對路徑、劇本快照裡原本沒有", () => {
		for (const note of ABIN_NOTES) {
			const terminal = terminalOf(note);
			expect(terminal.id.startsWith(`ch${note.chapter}-`), note.id).toBe(true);
			expect(note.path.startsWith("/"), note.id).toBe(true);
			expect(VirtualFileSystem.fromSnapshot(terminal.fs).exists("/", note.path), note.id).toBe(false);
		}
	});

	it("時間都早於第一章 day_900.txt（阿彬的最後一則訊息），玩家帳號讀得到", () => {
		const last = lastMessageTime();
		for (const note of ABIN_NOTES) {
			expect(Date.parse(note.mtime), note.id).toBeLessThan(last);
			expect(Number.isNaN(Date.parse(note.mtime)), note.id).toBe(false);
			const node = { type: "file" as const, name: "x", content: "", mtime: note.mtime, owner: ABIN_OWNER, mode: note.mode };
			expect(canRead(node), note.id).toBe(true);
		}
	});

	it("signature 是留言裡某一整行（或其中一段），在同一台終端機的劇本檔案與別則留言裡都不會出現", () => {
		for (const note of ABIN_NOTES) {
			expect(note.signature.length, note.id).toBeGreaterThanOrEqual(8);
			const linesWithSignature = note.content.split("\n").filter((line) => line.includes(note.signature));
			expect(linesWithSignature, note.id).toHaveLength(1);

			const scriptText = JSON.stringify(terminalOf(note).fs);
			expect(scriptText.includes(note.signature), note.id).toBe(false);
			for (const other of ABIN_NOTES) {
				if (other.id !== note.id) {
					expect(other.content.includes(note.signature), `${note.id} 的 signature 出現在 ${other.id}`).toBe(false);
				}
			}
		}
	});

	it("內容與線索不指涉性別（「他」「她」連「其他」「他們」都擋）", () => {
		for (const note of ABIN_NOTES) {
			expect(GENDERED_PATTERN.test(note.content), note.id).toBe(false);
			expect(GENDERED_PATTERN.test(note.clue), note.id).toBe(false);
			expect(note.clue.length, note.id).toBeGreaterThan(0);
		}
	});

	it("線索剛進那一章就看得到，不提 NOVA 做了什麼（搬走、保管這類事要到終端機裡才揭露）", () => {
		// 例如第三章 T6 才揭露 NOVA 把設定與鑰匙搬去 /var/nova/hold「保管」
		const REVEAL_PATTERN = /NOVA|nova|保管|搬走|收走/;
		for (const note of ABIN_NOTES) {
			expect(REVEAL_PATTERN.test(note.clue), `${note.id}：${note.clue}`).toBe(false);
		}
	});

	it("findAbinNote 依 id 找，countFoundAbinNotes 只算認得而且不重複的 id", () => {
		const first = ABIN_NOTES[0];
		expect(findAbinNote(first.id)).toBe(first);
		expect(findAbinNote("沒有這則")).toBeUndefined();
		expect(countFoundAbinNotes([first.id, first.id, "沒有這則"])).toBe(1);
		expect(countFoundAbinNotes(ABIN_NOTES.map((note) => note.id))).toBe(8);
	});
});

describe("時間線與語氣", () => {
	it("abinNotesByTime 依留言時間由舊到新", () => {
		const sorted = abinNotesByTime();
		expect(sorted).toHaveLength(8);
		const times = sorted.map((note) => Date.parse(note.mtime));
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it("撤離後的留言一則比一則短，撤離前的每一則都比撤離後的長", () => {
		const sorted = abinNotesByTime();
		const lengthOf = (note: AbinNote) => Array.from(note.content).length;
		const before = sorted.filter((note) => Date.parse(note.mtime) < EVACUATION);
		const after = sorted.filter((note) => Date.parse(note.mtime) > EVACUATION);
		expect(before.length).toBeGreaterThan(0);
		expect(after.length).toBeGreaterThan(0);

		for (let index = 1; index < after.length; index += 1) {
			expect(lengthOf(after[index]), `${after[index].id} 應該比 ${after[index - 1].id} 短`).toBeLessThan(
				lengthOf(after[index - 1]),
			);
		}
		const longestAfter = Math.max(...after.map(lengthOf));
		for (const note of before) {
			expect(lengthOf(note), note.id).toBeGreaterThan(longestAfter);
		}
	});
});

describe("放置位置", () => {
	it("找法要用的指令，在留言那台之前的終端機就教過了", () => {
		for (const note of ABIN_NOTES) {
			expect(note.requires.length, note.id).toBeGreaterThan(0);
			for (const teach of note.requires) {
				const taught = taughtAt(teach);
				expect(taught, `${teach} 沒有任何一台教過`).toBeGreaterThanOrEqual(0);
				expect(taught, `${note.id} 用到的 ${teach} 要在 ${note.terminalId} 之前教`).toBeLessThan(terminalOrder(note.terminalId));
			}
		}
	});

	it("回信那台在教 echo 與 > 之後，而且就是請玩家回信的那則留言所在的終端機", () => {
		const order = terminalOrder(ABIN_REPLY_TERMINAL_ID);
		expect(taughtAt("echo")).toBeLessThan(order);
		expect(taughtAt(">")).toBeLessThan(order);
		const asking = ABIN_NOTES.filter((note) => note.content.includes(ABIN_REPLY_PATH));
		expect(asking).toHaveLength(1);
		expect(asking[0].terminalId).toBe(ABIN_REPLY_TERMINAL_ID);
		expect(asking[0].chapter).toBe(4);
	});
});

describe("覆蓋層 applyAbinOverlay", () => {
	it("全新建立：這台的留言照劇本的樣子寫進去（擁有者 abin、留言的時間與權限），回傳寫了哪些路徑", () => {
		for (const note of ABIN_NOTES) {
			const fs = VirtualFileSystem.fromSnapshot(terminalOf(note).fs);
			const written = applyAbinOverlay(fs, note.terminalId, FRESH);

			expect(written, note.id).toContain(note.path);
			expect(fs.getFile("/", note.path), note.id).toMatchObject({
				content: note.content,
				owner: ABIN_OWNER,
				mtime: note.mtime,
				mode: note.mode,
			});
		}
	});

	it("沒有留言的終端機什麼都不寫", () => {
		const cryo = findTerminal("ch1-t1") as TerminalDefinition;
		const fs = VirtualFileSystem.fromSnapshot(cryo.fs);
		const before = JSON.stringify(fs.serialize());

		expect(applyAbinOverlay(fs, cryo.id, FRESH)).toEqual([]);
		expect(JSON.stringify(fs.serialize())).toBe(before);
	});

	it("冪等：已經在的不再寫，第二次呼叫什麼都不寫", () => {
		const note = ABIN_NOTES[0];
		const fs = VirtualFileSystem.fromSnapshot(terminalOf(note).fs);
		applyAbinOverlay(fs, note.terminalId, FRESH);
		const before = JSON.stringify(fs.serialize());

		expect(applyAbinOverlay(fs, note.terminalId, FRESH)).toEqual([]);
		expect(JSON.stringify(fs.serialize())).toBe(before);
	});

	it("還原存檔時（includeFound: false）：還沒找到而且不見了的補回去，已經找到的不補（玩家自己刪掉就尊重）", () => {
		const note = ABIN_NOTES[0];
		const fs = VirtualFileSystem.fromSnapshot(terminalOf(note).fs);

		expect(applyAbinOverlay(fs, note.terminalId, { found: [note.id], includeFound: false, reply: null })).toEqual([]);
		expect(fs.exists("/", note.path)).toBe(false);

		expect(applyAbinOverlay(fs, note.terminalId, { found: [], includeFound: false, reply: null })).toEqual([note.path]);
		expect(fs.exists("/", note.path)).toBe(true);
	});

	it("路徑上已經有玩家的東西就不覆蓋", () => {
		const note = ABIN_NOTES[0];
		const fs = VirtualFileSystem.fromSnapshot(terminalOf(note).fs);
		fs.seedFile(note.path, "玩家自己寫的", { mtime: "2031-03-12T09:00:00Z", owner: "tech", mode: "rw-r--r--" });

		applyAbinOverlay(fs, note.terminalId, FRESH);

		expect(fs.readFile("/", note.path)).toBe("玩家自己寫的");
	});

	it("回信那台不管留言找到沒都有 /home/abin，回信才寫得進去", () => {
		const terminal = findTerminal(ABIN_REPLY_TERMINAL_ID) as TerminalDefinition;
		const replyNote = ABIN_NOTES.find((note) => note.terminalId === ABIN_REPLY_TERMINAL_ID) as AbinNote;
		const fs = VirtualFileSystem.fromSnapshot(terminal.fs);

		applyAbinOverlay(fs, terminal.id, { found: [replyNote.id], includeFound: false, reply: null });

		expect(fs.getDir("/", "/home/abin").owner).toBe(ABIN_OWNER);
		expect(fs.exists("/", replyNote.path)).toBe(false);
	});

	it("不改劇本：套用前後每台的劇本內容雜湊都一樣", () => {
		for (const terminal of ALL_TERMINALS) {
			const before = terminalScriptHash(terminal);
			applyAbinOverlay(VirtualFileSystem.fromSnapshot(terminal.fs), terminal.id, WITH_REPLY);
			expect(terminalScriptHash(terminal), terminal.id).toBe(before);
		}
	});
});

describe("回信的兩份證據", () => {
	it("沒有回信就不產生", () => {
		expect(abinEvidenceFiles(null)).toEqual([]);
	});

	it("有回信：第五章稽核紀錄寫著 abin 在玩家寫完之後讀過 reply.txt；第六章記憶庫多一份引用原句的記憶檔", () => {
		const files = abinEvidenceFiles("我醒了，你在哪");
		expect(files.map((file) => file.terminalId).sort()).toEqual(["ch5-t4", "ch6-t3"]);

		const audit = files.find((file) => file.terminalId === "ch5-t4");
		const auditLines = audit?.content.split("\n") ?? [];
		const writeIndex = auditLines.findIndex((line) => /tech\s+寫入/.test(line) && line.includes(ABIN_REPLY_PATH));
		const readIndex = auditLines.findIndex((line) => /abin\s+讀取/.test(line) && line.includes(ABIN_REPLY_PATH));
		expect(writeIndex).toBeGreaterThanOrEqual(0);
		expect(readIndex).toBeGreaterThan(writeIndex);
		expect(audit?.content.includes("我醒了，你在哪")).toBe(false);

		const memory = files.find((file) => file.terminalId === "ch6-t3");
		expect(memory?.path.endsWith(".mem")).toBe(true);
		expect(memory?.owner).toBe("nova");
		expect(memory?.content).toContain("「我醒了，你在哪」");

		for (const file of files) {
			expect(Date.parse(file.mtime), file.path).toBeGreaterThan(Date.parse("2031-03-12T08:15:00Z"));
			expect(GENDERED_PATTERN.test(file.content), file.path).toBe(false);
		}
	});

	it("覆蓋層在有回信時把證據寫進對應的終端機，沒有回信時不寫", () => {
		for (const terminalId of ["ch5-t4", "ch6-t3"]) {
			const terminal = findTerminal(terminalId) as TerminalDefinition;
			const evidence = abinEvidenceFiles("我醒了").find((file) => file.terminalId === terminalId);
			const path = evidence?.path ?? "";

			const without = VirtualFileSystem.fromSnapshot(terminal.fs);
			applyAbinOverlay(without, terminalId, { found: [], includeFound: false, reply: null });
			expect(without.exists("/", path), terminalId).toBe(false);

			const withReply = VirtualFileSystem.fromSnapshot(terminal.fs);
			applyAbinOverlay(withReply, terminalId, { found: [], includeFound: false, reply: "我醒了" });
			expect(withReply.readFile("/", path), terminalId).toBe(evidence?.content);
		}
	});
});

describe("每則都能用該章學過的指令實際找到", () => {
	for (const note of ABIN_NOTES) {
		it(`${note.id}（${note.terminalId}）：${note.howToFind.join(" → ")}`, () => {
			const shell = openTerminal(terminalOf(note), FRESH);
			let last: ShellExecution | null = null;
			for (const input of note.howToFind) {
				last = shell.execute(input);
				expect(last.isError, `「${input}」不該失敗：${last.lines.join(" / ")}`).toBe(false);
			}

			expect(last).not.toBeNull();
			const execution = last as ShellExecution;
			expect(revealedAbinNotes(note.terminalId, execution, []).map((found) => found.id)).toEqual([note.id]);
			// 已經找到的不再回報；換一台終端機看到同樣的字也不算
			expect(revealedAbinNotes(note.terminalId, execution, [note.id])).toEqual([]);
			expect(revealedAbinNotes("ch1-t1", execution, [])).toEqual([]);
		});
	}
});

describe("「找到了」的定義：這次看得到 signature 那一行才算", () => {
	const backup = ABIN_NOTES.find((note) => note.id === "ch2-backup") as AbinNote;

	it("grep 只撈到留言的別行（例如搜「快照」）不算，撈到 signature 那行才算", () => {
		const shell = openTerminal(terminalOf(backup), FRESH);
		const partial = shell.execute("grep -r 快照 /deck2/backup");
		expect(partial.lines.length).toBeGreaterThan(0);
		expect(revealedAbinNotes(backup.terminalId, partial, [])).toEqual([]);

		const signed = shell.execute("grep -r abin /deck2/backup");
		expect(revealedAbinNotes(backup.terminalId, signed, []).map((note) => note.id)).toEqual(["ch2-backup"]);
	});

	it("用 less 讀（內容在分頁器裡、不在輸出行）也算", () => {
		const shell = openTerminal(terminalOf(backup), FRESH);
		const execution = shell.execute(`less ${backup.path}`);
		expect(execution.pagers).toHaveLength(1);
		expect(revealedAbinNotes(backup.terminalId, execution, []).map((note) => note.id)).toEqual(["ch2-backup"]);
	});

	it("用 ; 串起來的其中一段讀到也算", () => {
		const shell = openTerminal(terminalOf(backup), FRESH);
		const execution = shell.execute(`pwd ; cat ${backup.path}`);
		expect(execution.segments).toHaveLength(2);
		expect(revealedAbinNotes(backup.terminalId, execution, []).map((note) => note.id)).toEqual(["ch2-backup"]);
	});

	it("只列出檔名（ls、find）不算", () => {
		const shell = openTerminal(terminalOf(backup), FRESH);
		const execution = shell.execute('find /deck2/backup -name "*abin*"');
		expect(execution.lines.join("\n")).toContain("abin_");
		expect(revealedAbinNotes(backup.terminalId, execution, [])).toEqual([]);
	});
});

describe("正解與提示不受覆蓋層影響", () => {
	for (const terminal of ALL_TERMINALS) {
		it(`${terminal.id} ${terminal.title}：照正解打，每一步的輸出跟沒有覆蓋層時一模一樣，只有最後一步過關`, () => {
			const plain = openTerminal(terminal);
			const overlaid = openTerminal(terminal, FRESH);
			const steps = SOLUTIONS[terminal.id] ?? [];
			const solved = steps.map((input) => {
				const expected = plain.execute(input);
				const actual = overlaid.execute(input);
				expect(visible(actual), `「${input}」的輸出被覆蓋層改到了`).toEqual(visible(expected));
				return evaluateObjective(terminal, createObjectiveContext(terminal.id, actual, overlaid.fs, overlaid.home));
			});
			expect(solved.slice(0, -1)).not.toContain(true);
			expect(solved.at(-1)).toBe(true);
		});

		it(`${terminal.id} ${terminal.title}：三段提示裡的指令照抄，輸出跟沒有覆蓋層時一模一樣`, () => {
			const plain = openTerminal(terminal);
			const overlaid = openTerminal(terminal, FRESH);
			for (const step of terminal.hints.flatMap((hint) => extractHintSteps(hint))) {
				let input = step.input;
				if (step.pressTab) {
					const expectedCompletion = plain.complete(input);
					expect(overlaid.complete(input), `「${input}」的 Tab 補全被覆蓋層改到了`).toEqual(expectedCompletion);
					input = expectedCompletion.completed;
				}
				expect(visible(overlaid.execute(input)), `「${input}」`).toEqual(visible(plain.execute(input)));
			}
		});

		it(`${terminal.id} ${terminal.title}：有回信證據時照正解打一樣不出錯、只有最後一步過關`, () => {
			const shell = openTerminal(terminal, WITH_REPLY);
			const solved = (SOLUTIONS[terminal.id] ?? []).map((input) => {
				const execution = shell.execute(input);
				expect(execution.isError, `「${input}」不該失敗`).toBe(false);
				return evaluateObjective(terminal, createObjectiveContext(terminal.id, execution, shell.fs, shell.home));
			});
			expect(solved.slice(0, -1)).not.toContain(true);
			expect(solved.at(-1)).toBe(true);
		});
	}
});

describe("加上覆蓋層後每台仍在 40 個檔案、序列化 20 KB 以內", () => {
	for (const terminal of ALL_TERMINALS) {
		it(terminal.id, () => {
			const fs = VirtualFileSystem.fromSnapshot(terminal.fs);
			applyAbinOverlay(fs, terminal.id, WITH_REPLY);
			const serialized = JSON.stringify(fs.serialize());
			const fileCount = (serialized.match(/"type":"file"/g) ?? []).length;
			expect(fileCount).toBeLessThanOrEqual(40);
			expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(20 * 1024);
		});
	}
});

describe("回信", () => {
	it("sanitizeReplyText：取第一個非空行，去頭尾空白與控制字元，限制長度；全是空白回 null", () => {
		expect(sanitizeReplyText("\n\n  我醒了  \n第二行\n")).toBe("我醒了");
		expect(sanitizeReplyText("我\u0007醒\u001b[31m了")).toBe("我醒[31m了");
		expect(sanitizeReplyText("左‮右")).toBe("左右");
		expect(sanitizeReplyText("回".repeat(ABIN_REPLY_MAX_LENGTH + 10))).toBe("回".repeat(ABIN_REPLY_MAX_LENGTH));
		expect(sanitizeReplyText("   \n\t\n")).toBeNull();
		expect(sanitizeReplyText("")).toBeNull();
	});

	it("readAbinReply：照玩家用 echo 寫進去的內容讀，> 改寫就換成新的，>> 追加不影響第一行", () => {
		const terminal = findTerminal(ABIN_REPLY_TERMINAL_ID) as TerminalDefinition;
		const shell = openTerminal(terminal, FRESH);
		expect(readAbinReply(shell.fs)).toBeNull();

		expect(shell.execute(`echo 我醒了 > ${ABIN_REPLY_PATH}`).isError).toBe(false);
		expect(readAbinReply(shell.fs)).toBe("我醒了");

		shell.execute(`echo 第二句 >> ${ABIN_REPLY_PATH}`);
		expect(readAbinReply(shell.fs)).toBe("我醒了");

		shell.execute(`echo 改了 > ${ABIN_REPLY_PATH}`);
		expect(readAbinReply(shell.fs)).toBe("改了");

		shell.execute(`rm ${ABIN_REPLY_PATH}`);
		expect(readAbinReply(shell.fs)).toBeNull();
	});
});
