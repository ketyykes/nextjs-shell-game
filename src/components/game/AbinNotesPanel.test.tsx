import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ABIN_NOTE_TOTAL, ABIN_REPLY_PATH, findAbinNote } from "@/game/story/abinNotes";
import { AbinNotesPanel, isAbinNotesTabUnlocked, type AbinNotesPanelProps } from "./AbinNotesPanel";

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

function renderPanel(overrides: Partial<AbinNotesPanelProps> = {}) {
	const props: AbinNotesPanelProps = { found: [], furthestChapter: 1, reply: null, ...overrides };
	return render(<AbinNotesPanel {...props} />);
}

/** 已找到區塊裡每則留言的第一行，照畫面順序。 */
function foundFirstLines(): string[] {
	return screen
		.queryAllByTestId("abin-note")
		.map((item) => within(item).getByTestId("abin-note-content").textContent?.split("\n")[0] ?? "");
}

describe("AbinNotesPanel", () => {
	it(`顯示找到幾則（n/${ABIN_NOTE_TOTAL}），不認得的 id 不算`, () => {
		renderPanel({ found: ["ch1-jokes", "以後才有的留言"], furthestChapter: 2 });
		expect(screen.getByTestId("abin-notes-count").textContent).toBe(`1/${ABIN_NOTE_TOTAL}`);
	});

	it("已找到的列出全文，依留言的時間排（不是找到的順序），附日期與路徑", () => {
		const vault = findAbinNote("ch2-vault");
		const jokes = findAbinNote("ch1-jokes");
		renderPanel({ found: ["ch2-vault", "ch1-jokes"], furthestChapter: 2 });

		expect(foundFirstLines()).toEqual([jokes?.content.split("\n")[0], vault?.content.split("\n")[0]]);
		const first = screen.getAllByTestId("abin-note")[0];
		expect(first.textContent).toContain("2028-04-18");
		expect(first.textContent).toContain(jokes?.path ?? "");
		expect(within(first).getByTestId("abin-note-content").textContent).toBe(jokes?.content.trimEnd());
	});

	it("還沒找到的：到過的章節給模糊線索，還沒到的章節不給（免得劇透）", () => {
		renderPanel({ found: [], furthestChapter: 2 });
		const missing = screen.getByTestId("abin-notes-missing");

		expect(missing.textContent).toContain(findAbinNote("ch1-jokes")?.clue);
		expect(missing.textContent).toContain(findAbinNote("ch2-vault")?.clue);
		expect(missing.textContent).not.toContain(findAbinNote("ch3-hold")?.clue);
		expect(within(missing).getAllByText("還沒到過這一層。").length).toBe(5);
	});

	it("全部找到時沒有「還沒找到」區塊", () => {
		renderPanel({
			found: ["ch1-jokes", "ch2-backup", "ch2-vault", "ch3-hold", "ch4-relay", "ch4-reply", "ch5-rations", "ch6-shift"],
			furthestChapter: 6,
		});
		expect(screen.getByTestId("abin-notes-count").textContent).toBe("8/8");
		expect(screen.queryByTestId("abin-notes-missing")).toBeNull();
	});

	it("回信寫過的話，接在請你回信的那則下面", () => {
		renderPanel({ found: ["ch4-reply"], furthestChapter: 4, reply: "我醒了" });
		const replyNote = screen.getAllByTestId("abin-note")[0];
		expect(replyNote.textContent).toContain(ABIN_REPLY_PATH);
		expect(within(replyNote).getByTestId("abin-reply").textContent).toContain("「我醒了」");
	});

	it("一則都還沒找到時有一句說明", () => {
		renderPanel();
		expect(screen.getByText("還沒找到任何一則。")).toBeDefined();
	});
});

describe("isAbinNotesTabUnlocked：第一次知道阿彬之後才出現", () => {
	it("第一章宿舍（T3）過關前不出現，過關後出現", () => {
		expect(isAbinNotesTabUnlocked({ furthestChapter: 1, solvedTerminals: ["ch1-t1", "ch1-t2"], found: [] })).toBe(false);
		expect(isAbinNotesTabUnlocked({ furthestChapter: 1, solvedTerminals: ["ch1-t3"], found: [] })).toBe(true);
	});

	it("到過第二章以上（例如選章回第一章、T3 的過關紀錄被清掉）或已經找到過留言就一直在", () => {
		expect(isAbinNotesTabUnlocked({ furthestChapter: 2, solvedTerminals: [], found: [] })).toBe(true);
		expect(isAbinNotesTabUnlocked({ furthestChapter: 1, solvedTerminals: [], found: ["ch1-jokes"] })).toBe(true);
	});
});
