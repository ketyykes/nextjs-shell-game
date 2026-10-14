// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTERS, findTerminal } from "@/game/chapters";
import { SOLUTIONS } from "@/game/chapters/solutions";
import { VirtualFileSystem } from "@/game/shell/fs";
import { Shell } from "@/game/shell/shell";
import type { ShellExecution } from "@/game/shell/types";
import { createObjectiveContext, evaluateObjective } from "./objectives";
import { findSolutionInsights, insightFlag, type SolutionInsight } from "./solutionInsight";
import type { ChapterDefinition, TerminalDefinition } from "./types";

function terminal(id: string): TerminalDefinition {
	const definition = findTerminal(id);
	if (definition === undefined) {
		throw new Error(`劇本裡沒有 ${id}`);
	}
	return definition;
}

/** 照正常順序玩到 `id` 之前會學到的東西：前面每一台的 `teaches`。 */
function learnedBefore(id: string): string[] {
	const learned: string[] = [];
	for (const chapter of CHAPTERS) {
		for (const item of chapter.terminals) {
			if (item.id === id) {
				return learned;
			}
			learned.push(...item.teaches);
		}
	}
	throw new Error(`劇本裡沒有 ${id}`);
}

/** 用劇本的 FS、起始目錄、環境變數與程序清單開一個真的 shell。 */
function openTerminal(definition: TerminalDefinition): Shell {
	return new Shell({
		fs: VirtualFileSystem.fromSnapshot(definition.fs),
		terminalId: definition.id,
		hints: definition.hints,
		learnedCommands: [],
		cwd: definition.initialCwd,
		env: definition.env,
		processes: definition.processes,
	});
}

/** 依序執行 `inputs`，最後一行必須讓這台過關（前面的不管），回傳最後一行的執行結果。 */
function solveWith(definition: TerminalDefinition, inputs: readonly string[]): ShellExecution {
	const shell = openTerminal(definition);
	let last: ShellExecution | null = null;
	for (const input of inputs) {
		last = shell.execute(input);
	}
	if (last === null) {
		throw new Error("至少要有一行輸入");
	}
	const context = createObjectiveContext(definition.id, last, shell.fs, shell.home);
	expect(evaluateObjective(definition, context), `「${last.input}」應該讓 ${definition.id} 過關`).toBe(true);
	return last;
}

interface ScenarioOptions {
	/** 過關前的已學清單，預設是照正常順序玩到這台之前學到的。 */
	learned?: readonly string[];
	storyFlags?: Record<string, true>;
	chapters?: readonly ChapterDefinition[];
}

/** 在 `id` 這台照 `inputs` 過關，回傳認可結果。 */
function insightsFor(id: string, inputs: readonly string[], options: ScenarioOptions = {}): SolutionInsight[] {
	const definition = terminal(id);
	const execution = solveWith(definition, inputs);
	return findSolutionInsights({
		execution,
		definition,
		learnedCommands: options.learned ?? learnedBefore(id),
		storyFlags: options.storyFlags ?? {},
		chapters: options.chapters ?? CHAPTERS,
	});
}

function concepts(insights: SolutionInsight[]): string[] {
	return insights.map((insight) => insight.concept);
}

describe("findSolutionInsights：偵測還沒教的指令", () => {
	it("第一章 T1 用管線接 grep：認得 grep（第 2 章）與 |（第 4 章），; 是課表外", () => {
		const insights = insightsFor("ch1-t1", ["ls | grep wake ; cat wake_up.txt"]);

		expect(insights).toEqual([
			{ concept: "grep", chapter: 2, sameChapter: false },
			{ concept: "|", chapter: 4, sameChapter: false },
			{ concept: ";", chapter: null, sameChapter: false },
		]);
	});

	it("第二章 T1 用 head 但同時用了 |：這台本身在教的 head、tail 不算，只認 |", () => {
		const insights = insightsFor("ch2-t1", ["cat access.log | tail -n 3"]);

		expect(insights).toEqual([{ concept: "|", chapter: 4, sameChapter: false }]);
	});

	it("第三章用 tree：課表外的指令標成 chapter null", () => {
		const insights = insightsFor("ch3-t1", ["mkdir repair && tree"]);

		expect(insights).toEqual([
			{ concept: "tree", chapter: null, sameChapter: false },
			{ concept: "&&", chapter: null, sameChapter: false },
		]);
	});

	it("全部都學過時回傳空陣列", () => {
		const learned = [...learnedBefore("ch1-t1"), "grep", "|", ";"];
		expect(insightsFor("ch1-t1", ["ls | grep wake ; cat wake_up.txt"], { learned })).toEqual([]);
	});

	it("照正解一路玩下去，36 台最後一步都不會觸發認可（正解只用教過或這台在教的東西）", () => {
		for (const chapter of CHAPTERS) {
			for (const definition of chapter.terminals) {
				const inputs = SOLUTIONS[definition.id];
				const execution = solveWith(definition, inputs);
				const insights = findSolutionInsights({
					execution,
					definition,
					learnedCommands: learnedBefore(definition.id),
					storyFlags: {},
					chapters: CHAPTERS,
				});
				expect(insights, definition.id).toEqual([]);
			}
		}
	});
});

describe("findSolutionInsights：語法概念", () => {
	it("~ 是第一章 T3 教的，在 T1 用到時標成同一章", () => {
		expect(insightsFor("ch1-t1", ["cat ~/wake_up.txt"])).toEqual([{ concept: "~", chapter: 1, sameChapter: true }]);
	});

	it("萬用字元 * 是第 2 章教的", () => {
		expect(insightsFor("ch1-t1", ["cat wake_up.txt *.txt"])).toEqual([{ concept: "*", chapter: 2, sameChapter: false }]);
	});

	it("$變數 是第 5 章教的", () => {
		expect(insightsFor("ch1-t1", ["cat $HOME/wake_up.txt"])).toEqual([{ concept: "$變數", chapter: 5, sameChapter: false }]);
	});

	it("雙引號裡的 $變數 照樣展開，算用到", () => {
		expect(concepts(insightsFor("ch1-t1", ['cat "$HOME/wake_up.txt"']))).toEqual(["$變數"]);
	});

	it("> 與 >> 分開認", () => {
		expect(concepts(insightsFor("ch1-t1", ["cat wake_up.txt > copy.txt"]))).toEqual([">"]);
		expect(concepts(insightsFor("ch1-t1", ["cat wake_up.txt >> copy.txt"]))).toEqual([">>"]);
	});

	it("引號裡、反斜線跳脫的符號不算：只認真的管線與 grep", () => {
		const insights = insightsFor("ch1-t1", ["cat wake_up.txt | grep '~|*>$HOME;&&' ; cat wake_up.txt | grep \\*"]);

		expect(concepts(insights)).toEqual(["grep", "|", ";"]);
	});

	it("被 && 跳過的那一段不算：沒執行的 tree 不認，&& 本身有用到", () => {
		const insights = insightsFor("ch1-t1", ["cat wake_up.txt ; ls | grep nomatch && tree"]);

		expect(concepts(insights)).toEqual(["grep", "|", ";", "&&"]);
	});

	it("結尾多一個 ; 沒有真的串第二段，不算用到 ;", () => {
		expect(insightsFor("ch1-t1", ["cat wake_up.txt ;"])).toEqual([]);
	});
});

describe("findSolutionInsights：帶旗標的教學", () => {
	it("ls -la 拆成 ls -l 與 ls -a，都是第一章稍後才教", () => {
		expect(insightsFor("ch1-t1", ["ls -la ; cat wake_up.txt"])).toEqual([
			{ concept: "ls -l", chapter: 1, sameChapter: true },
			{ concept: "ls -a", chapter: 1, sameChapter: true },
			{ concept: ";", chapter: null, sameChapter: false },
		]);
	});

	it("這台在教的旗標不算（T3 教 ls -l），下一台才教的 ls -a 照認", () => {
		const learned = learnedBefore("ch1-t3");
		const definition = terminal("ch1-t3");
		const execution = solveWith(definition, ["cat /home/abin/day_900.txt ; ls -la /home/abin"]);
		const insights = findSolutionInsights({ execution, definition, learnedCommands: learned, storyFlags: {}, chapters: CHAPTERS });

		expect(concepts(insights)).toEqual(["ls -a", ";"]);
	});

	it("指令本身也還沒教時只認指令，不另外列它的旗標（grep -r 只顯示 grep）", () => {
		expect(concepts(insightsFor("ch1-t1", ["grep -r 喚醒 . ; cat wake_up.txt"]))).toEqual(["grep", ";"]);
	});

	it("指令學過、旗標還沒教：第二章 T3 用 grep -rn 認得 grep -r", () => {
		const definition = terminal("ch2-t3");
		const execution = solveWith(definition, ["grep -rn LOCK ."]);
		const insights = findSolutionInsights({
			execution,
			definition,
			learnedCommands: learnedBefore("ch2-t3"),
			storyFlags: {},
			chapters: CHAPTERS,
		});

		expect(insights).toEqual([{ concept: "grep -r", chapter: 2, sameChapter: true }]);
	});

	it("chmod 只以 chmod +r、chmod 644 出現在 teaches：用 chmod 時算第 5 章教的指令", () => {
		const insights = insightsFor("ch1-t1", ["chmod 600 wake_up.txt ; chmod +r wake_up.txt ; cat wake_up.txt"]);

		expect(insights).toEqual([
			{ concept: "chmod", chapter: 5, sameChapter: false },
			{ concept: ";", chapter: null, sameChapter: false },
		]);
	});
});

describe("findSolutionInsights：排除", () => {
	it("已經認可過的（劇情旗標 insight.<概念>）不再認可", () => {
		const storyFlags: Record<string, true> = { [insightFlag("grep")]: true, [insightFlag(";")]: true };
		expect(concepts(insightsFor("ch1-t1", ["ls | grep wake ; cat wake_up.txt"], { storyFlags }))).toEqual(["|"]);
	});

	it("hint、help 是遊戲本身的系統指令，不算探索", () => {
		expect(concepts(insightsFor("ch1-t1", ["help ; hint ; cat wake_up.txt"]))).toEqual([";"]);
	});

	it("前面章節教過、只是存檔裡沒學到的（例如跳章）不認：不能說「第 1 章才會正式介紹」", () => {
		expect(insightsFor("ch3-t1", ["cat work_order.txt ; mkdir repair"], { learned: [] })).toEqual([
			{ concept: ";", chapter: null, sameChapter: false },
		]);
	});

	it("教學位置從傳入的章節清單找，不寫死：某章加教 tree 後 tree 就不是課表外", () => {
		const chapters = CHAPTERS.map((chapter) => {
			if (chapter.chapter !== 4) {
				return chapter;
			}
			const [first, ...rest] = chapter.terminals;
			return { ...chapter, terminals: [{ ...first, teaches: [...first.teaches, "tree"] }, ...rest] };
		});

		expect(insightsFor("ch3-t1", ["mkdir repair && tree"], { chapters })).toEqual([
			{ concept: "tree", chapter: 4, sameChapter: false },
			{ concept: "&&", chapter: null, sameChapter: false },
		]);
	});
});

describe("insightFlag", () => {
	it("旗標不以 ch<n>. 開頭，重玩章節不會清掉", () => {
		expect(insightFlag("grep")).toBe("insight.grep");
		expect(insightFlag("ls -a")).toBe("insight.ls -a");
		expect(insightFlag("grep")).not.toMatch(/^ch\d+\./);
	});
});
