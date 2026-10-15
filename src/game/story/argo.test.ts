// @vitest-environment node
import { describe, expect, it } from "vitest";
import { argoCannotExit, argoNoSuchUser, argoProcessProtected, argoSudoDenied } from "@/game/shell/messages";
import type { FsSnapshot, FsSnapshotEntry } from "@/game/shell/types";
import {
	ARGO_ABIN_DIR,
	ARGO_ACCOUNTS,
	ARGO_BANNER,
	ARGO_ENV,
	ARGO_LOGIN_LOG,
	ARGO_PROCESSES,
	ARGO_TIPS,
	ARGO_TOP_TITLE,
	buildArgoSnapshot,
	type ArgoProgress,
} from "./argo";
import { ABIN_NOTES, findAbinNote } from "./abinNotes";

const NO_PROGRESS: ArgoProgress = { found: [], reply: null };

/** 劇本裡最晚的時間：第四章回信被 abin 帳號讀取（`abinEvidenceFiles`）。救援船的紀錄都要在它之後。 */
const LATEST_STORY_TIME = Date.parse("2031-03-12T14:31:00Z");

/** 依路徑（不含開頭的 /）在快照裡找項目，找不到回 undefined。 */
function entryAt(snapshot: FsSnapshot, path: string): FsSnapshotEntry | undefined {
	let current: FsSnapshotEntry | undefined = snapshot;
	for (const part of path.split("/")) {
		if (current === undefined || typeof current === "string") {
			return undefined;
		}
		if (current.$type === "file") {
			return undefined;
		}
		const children: FsSnapshot = current.$type === "dir" ? (current.children as FsSnapshot) : (current as FsSnapshot);
		current = children[part];
	}
	return current;
}

/** 目錄項目的子項。 */
function childrenOf(entry: FsSnapshotEntry | undefined): FsSnapshot {
	if (entry === undefined || typeof entry === "string" || entry.$type === "file") {
		throw new Error("不是目錄");
	}
	if (entry.$type === "dir") {
		return entry.children as FsSnapshot;
	}
	return entry as FsSnapshot;
}

/** 檔案項目的內容。 */
function contentOf(entry: FsSnapshotEntry | undefined): string {
	if (typeof entry === "string") {
		return entry;
	}
	if (entry !== undefined && entry.$type === "file") {
		return entry.content as string;
	}
	throw new Error("不是檔案");
}

/** 快照裡每個檔案的內容與名稱（`skip` 底下的不算）。 */
function collectTexts(snapshot: FsSnapshot, skip: string): string[] {
	const texts: string[] = [];
	function visit(entry: FsSnapshotEntry, path: string) {
		if (path === skip) {
			return;
		}
		if (typeof entry === "string") {
			texts.push(entry);
			return;
		}
		if (entry.$type === "file") {
			texts.push(entry.content as string);
			return;
		}
		for (const [name, child] of Object.entries(childrenOf(entry))) {
			texts.push(name);
			visit(child, `${path}/${name}`);
		}
	}
	for (const [name, entry] of Object.entries(snapshot)) {
		texts.push(name);
		visit(entry, `/${name}`);
	}
	return texts;
}

/** 救援船終端機自己寫的所有文字（不含複製過來的阿彬留言與玩家的回信）。 */
function collectArgoTexts(): string[] {
	const snapshot = buildArgoSnapshot({ found: ABIN_NOTES.map((note) => note.id), reply: "我在這裡" });
	return [
		...collectTexts(snapshot, ARGO_ABIN_DIR),
		...ARGO_BANNER,
		...ARGO_TIPS,
		ARGO_TOP_TITLE,
		...Object.entries(ARGO_ENV).flat(),
		...ARGO_PROCESSES.map((process) => `${process.user} ${process.command}`),
		JSON.stringify(ARGO_ACCOUNTS),
		JSON.stringify(ARGO_LOGIN_LOG),
		...argoCannotExit("exit"),
		...argoNoSuchUser("nova"),
		...argoProcessProtected(1, "/sbin/init"),
		...argoSudoDenied("tech"),
	];
}

describe("上傳的資料夾依阿彬留言的進度組裝", () => {
	it("一則都沒找到：abin/ 還在但是空的，沒有 reply.txt", () => {
		const abin = childrenOf(entryAt(buildArgoSnapshot(NO_PROGRESS), ARGO_ABIN_DIR.slice(1)));
		expect(Object.keys(abin)).toEqual([]);
	});

	it("只放找到的那幾則，內容、時間、擁有者都照 ABIN_NOTES", () => {
		const found = ["ch1-jokes", "ch5-rations"];
		const abin = childrenOf(entryAt(buildArgoSnapshot({ found, reply: null }), ARGO_ABIN_DIR.slice(1)));
		const files = Object.values(abin);
		expect(files).toHaveLength(2);
		for (const id of found) {
			const note = findAbinNote(id);
			expect(files).toContainEqual(
				expect.objectContaining({ $type: "file", content: note?.content, mtime: note?.mtime, owner: "abin" }),
			);
		}
	});

	it("檔名依留言時間排得出先後，八則都找到也不會撞名", () => {
		const abin = childrenOf(
			entryAt(buildArgoSnapshot({ found: ABIN_NOTES.map((note) => note.id), reply: null }), ARGO_ABIN_DIR.slice(1)),
		);
		const names = Object.keys(abin);
		expect(names).toHaveLength(ABIN_NOTES.length);
		const byName = [...names].sort().map((name) => contentOf(abin[name]));
		const byTime = [...ABIN_NOTES].sort((a, b) => Date.parse(a.mtime) - Date.parse(b.mtime)).map((note) => note.content);
		expect(byName).toEqual(byTime);
	});

	it("存檔裡認不得的 id 與重複的 id 不影響結果", () => {
		const abin = childrenOf(
			entryAt(buildArgoSnapshot({ found: ["ch1-jokes", "ch1-jokes", "ch9-future"], reply: null }), ARGO_ABIN_DIR.slice(1)),
		);
		expect(Object.keys(abin)).toHaveLength(1);
	});

	it("有回信就多一份 reply.txt，內容是玩家的原文，擁有者是 tech", () => {
		const abin = childrenOf(entryAt(buildArgoSnapshot({ found: [], reply: "我是真的。" }), ARGO_ABIN_DIR.slice(1)));
		expect(abin["reply.txt"]).toMatchObject({ $type: "file", content: "我是真的。\n", owner: "tech" });
	});

	it("清單寫著來源 KEPLER-9、大小未知、解壓縮中；core.part 有內容", () => {
		const snapshot = buildArgoSnapshot(NO_PROGRESS);
		const manifest = contentOf(entryAt(snapshot, "mnt/upload/kepler9/manifest.txt"));
		expect(manifest).toContain("來源：KEPLER-9");
		expect(manifest).toContain("大小：未知");
		expect(manifest).toContain("狀態：解壓縮中");
		expect(contentOf(entryAt(snapshot, "mnt/upload/kepler9/core.part")).split("\n").length).toBeGreaterThan(3);
	});
});

describe("救援紀錄與家目錄", () => {
	it("救援紀錄：一名乘客、查無此人、生命徵象正常，時間都接在片尾之後", () => {
		const log = contentOf(entryAt(buildArgoSnapshot(NO_PROGRESS), "var/log/argo/rescue.log"));
		expect(log).toContain("乘客 1 名");
		expect(log).toContain("查無此人");
		expect(log).toContain("生命徵象正常");
		const stamps = [...log.matchAll(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/g)].map((match) =>
			Date.parse(`${match[1]}T${match[2]}:00Z`),
		);
		expect(stamps.length).toBeGreaterThan(3);
		for (const stamp of stamps) {
			expect(stamp).toBeGreaterThan(LATEST_STORY_TIME);
		}
	});

	it("家目錄有喚醒報告、醫療紀錄與 README", () => {
		const home = childrenOf(entryAt(buildArgoSnapshot(NO_PROGRESS), "home/tech"));
		expect(Object.keys(home)).toEqual(expect.arrayContaining(["README", "wake_report.txt", "medical_record.txt"]));
		expect(contentOf(home.README)).toContain("醫療終端機");
	});

	it("登入紀錄：tech 從 pts/0 登入、還沒登出，時間在片尾之後", () => {
		const [latest] = ARGO_LOGIN_LOG.records;
		expect(latest).toMatchObject({ user: "tech", tty: "pts/0", logout: null });
		expect(Date.parse(latest?.login ?? "")).toBeGreaterThan(LATEST_STORY_TIME);
	});

	it("帳號表只有 root、tech、medic", () => {
		expect(ARGO_ACCOUNTS.map((account) => account.name).sort()).toEqual(["medic", "root", "tech"]);
	});
});

describe("程序", () => {
	it("有一個 nova 在還原上傳的 core.part，執行者 unknown、殺不掉、最吃 CPU", () => {
		const nova = ARGO_PROCESSES.find((process) => process.command.startsWith("nova "));
		expect(nova).toMatchObject({
			user: "unknown",
			command: "nova --restore /mnt/upload/kepler9/core.part",
			protected: true,
		});
		const busiest = Math.max(...ARGO_PROCESSES.map((process) => process.cpu));
		expect(nova?.cpu).toBe(busiest);
	});

	it("PID 越大啟動得越晚", () => {
		const sorted = [...ARGO_PROCESSES].sort((a, b) => a.pid - b.pid);
		for (let index = 1; index < sorted.length; index += 1) {
			expect(Date.parse(sorted[index].started)).toBeGreaterThanOrEqual(Date.parse(sorted[index - 1].started));
		}
	});
});

describe("文字規範", () => {
	it("不指涉性別（跟劇本同一條規則）", () => {
		const pattern = /[他她]|先生|小姐|女士|男性|女性|兄弟|姊妹/;
		expect(collectArgoTexts().filter((text) => pattern.test(text))).toEqual([]);
	});

	it("不說破主線、不冒充 NOVA：不提回滾、名單、冷凍、撤離、除役、阿彬，不叫玩家技師，NOVA 只以程序的樣子出現", () => {
		const pattern = /回滾|rollback|名單|冷凍|撤離|除役|阿彬|pod_06|NOVA|技師|真相|下落/;
		expect(collectArgoTexts().filter((text) => pattern.test(text))).toEqual([]);
	});

	it("hint 有五則建議", () => {
		expect(ARGO_TIPS).toHaveLength(5);
	});
});
