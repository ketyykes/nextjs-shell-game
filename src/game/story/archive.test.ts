// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { findTerminal } from "@/game/chapters";
import { VirtualFileSystem } from "@/game/shell/fs";
import type { FsFileNode } from "@/game/shell/types";
import { ABIN_NOTES } from "./abinNotes";
import {
	ARCHIVE_FILES,
	ARCHIVE_TIMELINE,
	archiveFilesOf,
	chapterArchiveEntries,
	formatArchiveTime,
	readArchiveDocument,
	timelineArchiveEntries,
} from "./archive";

/** 劇本文字的性別檢查，跟各章測試同一條（「其他」「他們」也擋）。 */
const GENDERED_PATTERN = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;

/** 時間軸的時間格式：日期，或日期加時分（可再加秒）。 */
const TIMELINE_AT_PATTERN = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;

/** 從劇本快照讀出檔案節點；終端機或檔案不存在就丟錯，讓測試直接指出是哪一筆。 */
function scriptFile(terminalId: string, path: string): FsFileNode {
	const terminal = findTerminal(terminalId);
	if (terminal === undefined) {
		throw new Error(`劇本裡沒有終端機 ${terminalId}`);
	}
	return VirtualFileSystem.fromSnapshot(terminal.fs).getFile("/", path);
}

/** 文字裡用「」框起來的引文。 */
function quotesIn(text: string): string[] {
	return Array.from(text.matchAll(/「([^「」]+)」/g), (match) => match[1]);
}

/** ISO 時間換成「年-月-日 時:分:秒」，跟時間軸的寫法比對前綴。 */
function isoToStamp(iso: string): string {
	return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

describe("關鍵檔案清單", () => {
	it("六章每章三到五份", () => {
		for (let chapter = 1; chapter <= 6; chapter += 1) {
			const count = archiveFilesOf(chapter).length;
			expect(count, `第 ${chapter} 章`).toBeGreaterThanOrEqual(3);
			expect(count, `第 ${chapter} 章`).toBeLessThanOrEqual(5);
		}
		expect(ARCHIVE_FILES.every((file) => file.chapter >= 1 && file.chapter <= 6)).toBe(true);
	});

	it("每一份引用的（終端機, 路徑）在劇本快照裡真的存在，而且終端機屬於那一章", () => {
		for (const file of ARCHIVE_FILES) {
			expect(file.terminalId.startsWith(`ch${file.chapter}-`), `${file.terminalId} 不是第 ${file.chapter} 章`).toBe(true);
			expect(() => scriptFile(file.terminalId, file.path), `${file.terminalId} ${file.path}`).not.toThrow();
		}
	});

	it("同一份檔案不會列兩次", () => {
		const keys = ARCHIVE_FILES.map((file) => `${file.terminalId}:${file.path}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("說明是一兩句、不指涉性別，引號裡的字在檔案裡找得到", () => {
		for (const file of ARCHIVE_FILES) {
			const label = `${file.terminalId} ${file.path}`;
			expect(file.summary.trim(), label).not.toBe("");
			expect(file.summary.length, label).toBeLessThanOrEqual(90);
			expect(file.summary, label).not.toMatch(GENDERED_PATTERN);
			const content = scriptFile(file.terminalId, file.path).content;
			for (const quote of quotesIn(file.summary)) {
				expect(content, `${label} 引用的「${quote}」`).toContain(quote);
			}
		}
	});
});

describe("時間軸", () => {
	it("依時間排好，時間格式一致", () => {
		const stamps = ARCHIVE_TIMELINE.map((event) => event.at);
		for (const stamp of stamps) {
			expect(stamp).toMatch(TIMELINE_AT_PATTERN);
		}
		expect(stamps).toEqual([...stamps].sort());
	});

	it("涵蓋入艙評估、撤離當晚、三年間、阿彬最後的留言與喚醒", () => {
		const stamps = ARCHIVE_TIMELINE.map((event) => event.at);
		expect(stamps.some((stamp) => stamp.startsWith("2028-04"))).toBe(true);
		expect(stamps.some((stamp) => stamp.startsWith("2028-06-02 04:3"))).toBe(true);
		expect(stamps.some((stamp) => stamp.startsWith("2029") || stamp.startsWith("2030"))).toBe(true);
		expect(stamps.some((stamp) => stamp.startsWith("2031-03-10 02:"))).toBe(true);
		expect(stamps.at(-1)?.startsWith("2031-03-12 08:15")).toBe(true);
	});

	it("每一筆的來源檔案存在，日期跟檔案的修改時間或內容對得上", () => {
		for (const event of ARCHIVE_TIMELINE) {
			const label = `${event.at} ${event.terminalId} ${event.path}`;
			const file = scriptFile(event.terminalId, event.path);
			if (event.basis === "mtime") {
				expect(isoToStamp(file.mtime).startsWith(event.at), `${label}：mtime 是 ${file.mtime}`).toBe(true);
				continue;
			}
			const date = event.at.slice(0, 10);
			const time = event.at.slice(11);
			const contentLines = file.content.split("\n");
			// 時間跟日期寫在同一行；日期只寫在檔頭或檔名的（排程表、當日日誌），時間那一行就夠
			const dateInHeader = contentLines[0].includes(date) || event.path.includes(date);
			const matched = contentLines.some((line) => line.includes(time) && (line.includes(date) || dateInHeader));
			expect(matched, `${label}：內容找不到 ${event.at}`).toBe(true);
		}
	});

	it("事件文字不指涉性別，引號裡的字在來源檔案裡找得到", () => {
		for (const event of ARCHIVE_TIMELINE) {
			const label = `${event.at} ${event.path}`;
			expect(event.text.trim(), label).not.toBe("");
			expect(event.text, label).not.toMatch(GENDERED_PATTERN);
			const content = scriptFile(event.terminalId, event.path).content;
			for (const quote of quotesIn(event.text)) {
				expect(content, `${label} 引用的「${quote}」`).toContain(quote);
			}
		}
	});
});

describe("readArchiveDocument：內容從劇本即時讀", () => {
	it("讀到的全文、修改時間與終端機名稱都跟劇本一樣", () => {
		const document = readArchiveDocument(findTerminal, "ch1-t1", "/home/tech/wake_up.txt");
		expect(document?.content).toBe(scriptFile("ch1-t1", "/home/tech/wake_up.txt").content);
		expect(document?.content).toContain("原始設定：永不");
		expect(document?.mtime).toBe("2031-03-10T03:07:00Z");
		expect(document?.terminalTitle).toBe("冷凍艙控制台");
	});

	it("劇本裡拿掉讀取權限的檔案也讀得到（檔案櫃是通關後的整理，不考權限）", () => {
		const document = readArchiveDocument(findTerminal, "ch5-t3", "/deck5/captain/sealed/log_final.txt");
		expect(document?.content).toContain("它還在跑。別相信那個聲音。");
	});

	it("終端機或檔案不存在、或路徑是目錄時回 null", () => {
		expect(readArchiveDocument(findTerminal, "ch9-t1", "/home/tech/wake_up.txt")).toBeNull();
		expect(readArchiveDocument(findTerminal, "ch1-t1", "/home/tech/nope.txt")).toBeNull();
		expect(readArchiveDocument(findTerminal, "ch1-t1", "/home/tech")).toBeNull();
	});
});

describe("chapterArchiveEntries：一章的檔案與已找到的阿彬留言", () => {
	it("列出這一章的關鍵檔案，全文、時間、終端機名稱都從劇本讀", () => {
		const entries = chapterArchiveEntries(1, [], findTerminal);
		expect(entries.map((entry) => entry.path)).toEqual(archiveFilesOf(1).map((file) => file.path));
		const wakeUp = entries.find((entry) => entry.path === "/home/tech/wake_up.txt");
		expect(wakeUp?.kind).toBe("file");
		expect(wakeUp?.time).toBe("2031-03-10 03:07");
		expect(wakeUp?.terminalTitle).toBe("冷凍艙控制台");
		expect(wakeUp?.summary).not.toBeNull();
		expect(wakeUp?.content).toContain("修改者：");
	});

	it("沒找到的阿彬留言不列；找到的接在檔案後面，全文來自留言資料", () => {
		expect(chapterArchiveEntries(2, [], findTerminal).some((entry) => entry.kind === "abinNote")).toBe(false);

		const entries = chapterArchiveEntries(2, ["ch2-vault", "ch1-jokes", "unknown-id"], findTerminal);
		const notes = entries.filter((entry) => entry.kind === "abinNote");
		const vault = ABIN_NOTES.find((note) => note.id === "ch2-vault");
		expect(notes).toHaveLength(1);
		expect(notes[0].path).toBe(vault?.path);
		expect(notes[0].content).toBe(vault?.content);
		expect(notes[0].time).toBe("2028-06-09 21:30");
		expect(notes[0].terminalTitle).toBe("資料中心艙門控制台");
		expect(entries.at(-1)?.kind).toBe("abinNote");
	});
});

describe("timelineArchiveEntries", () => {
	it("每一筆帶著來源終端機名稱與來源檔案全文", () => {
		const entries = timelineArchiveEntries(findTerminal);
		expect(entries).toHaveLength(ARCHIVE_TIMELINE.length);
		for (const [index, entry] of entries.entries()) {
			const event = ARCHIVE_TIMELINE[index];
			expect(entry.kind).toBe("event");
			expect(entry.time).toBe(event.at);
			expect(entry.heading).toBe(event.text);
			expect(entry.content).toBe(scriptFile(event.terminalId, event.path).content);
			expect(entry.terminalTitle).toBe(findTerminal(event.terminalId)?.title);
		}
	});
});

describe("formatArchiveTime", () => {
	it("ISO 時間換成「年-月-日 時:分」（UTC，跟站上紀錄一樣）", () => {
		expect(formatArchiveTime("2031-03-10T03:07:00Z")).toBe("2031-03-10 03:07");
	});
});

describe("模組邊界", () => {
	it("archive.ts 不 import 劇本（劇本會 import story，避免循環；終端機查詢由呼叫端傳入）", async () => {
		const source = await readFile(new URL("./archive.ts", import.meta.url), "utf8");
		expect(source).not.toMatch(/from "@\/game\/chapters/);
	});
});
