/**
 * Shell 引擎的共用型別。
 *
 * 這個檔案是 `src/game/shell/` 底下所有模組的契約：
 * 虛擬檔案系統、解析器、指令、補全、歷史都只依賴這裡的型別，
 * 不依賴彼此的實作細節。這個檔案不可以 import 任何 React 或 Phaser。
 */

// ---------------------------------------------------------------------------
// 虛擬檔案系統
// ---------------------------------------------------------------------------

/** 玩家的家目錄，`~` 會展開成這個路徑。 */
export const HOME_DIR = "/home/tech";

/** 玩家帳號名稱，也是新建節點的預設擁有者。 */
export const PLAYER_USER = "tech";

/**
 * 檔案節點。
 * `mode` 是九碼權限字串（例如 `rw-r--r--`），第五章 `chmod` 會用到，現在先留欄位。
 * 大小不存欄位，由 `content` 的 UTF-8 位元組數計算，避免內容與大小不同步。
 */
export interface FsFileNode {
	type: "file";
	name: string;
	content: string;
	/** ISO 8601 字串，例如 `2031-03-12T08:15:00Z`，`ls -l` 顯示日期用。 */
	mtime: string;
	owner: string;
	mode: string;
}

/**
 * 目錄節點。
 * `children` 用物件而非 Map，方便直接 JSON 序列化進 zustand persist。
 */
export interface FsDirNode {
	type: "dir";
	name: string;
	children: Record<string, FsNode>;
	mtime: string;
	owner: string;
	mode: string;
}

export type FsNode = FsFileNode | FsDirNode;

/**
 * 劇本檔用的快照字面值，讓「寫檔案等於寫劇情」。
 *
 * - 字串：檔案，內容就是那個字串，其他欄位用預設值。
 * - 帶 `$type: "file"` 的物件：檔案，可指定 mtime、owner、mode。
 * - 帶 `$type: "dir"` 的物件：目錄，可指定 mtime、owner、mode，子項放在 `children`。
 * - 其他物件：目錄，每個 key 是子項名稱，其他欄位用預設值。
 *
 * 範例：
 * ```ts
 * const snapshot: FsSnapshot = {
 *   home: {
 *     tech: { "wake_up.txt": "喚醒排程：三年後" },
 *     abin: {
 *       "day_900.txt": { $type: "file", content: "不要相信那個聲音。", mtime: "2031-03-12T08:15:00Z" },
 *     },
 *   },
 * };
 * ```
 */
export interface FsSnapshotFile {
	$type: "file";
	content: string;
	mtime?: string;
	owner?: string;
	mode?: string;
}

export interface FsSnapshotDir {
	$type: "dir";
	children: FsSnapshot;
	mtime?: string;
	owner?: string;
	mode?: string;
}

export type FsSnapshotEntry = string | FsSnapshotFile | FsSnapshotDir | FsSnapshot;

export interface FsSnapshot {
	[name: string]: FsSnapshotEntry;
}

/** 序列化後的檔案系統，可直接 JSON.stringify 存進 store。 */
export interface SerializedFs {
	version: 1;
	root: FsDirNode;
}

/**
 * 檔案系統操作失敗的錯誤代碼，沿用 POSIX 命名方便對照。
 * - ENOENT：路徑不存在
 * - ENOTDIR：路徑中某一段不是目錄，或對檔案做了目錄操作（例如 `cd` 到檔案）
 * - EISDIR：對目錄做了檔案操作（例如 `cat` 目錄、不加 `-r` 的 `rm` 目錄）
 * - EEXIST：目標已存在（第三章 `mkdir` 用）
 * - EACCES：沒有權限（第五章 `chmod` 之前讀不到的封存檔）
 * - EBUSY：不能動的節點（例如刪除根目錄、把目錄搬進自己底下）
 */
export type FsErrorCode = "ENOENT" | "ENOTDIR" | "EISDIR" | "EEXIST" | "EACCES" | "EBUSY";

/**
 * 判斷玩家對某個節點有沒有讀取權限（第五章 `chmod`）。
 * 擁有者是玩家（`PLAYER_USER`）時看前三碼，否則看「其他人」的後三碼；中間的群組碼不用。
 * 純函式，`readFile` 與 `cat` 之外的指令（例如 `head`、`grep`）也要用它擋。
 */
export function canRead(node: FsNode, user: string = PLAYER_USER): boolean {
	const mode = node.mode.padEnd(9, "-");
	if (node.owner === user) {
		return mode[0] === "r";
	}
	return mode[6] === "r";
}

/** 權限字串是否合法：九碼，每碼只能是 `r`、`w`、`x` 或 `-`，位置也要對。 */
export function isValidMode(mode: string): boolean {
	return /^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/.test(mode);
}

/**
 * 檔案系統錯誤。指令層抓到後用 `code` 與 `path` 換成友善的繁中訊息，
 * 訊息內容不寫在這裡。
 */
export class FsError extends Error {
	readonly code: FsErrorCode;
	/** 出錯的路徑，用玩家輸入的原字串，訊息裡才對得上玩家打的東西。 */
	readonly path: string;

	constructor(code: FsErrorCode, path: string) {
		super(`${code}: ${path}`);
		this.name = "FsError";
		this.code = code;
		this.path = path;
	}
}

/**
 * 虛擬檔案系統的公開介面。
 * 所有路徑參數都可以是絕對、相對、含 `.`、`..`、`~`，
 * 由實作內部呼叫路徑解析正規化；相對路徑以 `cwd` 為基準。
 */
export interface VirtualFs {
	/** 把任何形式的路徑轉成正規化的絕對路徑，不檢查是否存在。 */
	resolvePath(cwd: string, input: string): string;

	/** 取得節點，不存在時丟 `FsError("ENOENT")`；路徑中間有檔案時丟 `FsError("ENOTDIR")`。 */
	getNode(cwd: string, input: string): FsNode;

	/** 取得目錄節點，目標是檔案時丟 `FsError("ENOTDIR")`。 */
	getDir(cwd: string, input: string): FsDirNode;

	/** 取得檔案節點，目標是目錄時丟 `FsError("EISDIR")`。 */
	getFile(cwd: string, input: string): FsFileNode;

	/** 節點是否存在。 */
	exists(cwd: string, input: string): boolean;

	/** 列出目錄下的子節點，依名稱排序；隱藏檔（`.` 開頭）預設不列出。 */
	list(cwd: string, input: string, options?: { includeHidden?: boolean }): FsNode[];

	/** 讀檔案內容。沒有讀取權限（見 `canRead`）時丟 `FsError("EACCES")`。 */
	readFile(cwd: string, input: string): string;

	/** 寫檔案，不存在時建立，父目錄必須存在。第四章重導向 `>` 用它。 */
	writeFile(cwd: string, input: string, content: string): void;

	/** 在檔案結尾追加內容，不存在時建立。第四章重導向 `>>` 用它。 */
	appendFile(cwd: string, input: string, content: string): void;

	/**
	 * 建立目錄（第三章 `mkdir`）。已存在丟 `EEXIST`；父目錄不存在丟 `ENOENT`，
	 * 除非 `parents` 為 true（`mkdir -p`）會連父目錄一起建，而且已存在時不報錯。
	 */
	mkdir(cwd: string, input: string, options?: { parents?: boolean }): void;

	/**
	 * 建立空檔案或更新 mtime（第三章 `touch`）：不存在就建一個空檔，存在就把 mtime 改成現在。
	 * 目標是目錄時只更新 mtime。
	 */
	touch(cwd: string, input: string): void;

	/**
	 * 刪除節點（第三章 `rm`）。目標是目錄而 `recursive` 不為 true 時丟 `EISDIR`；
	 * 刪根目錄丟 `EBUSY`。
	 */
	remove(cwd: string, input: string, options?: { recursive?: boolean }): void;

	/**
	 * 搬移或改名（第三章 `mv`）。`to` 是既有目錄時搬進它底下（保留原名），否則視為新路徑。
	 * 把目錄搬進自己或自己的子孫底下丟 `EBUSY`；目標已經是檔案時直接覆蓋，跟真的 `mv` 一樣。
	 */
	move(cwd: string, from: string, to: string): void;

	/**
	 * 複製（第三章 `cp`）。規則同 `move`：`to` 是既有目錄就複製進去。
	 * 來源是目錄而 `recursive` 不為 true 時丟 `EISDIR`。複製出來的節點 mtime 是現在、擁有者是玩家。
	 */
	copy(cwd: string, from: string, to: string, options?: { recursive?: boolean }): void;

	/** 改權限（第五章 `chmod`），`mode` 是九碼字串，不合法時丟一般 `Error`（指令層要先驗）。 */
	setMode(cwd: string, input: string, mode: string): void;

	/**
	 * 萬用字元展開（第四章 `cat *.log`）。只處理最後一段路徑裡的 `*` 與 `?`，
	 * 回傳依名稱排序、保留玩家寫法前綴的路徑（例如 `logs/*.txt` 回 `logs/a.txt`）；
	 * 隱藏檔只有在 pattern 以 `.` 開頭時才會配到。沒有任何相符回傳空陣列，由呼叫端決定要不要保留原字串。
	 */
	glob(cwd: string, pattern: string): string[];

	/** 序列化成可存進 store 的純資料。 */
	serialize(): SerializedFs;
}

/** 節點大小：檔案是內容的 UTF-8 位元組數，目錄固定回傳 4096，跟真的 ext4 一樣。 */
export const DIR_SIZE = 4096;

// ---------------------------------------------------------------------------
// 解析器
// ---------------------------------------------------------------------------

/**
 * token 種類。`word` 是一般字串；`pipe` 是 `|`；`redirect` 是 `>`、`redirectAppend` 是 `>>`。
 */
export type TokenKind = "word" | "pipe" | "redirect" | "redirectAppend";

export interface Token {
	kind: TokenKind;
	/** `word` 是去掉引號後的內容，其他種類是符號本身。 */
	value: string;
	/**
	 * 是否曾被單引號或雙引號包住。
	 * 被引號包住的 word 不做萬用字元展開；單引號內也不做變數展開（`singleQuoted`）。
	 */
	quoted: boolean;
	/** 是否整個 token 都在單引號內，單引號內的 `$NAME` 不展開。沒有這個欄位視為 false。 */
	singleQuoted?: boolean;
}

/**
 * 解析錯誤代碼。
 * - FULLWIDTH_CHAR：輸入含全形空白或全形標點
 * - UNCLOSED_QUOTE：引號沒關
 * - EMPTY_COMMAND：`|` 的前面或後面沒有指令（例如 `ls |`、`| sort`）
 * - MISSING_REDIRECT_TARGET：`>` 或 `>>` 後面沒有檔名
 */
export type ParseErrorCode = "FULLWIDTH_CHAR" | "UNCLOSED_QUOTE" | "EMPTY_COMMAND" | "MISSING_REDIRECT_TARGET";

export interface ParseError {
	code: ParseErrorCode;
	/** 觸發錯誤的字元或符號，給訊息模組組句子用。 */
	detail: string;
}

/** 解析成功後的單一指令。 */
export interface ParsedCommand {
	name: string;
	args: string[];
}

/** 輸出重導向（第四章）：`>` 覆寫、`>>` 追加，`target` 是玩家輸入的原字串。 */
export interface Redirect {
	kind: "overwrite" | "append";
	target: string;
}

/**
 * 一整行輸入解析後的管線：一個以上的指令用 `|` 串起來，結尾可接一個重導向。
 * 沒有管線也沒有重導向時 `commands` 只有一個元素、`redirect` 是 null。
 */
export interface ParsedPipeline {
	commands: ParsedCommand[];
	redirect: Redirect | null;
}

/** 解析選項：`env` 給變數展開用（第五章），沒給就不展開、`$NAME` 原樣保留。 */
export interface ParseOptions {
	env?: Record<string, string>;
}

/**
 * 解析結果。
 * `command` 是管線的第一個指令（舊版相容；`ls | grep x` 的 `command` 是 `ls`），
 * `pipeline` 是完整的管線；空輸入時兩者都是 null。
 */
export type ParseResult =
	| { ok: true; command: ParsedCommand | null; pipeline: ParsedPipeline | null }
	| { ok: false; error: ParseError };

/** 「忘記空格」偵測結果，例如 `cdmedbay` 拆成 `cd` + `medbay`。 */
export interface MissingSpaceSuggestion {
	command: string;
	rest: string;
}

// ---------------------------------------------------------------------------
// 指令
// ---------------------------------------------------------------------------

/**
 * 虛擬程序（第六章 `ps`、`top`、`kill`）。
 * 每台終端機的劇本給初始清單，`kill` 之後的變化存在 shell session 裡。
 */
export interface ProcessInfo {
	pid: number;
	/** 執行者帳號，例如 `nova`、`root`、`tech`。 */
	user: string;
	/** CPU 百分比，`top` 依它排序。 */
	cpu: number;
	/** 記憶體百分比。 */
	mem: number;
	/** 啟動時間，ISO 8601；`ps` 顯示成 `YYYY-MM-DD HH:MM`（UTC）。 */
	started: string;
	/** 指令列，例如 `/opt/nova/nova --core`。 */
	command: string;
	/** true 時不帶 `-9` 的 `kill` 會被忽略（程序拒絕終止訊號），`kill -9` 才殺得掉。 */
	ignoresTerm?: boolean;
	/** true 時連 `kill -9` 都殺不掉（例如 init），回「沒有權限」。 */
	protected?: boolean;
}

/** 指令執行時拿到的環境，全部唯讀，指令透過回傳值表達要改什麼。 */
export interface CommandContext {
	/** 目前工作目錄，絕對路徑。 */
	cwd: string;
	/** 家目錄，通常是 `HOME_DIR`。 */
	home: string;
	fs: VirtualFs;
	/** 這台終端機的 id，例如 `ch1-t1`。 */
	terminalId: string;
	/** 已學指令名稱，`help` 只列這些；順序就是學會的順序。 */
	learnedCommands: string[];
	/** 這台終端機的三段式提示，來自劇本；可能少於三段，不足時重複最後一段。 */
	hints: string[];
	/** 這台終端機已經用過幾次 `hint`，決定下一次給第幾段。 */
	hintCount: number;
	/** 這個 session 的指令歷史，最舊在前，不含目前這一筆。 */
	history: string[];
	/** 所有已註冊指令的名稱，`help` 與補全用。 */
	availableCommands: string[];
	/**
	 * 管線前一個指令的輸出（第四章）。不是管線的一環、或是管線第一個指令時為 null。
	 * 會讀輸入的指令（`cat`、`head`、`tail`、`wc`、`grep`、`sort`、`uniq`）在沒給檔名時讀它；
	 * 其他指令忽略即可。
	 */
	stdin: string[] | null;
	/** 環境變數（第五章），例如 `{ HOME: "/home/tech", USER: "tech" }`。`export` 用回傳值 `nextEnv` 改。 */
	env: Record<string, string>;
	/** 目前的程序清單（第六章）。`kill` 用回傳值 `nextProcesses` 改。 */
	processes: ProcessInfo[];
}

/**
 * 指令執行結果。
 * `ok` 為 false 才算「錯誤」，氧氣值與環境反應階梯只看這個欄位。
 * 合法但沒用的指令（例如 `ls` 一個空目錄）`ok` 仍是 true，避免懲罰探索。
 */
export interface CommandResult {
	ok: boolean;
	/** 要印到終端機的行，空陣列代表沒輸出（例如 `cd` 成功）。管線時這些行會變成下一個指令的 `stdin`。 */
	lines: string[];
	/** `cd` 成功時回傳新的工作目錄。 */
	nextCwd?: string;
	/** `clear` 用，要求 UI 清空輸出區。 */
	clearScreen?: boolean;
	/** `hint` 用，通知 shell 這台終端機的 hint 計數要加一。 */
	hintUsed?: boolean;
	/** `export` 用：整份取代環境變數。 */
	nextEnv?: Record<string, string>;
	/** `kill` 用：整份取代程序清單。 */
	nextProcesses?: ProcessInfo[];
}

export interface CommandDefinition {
	name: string;
	run: (args: string[], context: CommandContext) => CommandResult;
}

// ---------------------------------------------------------------------------
// 指令說明（`man` 與側邊面板共用同一份資料）
// ---------------------------------------------------------------------------

export interface CommandExample {
	command: string;
	explanation: string;
}

export interface CommandDoc {
	name: string;
	/** 一句話說明，`help` 列表與指令回顧卡用。 */
	summary: string;
	/** 用法，例如 `ls [-a] [-l] [路徑...]`。 */
	usage: string;
	/** 完整說明，多行用陣列，一個元素一行。 */
	description: string[];
	examples: CommandExample[];
}

// ---------------------------------------------------------------------------
// Tab 補全
// ---------------------------------------------------------------------------

export interface CompletionContext {
	cwd: string;
	home: string;
	fs: VirtualFs;
	/** 可補全的指令名稱清單。 */
	commandNames: string[];
}

/**
 * 補全結果。
 * - 唯一候選：`completed` 是補完後的整行輸入，`candidates` 只有一個。
 * - 多個候選：`completed` 是補到共同前綴為止的整行輸入，`candidates` 列出全部給 UI 顯示。
 * - 沒有候選：`completed` 等於原輸入，`candidates` 是空陣列。
 * 目錄補完時自動在結尾加 `/`。
 */
export interface CompletionResult {
	completed: string;
	candidates: string[];
}

// ---------------------------------------------------------------------------
// Shell 執行入口
// ---------------------------------------------------------------------------

/** 建立 shell session 需要的資料，通常來自劇本裡某台終端機的定義與 store 裡的進度。 */
export interface ShellOptions {
	fs: VirtualFs;
	terminalId: string;
	hints: string[];
	learnedCommands: string[];
	home?: string;
	cwd?: string;
	/** 從 store 還原時帶入之前的歷史與 hint 計數。 */
	history?: string[];
	hintCount?: number;
	/** 初始環境變數（第五章）。沒給時 shell 自己補 `HOME`、`USER`、`PWD` 三個基本值。 */
	env?: Record<string, string>;
	/** 初始程序清單（第六章）。沒給等同空陣列。 */
	processes?: ProcessInfo[];
}

/**
 * 一次輸入的執行結果，是 UI 唯一需要看的東西。
 * `isError` 與 `CommandResult.ok` 相反，並且包含解析錯誤與指令不存在。
 */
export interface ShellExecution {
	input: string;
	lines: string[];
	isError: boolean;
	clearScreen: boolean;
	/** 執行後的工作目錄，UI 用它組提示符。 */
	cwd: string;
	/** 執行後的環境變數，目標判定用（例如「`NOVA_DIR` 已設定」）。 */
	env: Record<string, string>;
	/** 執行後的程序清單，目標判定用（例如「nova 程序已不在」）。 */
	processes: ProcessInfo[];
}
