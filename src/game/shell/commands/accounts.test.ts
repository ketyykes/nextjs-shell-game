// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "@/game/chapters";
import { ABIN_NOTES, ABIN_OWNER } from "@/game/story/abinNotes";
import type { FsSnapshot, FsSnapshotEntry } from "../types";
import { STATION_LOGIN_LOG } from "./accounts";

/** 阿彬最後一次在站上的那一天（UTC）。 */
const LAST_NIGHT = "2031-03-10";

/** 走過一份劇本快照，收集擁有者是阿彬、而且是那一天改過的檔案與目錄時間。 */
function collectAbinMtimes(snapshot: FsSnapshot, found: string[]): void {
	for (const entry of Object.values(snapshot)) {
		collectEntry(entry, found);
	}
}

function collectEntry(entry: FsSnapshotEntry, found: string[]): void {
	if (typeof entry === "string") {
		return;
	}
	if (entry.$type === "file" || entry.$type === "dir") {
		const { owner, mtime } = entry as { owner?: string; mtime?: string };
		if (owner === ABIN_OWNER && mtime?.startsWith(LAST_NIGHT)) {
			found.push(mtime);
		}
		if (entry.$type === "dir") {
			collectAbinMtimes(entry.children as FsSnapshot, found);
		}
		return;
	}
	collectAbinMtimes(entry as FsSnapshot, found);
}

describe("STATION_LOGIN_LOG 跟劇本的時間線對得上", () => {
	it("阿彬 2031-03-10 那次登入，涵蓋他那天凌晨在站上留下的每一個檔案時間", () => {
		const mtimes: string[] = [];
		for (const chapter of CHAPTERS) {
			for (const terminal of chapter.terminals) {
				collectAbinMtimes(terminal.fs, mtimes);
			}
		}
		for (const note of ABIN_NOTES) {
			if (note.mtime.startsWith(LAST_NIGHT)) {
				mtimes.push(note.mtime);
			}
		}
		// 至少要有 02:40 的 .night_shift 與 02:51 的 day_900.txt，免得走訪寫錯、一個都沒收到也算過
		expect(mtimes).toContain("2031-03-10T02:40:00Z");
		expect(mtimes).toContain("2031-03-10T02:51:00Z");

		const session = STATION_LOGIN_LOG.records.find(
			(record) => record.user === ABIN_OWNER && record.login.startsWith(LAST_NIGHT),
		);
		expect(session).toBeDefined();
		const login = Date.parse(session?.login ?? "");
		const logout = Date.parse(session?.logout ?? "");
		const outside = mtimes.filter((mtime) => Date.parse(mtime) < login || Date.parse(mtime) > logout);
		expect(outside).toEqual([]);
	});
});
