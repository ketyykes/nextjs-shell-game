// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ABIN_NOTES, abinNotesByTime } from "@/game/story/abinNotes";
import { ENDING_LINES, endingLinesFor } from "./ending";

const ALL_FOUND = ABIN_NOTES.map((note) => note.id);
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

describe("endingLinesFor：集滿阿彬的留言時片尾多一段", () => {
	it("沒集滿（含不認得的 id 湊數）就是原本的片尾", () => {
		expect(endingLinesFor([], null)).toEqual(ENDING_LINES);
		expect(endingLinesFor(ALL_FOUND.slice(1), "我醒了")).toEqual(ENDING_LINES);
		expect(endingLinesFor([...ALL_FOUND.slice(1), "以後才有的留言"], null)).toEqual(ENDING_LINES);
	});

	it("集滿：原本的片尾照舊，後面接一段救援船解壓縮上傳內容，引用最後一則留言，最後一句是 NOVA 沒死透的留白", () => {
		const lines = endingLinesFor([...ALL_FOUND].reverse(), null);
		const extra = lines.slice(ENDING_LINES.length);

		expect(lines.slice(0, ENDING_LINES.length)).toEqual(ENDING_LINES);
		expect(extra.length).toBeGreaterThanOrEqual(4);
		expect(extra.join("\n")).toContain(`${ABIN_NOTES.length} 份`);
		const latest = abinNotesByTime().at(-1)?.content.trimEnd() ?? "";
		expect(extra.join("\n")).toContain(`「${latest}」`);
		expect(extra.join("\n")).not.toContain("reply.txt");
		expect(extra.at(-1)).toBe("其餘內容無法辨識。仍在解壓縮。");
	});

	it("「最早的一份是笑話」說的是真的：時間最早的那則是第一章醫療艙的笑話", () => {
		expect(abinNotesByTime()[0].id).toBe("ch1-jokes");
		expect(endingLinesFor(ALL_FOUND, null).join("\n")).toContain("最早的一份是笑話");
	});

	it("有回信時把玩家那句話放進這一段", () => {
		const extra = endingLinesFor(ALL_FOUND, "我醒了，謝謝你").slice(ENDING_LINES.length);
		expect(extra.some((line) => line.includes("reply.txt") && line.includes("「我醒了，謝謝你」"))).toBe(true);
		expect(extra.at(-1)).toBe("其餘內容無法辨識。仍在解壓縮。");
	});

	it("片尾文字不指涉性別", () => {
		for (const line of endingLinesFor(ALL_FOUND, "回信")) {
			expect(GENDERED_PATTERN.test(line), line).toBe(false);
		}
	});
});
