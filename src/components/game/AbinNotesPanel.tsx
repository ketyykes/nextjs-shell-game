"use client";

/**
 * 右側面板組的「阿彬的留言」內容（設計文件 4.12）：找到幾則、已找到的全文、還沒找到的模糊線索。
 *
 * - 已找到的依留言的時間排（不是找到的順序），讀起來看得出撤離前很鬧、撤離後一則比一則短。
 * - 還沒找到的依章節給線索；還沒到過的章節只寫「還沒到過這一層。」，免得線索劇透後面的艙區與謎題。
 * - 第四章請玩家回信的那則，玩家寫過的話把回信接在下面。
 *
 * 資料都在存檔（v4 的 `abinNotes`）與 `@/game/story/abinNotes`，這裡只負責畫。
 */

import { ABIN_NOTE_TOTAL, ABIN_NOTES, ABIN_REPLY_TERMINAL_ID, abinNotesByTime, countFoundAbinNotes } from "@/game/story/abinNotes";
import type { AbinNote } from "@/game/story/abinNotes";

export interface AbinNotesPanelProps {
	/** 已找到的留言 id（存檔裡的，依找到的順序）。 */
	found: readonly string[];
	/** 玩家到過的最遠章節：還沒到的章節不給線索。 */
	furthestChapter: number;
	/** 第四章的回信，有的話顯示在請玩家回信的那則下面。 */
	reply: string | null;
}

/** 標籤出現的時機要看的存檔欄位。 */
export interface AbinNotesUnlockState {
	furthestChapter: number;
	solvedTerminals: readonly string[];
	found: readonly string[];
}

/** 第一次知道阿彬的那台：第一章宿舍終端機（讀到 day_900.txt「不要相信那個聲音。」）。 */
const UNLOCK_TERMINAL_ID = "ch1-t3";

/**
 * 「阿彬的留言」標籤什麼時候出現：第一章宿舍（T3）過關、第一次知道阿彬之後。
 * 到過第二章以上（選章回第一章時 T3 的過關紀錄會被清掉）或已經找到過留言的存檔一直顯示。
 */
export function isAbinNotesTabUnlocked({ furthestChapter, solvedTerminals, found }: AbinNotesUnlockState): boolean {
	return furthestChapter > 1 || solvedTerminals.includes(UNLOCK_TERMINAL_ID) || found.length > 0;
}

const CHAPTER_LABELS: Record<number, string> = {
	1: "第一章",
	2: "第二章",
	3: "第三章",
	4: "第四章",
	5: "第五章",
	6: "第六章",
};

function chapterLabel(chapter: number): string {
	return CHAPTER_LABELS[chapter] ?? `第 ${chapter} 章`;
}

/** 「還沒找到」區塊的一行：到過的章節一則一行給線索，還沒到過的章節整章合成一行。 */
interface MissingRow {
	key: string;
	chapter: number;
	text: string;
}

/** 還沒到過的章節不給線索，同一章有好幾則時只寫一行並標則數，不重複同一句。 */
function unreachedText(count: number): string {
	if (count > 1) {
		return `還沒到過這一層（${count} 則）。`;
	}
	return "還沒到過這一層。";
}

function missingRows(missingNotes: readonly AbinNote[], furthestChapter: number): MissingRow[] {
	const rows: MissingRow[] = [];
	const unreachedCounts = new Map<number, number>();
	for (const note of missingNotes) {
		if (note.chapter <= furthestChapter) {
			rows.push({ key: note.id, chapter: note.chapter, text: note.clue });
			continue;
		}
		unreachedCounts.set(note.chapter, (unreachedCounts.get(note.chapter) ?? 0) + 1);
	}
	for (const [chapter, count] of unreachedCounts) {
		rows.push({ key: `unreached-${chapter}`, chapter, text: unreachedText(count) });
	}
	return rows;
}

export function AbinNotesPanel({ found, furthestChapter, reply }: AbinNotesPanelProps) {
	const foundNotes = abinNotesByTime().filter((note) => found.includes(note.id));
	const missingNotes = ABIN_NOTES.filter((note) => !found.includes(note.id));
	const rows = missingRows(missingNotes, furthestChapter);

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="abin-notes-panel">
			<p className="flex shrink-0 items-baseline justify-between border-b border-game-dim px-3 py-1.5 text-base text-game-dim">
				<span>已找到</span>
				<span className="text-lg text-game-holo" data-testid="abin-notes-count">
					{`${countFoundAbinNotes(found)}/${ABIN_NOTE_TOTAL}`}
				</span>
			</p>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				{foundNotes.length === 0 ? (
					<p className="py-2 text-base text-game-dim">還沒找到任何一則。</p>
				) : (
					<ol className="flex flex-col gap-3">
						{foundNotes.map((note) => (
							<FoundNote key={note.id} note={note} reply={note.terminalId === ABIN_REPLY_TERMINAL_ID ? reply : null} />
						))}
					</ol>
				)}
				{missingNotes.length > 0 && (
					<section className="mt-4 border-t border-game-dim pt-2" data-testid="abin-notes-missing">
						<h3 className="text-base text-game-dim">還沒找到</h3>
						<ul className="mt-1 flex flex-col gap-1.5">
							{rows.map((row) => (
								<li key={row.key} className="text-base break-words text-game-dim">
									<span className="me-2 text-game-prompt">{chapterLabel(row.chapter)}</span>
									{row.text}
								</li>
							))}
						</ul>
					</section>
				)}
			</div>
			<p className="border-t border-game-dim px-3 py-2 text-sm text-game-dim">阿彬藏在各台終端機裡的留言。選讀，不影響過關。</p>
		</div>
	);
}

/** 已找到的一則：日期與路徑、全文；請玩家回信的那則下面接回信。 */
function FoundNote({ note, reply }: { note: AbinNote; reply: string | null }) {
	return (
		<li className="border-l-[3px] border-game-prompt pl-2" data-testid="abin-note">
			<p className="text-sm break-all text-game-dim">{`${note.mtime.slice(0, 10)} · ${note.path}`}</p>
			<p className="text-lg break-words whitespace-pre-wrap text-game-text" data-testid="abin-note-content">
				{note.content.trimEnd()}
			</p>
			{reply !== null && (
				<p className="mt-1 text-base break-words text-game-holo" data-testid="abin-reply">
					{`你的回信：「${reply}」`}
				</p>
			)}
		</li>
	);
}
