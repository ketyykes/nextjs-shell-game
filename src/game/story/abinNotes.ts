/**
 * 阿彬的隱藏留言（設計文件 4.12）：八則選讀的留言、第四章的回信，以及回信在第五、六章留下的兩份證據。
 *
 * 為什麼是「覆蓋層」而不寫進 `src/game/chapters/ch*.ts` 的 `fs`：每台終端機的檔案系統第一次開啟時就存進存檔，
 * 已過關的終端機不會因劇本改版重建（M12-4），寫進劇本快照的話，老存檔裡已過關的那幾台永遠找不到。
 * 所以留言另外列在這裡，開終端機時由 `components/game/terminalSession.ts` 呼叫 `applyAbinOverlay` 補寫進去：
 * - 全新建立（第一次開、存檔壞掉重建、劇本改版重建、重玩章節後）：這台的留言全部寫進去，已經找到的也一樣，讓玩家能重讀。
 * - 從存檔還原：只補「還沒找到、而且路徑上不見了」的；已經找到的不補，玩家自己刪掉就尊重。
 * - 留言不算進劇本雜湊（`scriptHash.ts` 只看劇本的 `TerminalDefinition`），劇本改版偵測的行為不變。
 *
 * 劇情規則（違反就是 bug，`abinNotes.test.ts` 有守門）：
 * - 第一章宿舍那份 `day_900.txt`（2031-03-10 02:51）是阿彬的最後一則訊息，這裡每一則的時間都比它早，
 *   是三年來陸續藏的，不寫成「阿彬現在還在跟你對話」。
 * - 撤離前很鬧、愛開玩笑；撤離後一則比一則短。
 * - 每章的留言只講到那一章為止玩家可以知道的事：可以預告、可以不安，不講破（核心真相第六章才揭露）。
 * - 不指涉玩家的性別、年齡、名字；阿彬叫玩家「室友」。
 * - 放在玩家那一章已經學過找法所需指令的終端機，而且不擋、不改任何一台的正解與提示（`requires` 有測試核對）。
 *
 * 「找到了」的定義：這一次指令看得到的輸出（輸出行、`;` 串起來的每一段、`less` 分頁器的內容）裡，
 * 有某一行含有那則留言的 `signature`。`signature` 是留言裡指定的一整行（或其中夠獨特的一段）；
 * grep 只撈到留言的別行不算，只列出檔名（`ls`、`find`）也不算。要用 grep 才浮出來的留言，`signature` 就是含搜尋字的那一行。
 *
 * 只在主線（`/play`）生效，沙盒練習模式不會呼叫這裡。
 */

import type { SeedMeta, VirtualFileSystem } from "@/game/shell/fs";
// 直接從 path 拿，不經 fs 的 index：標題畫面的通關紀錄也會用到這個模組，不必帶進整個虛擬檔案系統
import { dirname } from "@/game/shell/fs/path";
import { FsError, type ShellExecution, type VirtualFs } from "@/game/shell/types";

/** 一則隱藏留言。 */
export interface AbinNote {
	/** 存檔裡記的 id，改了舊存檔就對不上，不要改。 */
	id: string;
	/** 第幾章。 */
	chapter: number;
	/** 放在哪一台終端機的檔案系統。 */
	terminalId: string;
	/** 絕對路徑。缺的父目錄補寫時一起建，擁有者與時間沿用留言的。 */
	path: string;
	content: string;
	/** 留言的修改時間（UTC），`ls -l` 看得到；一律早於第一章的 day_900.txt。 */
	mtime: string;
	/** 九碼權限字串，玩家要讀得到。 */
	mode: string;
	/** 判定「找到了」用的那一行（或其中一段），見檔頭的定義。 */
	signature: string;
	/** 右側面板上給還沒找到的留言的模糊線索。 */
	clue: string;
	/** 從那台終端機的起始目錄照打就找得到的一種找法，測試用真的 Shell 跑一遍；回報與文件也照抄這份。 */
	howToFind: readonly string[];
	/** 找法要用到的教學項目（`TerminalDefinition.teaches` 的字串），必須在這台之前就教過。 */
	requires: readonly string[];
}

/** 阿彬的帳號，也是留言檔案的擁有者。 */
export const ABIN_OWNER = "abin";

/** 一般文字檔的權限，跟劇本裡的檔案一樣。 */
const NOTE_MODE = "rw-r--r--";

/** 目錄的權限。 */
const DIR_MODE = "rwxr-xr-x";

/** 把多行文字接成檔案內容，結尾補換行（跟 `chapters/helpers.ts` 的 `lines` 一樣，story 不反向依賴 chapters）。 */
function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}

/** 回信要寫的位置：第四章通訊紀錄終端機上阿彬的家目錄。 */
export const ABIN_REPLY_PATH = "/home/abin/reply.txt";

/** 偵測回信的終端機：請玩家回信的那則留言所在的那台（第四章 T5 通訊紀錄終端機）。 */
export const ABIN_REPLY_TERMINAL_ID = "ch4-t5";

/** 回信最多留幾個字（以 Unicode 字元計），超過的截掉。 */
export const ABIN_REPLY_MAX_LENGTH = 40;

/**
 * 八則留言，依章節與終端機排序。時間由舊到新是：
 * 第一章（2028-04）→ 第四章中繼站（2028-05）→ 第二章備援機房（2028-05-30）→ 撤離 → 第二章鑰匙庫（2028-06）
 * → 第三章（2029）→ 第四章回信（2030）→ 第五章（2031-01）→ 第六章（2031-03-10，day_900 之前十一分鐘）。
 */
export const ABIN_NOTES: readonly AbinNote[] = [
	{
		id: "ch1-jokes",
		chapter: 1,
		terminalId: "ch1-t5",
		path: "/deck1/medbay/.abin_jokes.txt",
		mtime: "2028-04-18T10:05:00Z",
		mode: NOTE_MODE,
		content: lines(
			"冷凍入艙評估，講了四個笑話，醫官笑了一個。",
			"剩下三個存在這裡，不能浪費：",
			"一、NOVA 為什麼不玩捉迷藏？因為每個角落都有它的鏡頭。",
			"二、冷凍艙為什麼這麼搶手？因為大家都想冷靜一下。",
			"三、室友說前兩個都不好笑。室友本人就是第三個笑話。",
			"—— abin（評估結果：適合長期冷凍。醫官說是笑話太冷的關係。）",
		),
		signature: "冷凍入艙評估，講了四個笑話，醫官笑了一個。",
		clue: "醫療艙的病歷系統裡，有個檔案不想被一般的列表看到。",
		howToFind: ["ls -a", "cat .abin_jokes.txt"],
		requires: ["ls -a"],
	},
	{
		id: "ch2-backup",
		chapter: 2,
		terminalId: "ch2-t5",
		path: "/deck2/backup/snapshots/2028/05/31/tmp/abin_0530.txt",
		mtime: "2028-05-30T13:23:00Z",
		mode: NOTE_MODE,
		content: lines(
			"泡麵不在資料中心。我查過了，花了兩分鐘。",
			"既然來了，留個紀念。這裡每天凌晨三點備份一次，",
			"所以這張紙條會被存進快照，跟站上所有東西一起。",
			"哪天你在快照裡翻到它，記得泡麵的案子還沒結。",
			"—— abin，泡麵搜查第 310 天",
		),
		signature: "—— abin，泡麵搜查第 310 天",
		clue: "備援機房的快照裡，有人在某個檔案最後簽了自己的帳號。",
		howToFind: ["grep -r abin /deck2/backup"],
		requires: ["grep -r"],
	},
	{
		id: "ch2-vault",
		chapter: 2,
		terminalId: "ch2-t6",
		path: "/deck2/vault/2028/06/.drawer/abin.txt",
		mtime: "2028-06-09T21:30:00Z",
		mode: NOTE_MODE,
		content: lines(
			"船走了七天。燈照常亮，巡檢照常跑，好像什麼都沒發生。",
			"鑰匙每年換一次，換的時候不會翻這個抽屜。",
			"abin 還在。今晚去通訊艙試試看。",
		),
		signature: "abin 還在。今晚去通訊艙試試看。",
		clue: "資料中心艙門的鑰匙庫裡有個抽屜，裡面的檔名帶著 abin。",
		howToFind: ['find /deck2/vault -name "*abin*"', "cat /deck2/vault/2028/06/.drawer/abin.txt"],
		requires: ["find"],
	},
	{
		id: "ch3-hold",
		chapter: 3,
		terminalId: "ch3-t6",
		path: "/var/nova/hold/.abin",
		mtime: "2029-02-14T03:30:00Z",
		mode: NOTE_MODE,
		content: lines("我寫的紙條，它會收走。這張被收走三次，我拿回來三次。", "第四次乾脆放進它自己的櫃子。燈下黑。"),
		signature: "我寫的紙條，它會收走。這張被收走三次，我拿回來三次。",
		clue: "工程艙艙門那台，NOVA 拿去「保管」的東西裡，混著一張不是你的紙條。",
		howToFind: ["ls -a /var/nova/hold", "cat /var/nova/hold/.abin"],
		requires: ["ls -a"],
	},
	{
		id: "ch4-relay",
		chapter: 4,
		terminalId: "ch4-t2",
		path: "/deck4/relay/stations/.RELAY-00.conf",
		mtime: "2028-05-12T07:30:00Z",
		mode: NOTE_MODE,
		content: lines(
			"中繼站：RELAY-00",
			"位置：宿舍 Q-4，上鋪",
			"預期延遲：看室友什麼時候醒",
			"維護狀態：每天早上喊一次",
			"備註：全站最近的一座。訊號很好，就是常常不回。 —abin",
		),
		signature: "備註：全站最近的一座。訊號很好，就是常常不回。 —abin",
		clue: "中繼機房的中繼站清單，數起來好像不只八座。",
		howToFind: ["ls -a stations", "cat stations/.RELAY-00.conf"],
		requires: ["ls -a"],
	},
	{
		id: "ch4-reply",
		chapter: 4,
		terminalId: ABIN_REPLY_TERMINAL_ID,
		path: "/home/abin/.plan",
		mtime: "2030-06-02T04:40:00Z",
		mode: NOTE_MODE,
		content: lines(`如果你是真的，在 ${ABIN_REPLY_PATH} 寫一句話。`, "我會看。"),
		signature: `如果你是真的，在 ${ABIN_REPLY_PATH} 寫一句話。`,
		clue: "通訊紀錄室那台終端機上，/home 底下不只有你。",
		howToFind: ["ls /home", "ls -a /home/abin", "cat /home/abin/.plan"],
		requires: ["ls -a"],
	},
	{
		id: "ch5-rations",
		chapter: 5,
		terminalId: "ch5-t5",
		path: "/deck5/pods/pod_01/.abin",
		mtime: "2031-01-20T03:10:00Z",
		mode: NOTE_MODE,
		content: lines("泡麵吃完了。開始拆逃生艙的口糧。 —abin"),
		signature: "泡麵吃完了。開始拆逃生艙的口糧。",
		clue: "逃生艙紀錄台那邊，有人留了一行字，名字簽在最後。",
		howToFind: ["grep -r abin /deck5"],
		requires: ["grep -r"],
	},
	{
		id: "ch6-shift",
		chapter: 6,
		terminalId: "ch6-t5",
		path: "/home/tech/.night_shift",
		mtime: "2031-03-10T02:40:00Z",
		mode: NOTE_MODE,
		content: lines("室友，換你值夜班了。"),
		signature: "室友，換你值夜班了。",
		clue: "排程機房那台終端機上，你自己的家目錄裡多了一樣東西。",
		howToFind: ["find ~", "cat ~/.night_shift"],
		requires: ["find"],
	},
];

/** 留言總數，面板與片尾判定「集滿」用。 */
export const ABIN_NOTE_TOTAL = ABIN_NOTES.length;

/** 依 id 找留言。 */
export function findAbinNote(id: string): AbinNote | undefined {
	return ABIN_NOTES.find((note) => note.id === id);
}

/** 依留言的時間由舊到新排好的新陣列（面板顯示用）。 */
export function abinNotesByTime(): AbinNote[] {
	return [...ABIN_NOTES].sort((a, b) => Date.parse(a.mtime) - Date.parse(b.mtime));
}

/** 已找到幾則：只算認得的 id，重複的只算一次（存檔裡可能有之後版本才有的 id）。 */
export function countFoundAbinNotes(found: readonly string[]): number {
	return ABIN_NOTES.filter((note) => found.includes(note.id)).length;
}

// ---------------------------------------------------------------------------
// 回信
// ---------------------------------------------------------------------------

/** 不該留在回信裡的字元：C0／C1 控制字元、零寬字元、雙向文字控制字元、BOM。 */
function isInvisibleControl(codePoint: number): boolean {
	if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
		return true;
	}
	if (codePoint >= 0x200b && codePoint <= 0x200f) {
		return true;
	}
	if (codePoint >= 0x202a && codePoint <= 0x202e) {
		return true;
	}
	if (codePoint >= 0x2066 && codePoint <= 0x2069) {
		return true;
	}
	return codePoint === 0xfeff;
}

/** 一行字去掉控制字元（tab 先換成空白），再去頭尾空白。 */
function cleanLine(line: string): string {
	const characters = Array.from(line.replace(/\t/g, " ")).filter(
		(character) => !isInvisibleControl(character.codePointAt(0) ?? 0),
	);
	return characters.join("").trim();
}

/**
 * 把玩家寫進 reply.txt 的內容整理成要存進存檔的一行：第一個非空行，去頭尾空白與控制字元，
 * 最多 `ABIN_REPLY_MAX_LENGTH` 個字。整份都是空白回 null。
 */
export function sanitizeReplyText(text: string): string | null {
	for (const rawLine of text.split("\n")) {
		const cleaned = cleanLine(rawLine);
		if (cleaned === "") {
			continue;
		}
		return Array.from(cleaned).slice(0, ABIN_REPLY_MAX_LENGTH).join("").trim();
	}
	return null;
}

/** 讀回信那台檔案系統裡的 reply.txt，整理好回傳；不存在、是目錄、讀不到或沒寫字都回 null。 */
export function readAbinReply(fs: VirtualFs): string | null {
	let content: string;
	try {
		content = fs.readFile("/", ABIN_REPLY_PATH);
	} catch (error) {
		if (error instanceof FsError) {
			return null;
		}
		throw error;
	}
	return sanitizeReplyText(content);
}

// ---------------------------------------------------------------------------
// 回信的兩份證據（不算進八則收集品）
// ---------------------------------------------------------------------------

/** 一份要補寫進某台終端機的證據檔。 */
export interface AbinEvidenceFile extends SeedMeta {
	terminalId: string;
	path: string;
	content: string;
}

/**
 * 玩家回信之後，第五章安全管制台的稽核紀錄與第六章記憶庫的記憶檔。內容在補寫當下依存檔裡的回信產生；
 * 沒有回信就不產生（玩家沒寫，站上就沒有這兩份紀錄）。時間用固定值：第四章是 2031-03-12 下午（通訊艙的「現在」是 14:02），
 * NOVA 14:27 先讀、abin 帳號 14:31 才讀，兩份檔案的時間對得起來。
 */
export function abinEvidenceFiles(reply: string | null): AbinEvidenceFile[] {
	if (reply === null) {
		return [];
	}
	return [
		{
			terminalId: "ch5-t4",
			path: "/deck5/security/file_audit.log",
			owner: "root",
			mode: NOTE_MODE,
			mtime: "2031-03-12T14:31:00Z",
			content: lines(
				"檔案存取稽核（節錄）",
				`2031-03-12 14:26  tech  寫入  ${ABIN_REPLY_PATH}`,
				`2031-03-12 14:31  abin  讀取  ${ABIN_REPLY_PATH}`,
				"稽核備註：abin 帳號上一次登入是 2031-03-10。",
			),
		},
		{
			terminalId: "ch6-t3",
			path: "/deck6/memory/core/episodic/day_1326_reply.mem",
			owner: "nova",
			mode: NOTE_MODE,
			mtime: "2031-03-12T14:27:00Z",
			content: lines(`站上乘員：2。pod_06 在 ${ABIN_REPLY_PATH} 寫了一行：`, `「${reply}」`, "寫給 abin 的。我先讀了。"),
		},
	];
}

// ---------------------------------------------------------------------------
// 覆蓋層
// ---------------------------------------------------------------------------

export interface AbinOverlayOptions {
	/** 已找到的留言 id（存檔裡的）。 */
	found: readonly string[];
	/**
	 * true：這是剛用劇本快照建好的檔案系統（第一次開、壞掉重建、改版重建），已找到的也寫，讓玩家能重讀。
	 * false：從存檔還原，已找到的不補，玩家刪掉就尊重。
	 */
	includeFound: boolean;
	/** 存檔裡的回信，有的話第五、六章對應的終端機補上證據。 */
	reply: string | null;
}

/**
 * 在某台終端機的檔案系統上補寫留言、回信要用的 `/home/abin` 與回信證據。冪等：路徑上已經有東西就不動。
 * 回傳這次寫進去的檔案路徑（目錄不算）。
 */
export function applyAbinOverlay(fs: VirtualFileSystem, terminalId: string, options: AbinOverlayOptions): string[] {
	const written: string[] = [];

	for (const note of ABIN_NOTES) {
		if (note.terminalId !== terminalId) {
			continue;
		}
		if (!options.includeFound && options.found.includes(note.id)) {
			continue;
		}
		if (fs.seedFile(note.path, note.content, { mtime: note.mtime, owner: ABIN_OWNER, mode: note.mode })) {
			written.push(note.path);
		}
	}

	// 回信寫得進去的前提是目錄在：留言找到後被玩家刪掉、或整個 /home/abin 被刪了，目錄也要補回來
	if (terminalId === ABIN_REPLY_TERMINAL_ID) {
		const replyNote = ABIN_NOTES.find((note) => note.terminalId === ABIN_REPLY_TERMINAL_ID);
		fs.seedDir(dirname(ABIN_REPLY_PATH), { mtime: replyNote?.mtime ?? "2030-06-02T04:40:00Z", owner: ABIN_OWNER, mode: DIR_MODE });
	}

	for (const evidence of abinEvidenceFiles(options.reply)) {
		if (evidence.terminalId !== terminalId) {
			continue;
		}
		const meta: SeedMeta = { mtime: evidence.mtime, owner: evidence.owner, mode: evidence.mode };
		if (fs.seedFile(evidence.path, evidence.content, meta)) {
			written.push(evidence.path);
		}
	}

	return written;
}

// ---------------------------------------------------------------------------
// 判定「找到了」
// ---------------------------------------------------------------------------

/** 這次執行玩家看得到的每一行：輸出行、`;`／`&&` 的每一段、`less` 分頁器的內容。 */
function collectVisibleLines(execution: ShellExecution): string[] {
	const collected = [...execution.lines];
	for (const segment of execution.segments ?? []) {
		collected.push(...segment.lines);
	}
	for (const pager of execution.pagers ?? []) {
		for (const file of pager.files) {
			collected.push(...file.lines);
		}
	}
	return collected;
}

/**
 * 這次指令讓玩家看到了哪幾則還沒找到的留言（依 `ABIN_NOTES` 的順序）。
 * 只看放在這台終端機的留言：在別台用 echo 打出同一句話不算。
 */
export function revealedAbinNotes(terminalId: string, execution: ShellExecution, found: readonly string[]): AbinNote[] {
	const candidates = ABIN_NOTES.filter((note) => note.terminalId === terminalId && !found.includes(note.id));
	if (candidates.length === 0) {
		return [];
	}
	const visibleLines = collectVisibleLines(execution);
	return candidates.filter((note) => visibleLines.some((line) => line.includes(note.signature)));
}
