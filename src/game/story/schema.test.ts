// @vitest-environment node
import { describe, expect, it } from "vitest";
import { catFile } from "./objectives";
import { chapterDefinitionSchema, terminalDefinitionSchema, validateChapter } from "./schema";
import type { ChapterDefinition, TerminalDefinition } from "./types";

/** 合法的終端機定義，測試用覆寫的方式弄壞某個欄位。 */
function validTerminal(overrides: Partial<TerminalDefinition> = {}): TerminalDefinition {
	return {
		id: "ch1-t1",
		title: "冷凍艙控制台",
		roomId: "cryo",
		teaches: ["pwd", "ls"],
		fs: { home: { tech: { "wake_up.txt": "排程" } } },
		initialCwd: "/home/tech",
		hints: ["方向", "指令名", "完整指令"],
		banner: ["KEPLER-9"],
		objective: { title: "讀取排程", check: catFile("/home/tech/wake_up.txt") },
		nova: { onEnterRoom: ["喚醒程序……完成。"], onSolved: ["你是第六個。"] },
		...overrides,
	};
}

function validChapter(terminals: TerminalDefinition[] = [validTerminal()]): ChapterDefinition {
	return {
		chapter: 1,
		title: "冷凍艙與維生艙",
		deckName: "冷凍艙",
		map: { deck: 1, startDark: true },
		intro: ["連線建立。"],
		outro: ["資料中心在那邊。"],
		terminals,
	};
}

/** 斷言 validateChapter 會丟錯，回傳錯誤訊息。 */
function errorMessageOf(definition: unknown): string {
	try {
		validateChapter(definition as ChapterDefinition);
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("預期 validateChapter 丟錯，但沒有");
}

describe("terminalDefinitionSchema", () => {
	it("合法定義通過", () => {
		expect(terminalDefinitionSchema.safeParse(validTerminal()).success).toBe(true);
	});

	it("可選欄位都省略也通過", () => {
		const minimal: TerminalDefinition = {
			id: "ch12-t30",
			title: "配電箱",
			roomId: "power",
			teaches: [],
			fs: {},
			hints: ["一段"],
			objective: { title: "目標", check: () => true },
		};
		expect(terminalDefinitionSchema.safeParse(minimal).success).toBe(true);
	});

	it("nova.onStuck 合法時通過，有空字串時失敗", () => {
		const withStuck = validTerminal({ nova: { onStuck: ["技師，先看看周圍。"] } });
		expect(terminalDefinitionSchema.safeParse(withStuck).success).toBe(true);

		const emptyLine = validTerminal({ nova: { onStuck: [""] } });
		expect(terminalDefinitionSchema.safeParse(emptyLine).success).toBe(false);
	});

	it("effect、env、processes 合法時通過", () => {
		const terminal = validTerminal({
			effect: { kind: "openDoor", doorId: "airlock" },
			env: { NOVA_DIR: "/opt/nova" },
			processes: [
				{ pid: 1, user: "root", cpu: 0.1, mem: 0.5, started: "2028-06-02T04:40:00Z", command: "init", protected: true },
				{ pid: 42, user: "nova", cpu: 87.5, mem: 41, started: "2028-06-02T04:40:00Z", command: "/opt/nova/nova --core", ignoresTerm: true },
			],
		});
		expect(terminalDefinitionSchema.safeParse(terminal).success).toBe(true);
	});

	it("effect 的 kind 不認得、openDoor 沒有 doorId 時失敗", () => {
		const badKind = { ...validTerminal(), effect: { kind: "explode" } };
		expect(terminalDefinitionSchema.safeParse(badKind).success).toBe(false);
		const noDoor = { ...validTerminal(), effect: { kind: "openDoor" } };
		expect(terminalDefinitionSchema.safeParse(noDoor).success).toBe(false);
	});

	it("processes 的 pid 不是正整數時失敗", () => {
		const terminal = validTerminal({
			processes: [{ pid: 0, user: "nova", cpu: 1, mem: 1, started: "2028-06-02T04:40:00Z", command: "nova" }],
		});
		expect(terminalDefinitionSchema.safeParse(terminal).success).toBe(false);
	});

	it("欄位名稱打錯（未知欄位）失敗", () => {
		const result = terminalDefinitionSchema.safeParse({ ...validTerminal(), hint: ["多打錯一個"] });
		expect(result.success).toBe(false);
	});
});

describe("validateChapter", () => {
	it("合法劇本回傳同一個參考，函式與 FS 不被拷貝", () => {
		const chapter = validChapter();
		const result = validateChapter(chapter);
		expect(result).toBe(chapter);
		expect(result.terminals[0]).toBe(chapter.terminals[0]);
		expect(result.terminals[0].fs).toBe(chapter.terminals[0].fs);
	});

	it("錯誤訊息以「劇本格式錯誤：」開頭", () => {
		expect(errorMessageOf(validChapter([validTerminal({ id: "t1" })]))).toMatch(/^劇本格式錯誤：/);
	});

	it("id 格式錯誤", () => {
		const message = errorMessageOf(validChapter([validTerminal({ id: "chapter1-terminal1" })]));
		expect(message).toContain("terminals[0].id");
		expect(message).toContain("ch<數字>-t<數字>");
	});

	it("roomId 不在清單", () => {
		const terminal = { ...validTerminal(), roomId: "bridge" } as unknown as TerminalDefinition;
		const message = errorMessageOf(validChapter([terminal]));
		expect(message).toContain("terminals[0].roomId");
	});

	it("hints 四段", () => {
		const message = errorMessageOf(validChapter([validTerminal({ hints: ["一", "二", "三", "四"] })]));
		expect(message).toContain("terminals[0].hints");
		expect(message).toContain("最多 3 段");
	});

	it("hints 零段", () => {
		const message = errorMessageOf(validChapter([validTerminal({ hints: [] })]));
		expect(message).toContain("terminals[0].hints");
		expect(message).toContain("至少要一段");
	});

	it("teaches 有空字串、title 是空字串", () => {
		const message = errorMessageOf(validChapter([validTerminal({ teaches: ["ls", ""], title: "" })]));
		expect(message).toContain("terminals[0].teaches[1]");
		expect(message).toContain("terminals[0].title");
	});

	it("終端機 id 重複，路徑指到第二台", () => {
		const message = errorMessageOf(validChapter([validTerminal(), validTerminal({ title: "另一台" })]));
		expect(message).toContain("terminals[1].id");
		expect(message).toContain("ch1-t1");
		expect(message).toContain("重複");
	});

	it("check 不是函式", () => {
		const terminal = validTerminal({
			objective: { title: "目標", check: "cat wake_up.txt" as unknown as TerminalDefinition["objective"]["check"] },
		});
		const message = errorMessageOf(validChapter([terminal]));
		expect(message).toContain("terminals[0].objective.check");
		expect(message).toContain("必須是函式");
	});

	it("fs 不是物件", () => {
		const terminal = { ...validTerminal(), fs: "not a snapshot" } as unknown as TerminalDefinition;
		expect(errorMessageOf(validChapter([terminal]))).toContain("terminals[0].fs");
	});

	it("map.deck 不是正整數、startDark 不是布林時失敗", () => {
		expect(errorMessageOf({ ...validChapter(), map: { deck: 0, startDark: true } })).toContain("map.deck");
		expect(errorMessageOf({ ...validChapter(), map: { deck: 1, startDark: "yes" } })).toContain("map.startDark");
	});

	it("deckName 是空字串時失敗", () => {
		expect(errorMessageOf({ ...validChapter(), deckName: "" })).toContain("deckName");
	});

	it("chapter 不是正整數", () => {
		expect(errorMessageOf({ ...validChapter(), chapter: 0 })).toContain("chapter");
		expect(errorMessageOf({ ...validChapter(), chapter: 1.5 })).toContain("chapter");
	});

	it("多個問題一次列出", () => {
		const message = errorMessageOf(
			validChapter([validTerminal({ id: "bad" }), validTerminal({ id: "ch1-t2", hints: ["1", "2", "3", "4"] })]),
		);
		expect(message).toContain("terminals[0].id");
		expect(message).toContain("terminals[1].hints");
		expect(message.split("\n").length).toBeGreaterThanOrEqual(3);
	});
});

describe("chapterDefinitionSchema", () => {
	it("合法章節通過", () => {
		expect(chapterDefinitionSchema.safeParse(validChapter()).success).toBe(true);
	});

	it("novaErrorLines 合法時通過，有空字串時失敗", () => {
		expect(chapterDefinitionSchema.safeParse({ ...validChapter(), novaErrorLines: ["你確定你是技師？"] }).success).toBe(true);
		expect(chapterDefinitionSchema.safeParse({ ...validChapter(), novaErrorLines: [""] }).success).toBe(false);
	});
});
