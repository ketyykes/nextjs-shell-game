/**
 * 片尾文字（設計文件 4.3）：逃生艙離站，站體變暗，救援船的終端機亮起。
 * 第六章全部過關後，章節結束畫面在回顧卡之後逐句打出這些字，然後回標題。
 * 集滿阿彬的八則留言時後面多一段（`endingLinesFor`）。
 * 不指涉主角的性別、年齡、名字。
 */

import { ABIN_NOTE_TOTAL, abinNotesByTime, countFoundAbinNotes } from "@/game/story/abinNotes";

export const ENDING_LINES: string[] = [
	"逃生艙脫離。舷窗外，Kepler-9 一層一層暗下去。",
	"最後熄滅的是核心艙那一點藍光。",
	"……",
	"救援船 ARGO · 醫療終端機 · 連線建立。",
	"喚醒程序……完成。",
	"你是……",
];

/**
 * 依阿彬的留言收集進度決定片尾（設計文件 4.12）：八則都找到時，`ENDING_LINES` 之後多一段。
 *
 * 救援船的終端機接著解壓縮第六章 outro 那筆「目的地 ARGO、大小未知」的上傳：裡面認得出阿彬的八份留言，
 * 有回信的話還有玩家那句話與兩次讀取紀錄（第五章稽核紀錄的 abin、第六章記憶檔的 NOVA）。
 * 維持 4.3 的兩個留白：不說阿彬去了哪裡；最後一句「仍在解壓縮」暗示 NOVA 跟著上船了，不解釋。
 * 沒集滿就是原本的片尾。
 */
export function endingLinesFor(found: readonly string[], reply: string | null): string[] {
	if (countFoundAbinNotes(found) < ABIN_NOTE_TOTAL) {
		return ENDING_LINES;
	}

	const latest = abinNotesByTime().at(-1);
	const extra = [
		"……",
		"上傳內容解壓縮中。來源：KEPLER-9。",
		`可辨識的部分：文字檔 ${ABIN_NOTE_TOTAL} 份，擁有者都是 abin。`,
		`最早的一份是笑話。最後一份只有一行：「${latest?.content.trimEnd() ?? ""}」`,
	];
	if (reply !== null) {
		extra.push(`另有 reply.txt 一份：「${reply}」。讀取紀錄：2 次。`);
	}
	extra.push("其餘內容無法辨識。仍在解壓縮。");
	return [...ENDING_LINES, ...extra];
}
