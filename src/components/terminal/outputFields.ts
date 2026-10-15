/**
 * 輸出欄位說明（設計文件 4.17）的純邏輯，零 React。
 *
 * 新手第一次看到 `ls -l`、`ps`、`top`、`last` 這種多欄輸出時，輸出區塊旁可以叫出一張小表，
 * 逐欄寫「欄位、這次輸出裡的實際值、一句話說明」。這裡負責：
 * - `detectOutputFields`：從玩家打的那一行判斷是哪一種多欄輸出。用 shell 的解析器取最後一段（`;`、`&&`）
 *   管線的最後一個指令，所以 `ps | grep nova`、`ls -l ; pwd` 不標；錯誤、沒有輸出、最後一段導向檔案的也不標。
 * - `buildOutputFieldLegend`：從這次的輸出切一行當例子，組出整張表；切不到資料列（空目錄、沒有程序）就不給。
 * - `claimLegendAutoExpand`：每種說明在這個頁面第一次出現時自動展開一次的紀錄（記憶體內，不進存檔）。
 *
 * 輸出格式以 `ls.ts`、`ps.ts`、`top.ts`、`last.ts` 為準，那邊改格式時這裡的正規表示式要一起改（測試用真的 shell 跑，會擋）。
 */

import { explainTargetOf } from "@/game/shell/commands/explain";
import { splitOptionsAndOperands } from "@/game/shell/commands/options";
import { parseCommandList } from "@/game/shell/parser";
import type { DetailedCommand } from "@/game/shell/parser";
import type { OutputEntry } from "@/game/store/types";

/** 有欄位說明的多欄輸出。 */
export type OutputFieldLegendId = "ls-long" | "ps" | "top" | "last";

/** 欄位說明表的一列。 */
export interface OutputFieldRow {
	/** 欄位名稱，例如「權限」「PID」。 */
	field: string;
	/** 從這次輸出切出來的實際值；這一行沒有這個欄位（例如還沒登出的時長）時是 null。 */
	example: string | null;
	/** 一句話說明。 */
	description: string;
	/** 上一個欄位再拆開的細項（`ls -l` 權限欄的四段），表格裡縮排顯示。 */
	detail?: boolean;
}

/** 一張欄位說明表。 */
export interface OutputFieldLegend {
	id: OutputFieldLegendId;
	/** 按鈕與表格的 aria-label，例如「ls -l 欄位說明」。 */
	label: string;
	/** 例子取自的那一行輸出，原樣保留空白。 */
	sampleLine: string;
	rows: OutputFieldRow[];
	/** 表格下方的補充說明，一句一行。 */
	notes: string[];
}

// ---------------------------------------------------------------------------
// 偵測
// ---------------------------------------------------------------------------

/** 這一行實際顯示在畫面上的最後一個指令：最後一段管線的最後一個；最後一段導向檔案、解析不了或空白時是 null。 */
function finalVisibleCommand(input: string): DetailedCommand | null {
	const parsed = parseCommandList(input);
	if (!parsed.ok || parsed.items.length === 0) {
		return null;
	}

	const pipeline = parsed.items[parsed.items.length - 1].pipeline;
	if (pipeline.redirect !== null) {
		return null;
	}
	return pipeline.commands[pipeline.commands.length - 1];
}

/** `ls` 的參數裡有沒有 `-l`（含 `-la`、`-al` 這類合併寫法；`--` 之後的是路徑）。 */
function hasLongFlag(args: string[]): boolean {
	const { options } = splitOptionsAndOperands(args);
	return options.some((option) => !option.startsWith("--") && option.slice(1).includes("l"));
}

/**
 * 判斷一筆輸出是哪一種多欄輸出，不是就回 null。
 * 只看指令區塊，而且不是錯誤、畫面上有印東西；判斷依據是玩家打的那一行，不是輸出長得像不像。
 */
export function detectOutputFields(entry: OutputEntry): OutputFieldLegendId | null {
	if (entry.kind !== "command" || entry.isError) {
		return null;
	}
	if (!entry.lines.some((line) => line.trim() !== "")) {
		return null;
	}

	// explain 開頭的一行（第十九場）只印說明，被說明的指令沒有執行，畫面上不是它們的輸出
	if (explainTargetOf(entry.input) !== null) {
		return null;
	}

	const command = finalVisibleCommand(entry.input);
	if (command === null) {
		return null;
	}

	switch (command.name.value) {
		case "ls": {
			if (hasLongFlag(command.args.map((arg) => arg.value))) {
				return "ls-long";
			}
			return null;
		}
		case "ps":
			return "ps";
		case "top":
			return "top";
		case "last":
			return "last";
		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// ls -l
// ---------------------------------------------------------------------------

/**
 * `ls -l` 的一行：類型、三組權限、擁有者、大小、修改時間、名稱（`formatLongLine`）。
 * 修改時間無法解析時 ls 會原樣印出 mtime 字串，所以也接受不含空白的一段。
 */
const LS_LONG_LINE =
	/^([d-])([rwxsStT-]{3})([rwxsStT-]{3})([rwxsStT-]{3}) +(\S+) +(\d+) +(\d{4}-\d{2}-\d{2} \d{2}:\d{2}|\S+) +(.+)$/;
const LS_TOTAL_LINE = /^total \d+$/;

/** 選當例子的那一行：優先一般檔案（大小欄有意義），其次不是 `./`、`../` 的，最後才是它們。 */
function pickLsSample(matches: RegExpMatchArray[]): RegExpMatchArray | undefined {
	const file = matches.find((match) => match[1] === "-");
	if (file !== undefined) {
		return file;
	}
	const named = matches.find((match) => match[8] !== "./" && match[8] !== "../");
	if (named !== undefined) {
		return named;
	}
	return matches[0];
}

/** 多個路徑時每一塊上面的「路徑:」標題行：結尾是冒號，下一行是 total 或詳細格式的一行。 */
function findLsHeader(lines: string[]): string | undefined {
	return lines.find((line, index) => {
		if (!line.endsWith(":")) {
			return false;
		}
		const next = lines[index + 1] ?? "";
		return LS_TOTAL_LINE.test(next) || LS_LONG_LINE.test(next);
	});
}

function buildLsLongLegend(lines: string[]): OutputFieldLegend | null {
	const matches = lines
		.map((line) => line.match(LS_LONG_LINE))
		.filter((match): match is RegExpMatchArray => match !== null);
	const sample = pickLsSample(matches);
	if (sample === undefined) {
		return null;
	}

	const [sampleLine, type, ownerBits, groupBits, otherBits, owner, size, mtime, name] = sample;
	const rows: OutputFieldRow[] = [
		{
			field: "權限",
			example: `${type}${ownerBits}${groupBits}${otherBits}`,
			description: "第 1 碼是類型，後面九碼三個一組：r 可以讀、w 可以寫、x 可以執行，- 是不行。",
		},
		{ field: "第 1 碼", example: type, description: "類型：d 是目錄，- 是一般檔案。", detail: true },
		{ field: "第 2-4 碼", example: ownerBits, description: "擁有者（下一欄那個帳號）的權限。", detail: true },
		{ field: "第 5-7 碼", example: groupBits, description: "同一個群組的帳號的權限。", detail: true },
		{ field: "第 8-10 碼", example: otherBits, description: "其他人，也就是其餘所有帳號的權限。", detail: true },
		{ field: "擁有者", example: owner, description: "這個檔案屬於哪個帳號。" },
		{
			field: "大小",
			example: size,
			description: "有幾個位元組（byte），英文字母一個字 1、中文字一個字 3；目錄一律是 4096。",
		},
		{ field: "修改時間", example: mtime, description: "最後一次修改的日期與時間（UTC 時間）。" },
		{ field: "名稱", example: name, description: "檔案或目錄的名稱，結尾有 / 的是目錄。" },
	];

	const notes: string[] = [];
	const header = findLsHeader(lines);
	if (header !== undefined) {
		notes.push(`「${header}」這種結尾是冒號的行是標題，下面才是那個路徑的內容。`);
	}
	const total = lines.find((line) => LS_TOTAL_LINE.test(line));
	if (total !== undefined) {
		notes.push(`「${total}」是這個目錄列出了幾個項目（真的 Linux 這裡是佔用了多少儲存區塊）。`);
	}
	notes.push("改權限的指令是 chmod，改的就是這九碼，例如 chmod 644 會變成 rw-r--r--。");
	notes.push("真的 Linux 的 ls -l 在權限後面還有連結數與群組兩欄，這裡省略了。");

	return { id: "ls-long", label: "ls -l 欄位說明", sampleLine, rows, notes };
}

// ---------------------------------------------------------------------------
// ps 與 top
// ---------------------------------------------------------------------------

/** `formatProcessTable` 的表頭。 */
const PROCESS_HEADER = /^ *PID +USER +%CPU +%MEM +STARTED +COMMAND *$/;
/** 表格的一列：PID、USER、%CPU、%MEM、STARTED（`YYYY-MM-DD HH:MM`，無法解析時原樣）、COMMAND（可能含參數）。 */
const PROCESS_ROW = /^ *(\d+) +(\S+) +(\d+(?:\.\d+)?) +(\d+(?:\.\d+)?) +(\d{4}-\d{2}-\d{2} \d{2}:\d{2}|\S+) +(.+)$/;

function buildProcessLegend(id: "ps" | "top", lines: string[]): OutputFieldLegend | null {
	const headerIndex = lines.findIndex((line) => PROCESS_HEADER.test(line));
	if (headerIndex === -1) {
		return null;
	}
	const sample = lines
		.slice(headerIndex + 1)
		.map((line) => line.match(PROCESS_ROW))
		.find((match): match is RegExpMatchArray => match !== null);
	if (sample === undefined) {
		return null;
	}

	const [sampleLine, pid, user, cpu, mem, started, command] = sample;
	let cpuDescription = "正在用掉多少比例的運算能力（CPU）。";
	if (id === "top") {
		cpuDescription = "正在用掉多少比例的運算能力（CPU），top 依這欄由大到小排。";
	}
	const rows: OutputFieldRow[] = [
		{ field: "PID", example: pid, description: "程序的編號，kill 後面接的就是這個數字。" },
		{ field: "USER", example: user, description: "哪個帳號在執行這個程序。" },
		{ field: "%CPU", example: cpu, description: cpuDescription },
		{ field: "%MEM", example: mem, description: "佔用多少比例的記憶體。" },
		{ field: "STARTED", example: started, description: "什麼時候開始執行（UTC 時間）。" },
		{ field: "COMMAND", example: command, description: "執行的程式，後面接的是它的參數。" },
	];

	if (id === "ps") {
		return {
			id,
			label: "ps 欄位說明",
			sampleLine,
			rows,
			notes: [
				"依 PID 由小到大排；man ps 也有這幾欄的說明。",
				"真的 Linux 的 ps 會依參數顯示不同的欄位（例如 ps aux 還有 TTY、STAT），這裡固定是這六欄。",
			],
		};
	}

	return {
		id,
		label: "top 欄位說明",
		sampleLine,
		rows,
		notes: [
			"最上面兩行是標題與目前有幾個程序，表頭以下跟 ps 是同一張表。",
			"依 %CPU 由大到小排，最上面就是最吃 CPU 的程序。",
			"真的 top 會佔滿整個畫面、每隔幾秒更新一次（按 q 離開），這裡只印一次當下的快照。",
		],
	};
}

// ---------------------------------------------------------------------------
// last
// ---------------------------------------------------------------------------

/**
 * `last` 的一筆紀錄：帳號、終端機、（空白的來源主機）、登入時間，
 * 接著是 ` - 02:53  (00:15)`（超過一天是 `(2+01:10)`）或 `still logged in`。
 */
const LAST_ROW = /^(\S+) +(\S+) +(\w{3} \w{3} [ \d]\d \d{2}:\d{2})(?: +(- \d{2}:\d{2}) +(\(\S+\))| +(still logged in))$/;

function buildLastLegend(lines: string[]): OutputFieldLegend | null {
	const matches = lines
		.map((line) => line.match(LAST_ROW))
		.filter((match): match is RegExpMatchArray => match !== null);
	// 優先取已經登出的那一列，登出時間與時長都看得到
	const sample = matches.find((match) => match[4] !== undefined) ?? matches[0];
	if (sample === undefined) {
		return null;
	}

	const [sampleLine, user, tty, login, logout, duration, stillLoggedIn] = sample;
	const rows: OutputFieldRow[] = [
		{ field: "帳號", example: user, description: "登入的帳號。" },
		{ field: "終端機", example: tty, description: "從哪一台終端機登入，tty 開頭的是直接接在這台主機上的。" },
		{ field: "登入時間", example: login, description: "星期、月、日與時:分（UTC 時間），沒有年份。" },
		{ field: "登出時間", example: logout ?? stillLoggedIn, description: "幾點登出；還沒登出的寫 still logged in。" },
		{
			field: "時長",
			example: duration ?? null,
			description: "登入了多久（時:分），超過一天寫成「天數+時:分」；還沒登出的沒有這欄。",
		},
	];

	return {
		id: "last",
		label: "last 欄位說明",
		sampleLine,
		rows,
		notes: [
			"最新的紀錄在最上面。",
			"終端機後面那一大段空白是來源主機欄，從別台電腦連進來才會寫，直接登入是空的。",
			"最後一行 wtmp begins 是這份紀錄從什麼時候開始記，年份看這裡。",
		],
	};
}

// ---------------------------------------------------------------------------
// 對外
// ---------------------------------------------------------------------------

/** 組出一筆輸出的欄位說明；偵測不到，或輸出裡切不到資料列（空目錄、沒有程序、查無紀錄）時回 null。 */
export function buildOutputFieldLegend(entry: OutputEntry): OutputFieldLegend | null {
	const id = detectOutputFields(entry);
	if (id === null || entry.kind !== "command") {
		return null;
	}

	switch (id) {
		case "ls-long":
			return buildLsLongLegend(entry.lines);
		case "ps":
		case "top":
			return buildProcessLegend(id, entry.lines);
		case "last":
			return buildLastLegend(entry.lines);
	}
}

/** 這個頁面已經自動展開過的說明種類。只在記憶體裡，不進存檔，重新整理就清空。 */
const autoExpandedLegends = new Set<OutputFieldLegendId>();

/** 這種說明在這個頁面還沒自動展開過：記下來並回 true；展開過回 false。 */
export function claimLegendAutoExpand(id: OutputFieldLegendId): boolean {
	if (autoExpandedLegends.has(id)) {
		return false;
	}
	autoExpandedLegends.add(id);
	return true;
}

/** 清掉自動展開的紀錄，給測試在每個案例之間用。 */
export function resetLegendAutoExpand(): void {
	autoExpandedLegends.clear();
}
