/**
 * nano 編輯器（第十九場，設計文件 4.22）的純邏輯：按鍵對應、模式切換、寫入與離開的流程、搜尋、畫面上的文字。
 * 畫面在 `Editor.tsx`，這裡不碰 React 與 DOM，方便用 node 環境測。寫檔由呼叫端注入（終端機交給 shell）。
 *
 * 跟真的 nano 對照：
 * - ^O 寫入先問檔名（預設目前的檔名），Enter 確認；寫到別的檔名後緩衝區就改叫那個名字。^S 有檔名時直接寫入。
 * - ^X 離開：沒有修改直接離開；有修改先問「儲存修改過的緩衝區？」，Y 接著問檔名、N 不存、^C 取消。
 *   寫入失敗時留在編輯器，狀態列顯示原因，內容不會丟。沒有檔名的緩衝區有內容就算修改過（nano 讀管線也是）。
 * - ^W 搜尋：不分大小寫、字面比對，從游標（有選取時從選取的結尾）往後找，到結尾從頭繞回；直接 Enter 沿用上一次的字。
 * - ^G 說明頁。F1、F2、F3、F6 是 nano 本來就有的替代鍵（說明、離開、寫入、搜尋）：Windows／Linux 的 Chrome 不讓網頁攔 Ctrl+W。
 * - Esc 等同 ^X（遊戲裡 Esc 是「關掉這個畫面」，跟 less 一樣只離開編輯器、不關終端機）；提示列裡的 Esc 等同 ^C 取消。
 * - ^C 在編輯中不攔（瀏覽器的複製），只在提示列與離開確認時是取消。
 * - 沒做：^K 剪下整行、^U 貼上、復原、取代、跳到第幾行等其他按鍵；剪貼與復原用瀏覽器原本的。
 */

import type { EditorRequest, EditorWrite, EditorWriteResult } from "@/game/shell/types";

/**
 * 編輯器的模式：
 * - edit：在文字區打字
 * - write：狀態列是「要寫入的檔名：」輸入框
 * - search：狀態列是「搜尋：」輸入框
 * - confirmExit：有修改時離開，問要不要存
 * - help：說明頁蓋住文字區
 */
export type EditorMode = "edit" | "write" | "search" | "confirmExit" | "help";

export interface EditorState {
	mode: EditorMode;
	/** 緩衝區目前的檔名；寫到別的檔名後跟著換。沒有檔名是 null。 */
	fileName: string | null;
	/** 上次存檔（或打開時）的內容，判斷有沒有修改用。 */
	savedContent: string;
	/** 檔名或搜尋提示列的輸入框內容。 */
	promptInput: string;
	/** 檔名提示列是從「離開時要存檔」來的：寫入成功就離開。 */
	exitAfterWrite: boolean;
	/** 上一次搜尋的字，直接 Enter 沿用。 */
	lastSearch: string | null;
	/** 狀態列的訊息，打字就清掉。 */
	message: string | null;
	/** 這次編輯成功的每一次寫入，依時間順序，離開時交給終端機。 */
	writes: EditorWrite[];
}

/** 判斷按鍵要的欄位（`KeyboardEvent` 的子集）。 */
export interface EditorKeyInput {
	key: string;
	/** 實體鍵位，例如 `KeyO`；非英文鍵盤配置時用它認字母。 */
	code?: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
}

/** 編輯器認得的操作。 */
export type EditorCommand =
	/** ^O、F3：問檔名再寫入。 */
	| "write"
	/** ^S：有檔名就直接寫入。 */
	| "save"
	/** ^X、Esc、F2：離開，有修改先問。 */
	| "exit"
	/** ^W、F6：搜尋。 */
	| "search"
	/** ^G、F1：說明頁。 */
	| "help"
	/** Tab：插入定位字元，不讓焦點跳出編輯器（由元件處理，這裡不改狀態）。 */
	| "insertTab"
	/** 離開確認的 Y、N。 */
	| "yes"
	| "no"
	/** 提示列的 Enter。 */
	| "submit"
	/** 提示列或離開確認的 ^C、Esc。 */
	| "cancel"
	/** 說明頁的離開鍵。 */
	| "closeHelp";

/** 文字區的選取範圍，字串索引，跟 textarea 的 `selectionStart`／`selectionEnd` 同一套。 */
export interface EditorSelection {
	start: number;
	end: number;
}

/** 執行操作時需要的外部資料。 */
export interface EditorCommandEnv {
	/** 文字區目前的內容。 */
	content: string;
	/** 文字區目前的選取範圍（沒選取時 start 等於 end，就是游標）。 */
	selection: EditorSelection;
	/** 寫檔，由終端機交給 shell（`Shell.writeEditorFile`）。 */
	write: (fileName: string, content: string) => EditorWriteResult;
}

/** 一次操作的結果。 */
export interface EditorTransition {
	state: EditorState;
	/** true 代表離開編輯器，`state.writes` 是這次成功的寫入。 */
	exit: boolean;
	/** 搜尋找到時要選取的範圍；沒有要動選取是 null。 */
	selection: EditorSelection | null;
}

/** 底部按鍵提示的一格。 */
export interface EditorKeyHint {
	key: string;
	label: string;
}

/** 編輯器自己的狀態列訊息（寫檔相關的訊息由 shell 給，在 `messages.ts`）。 */
export const EDITOR_MESSAGES = {
	cancelled: "[ 已取消 ]",
	searchWrapped: "[ 已從頭繼續搜尋 ]",
	notFound: (query: string): string => `[ 找不到「${query}」 ]`,
	confirmExit: "儲存修改過的緩衝區？",
};

/** ^G 說明頁的內容。 */
export const EDITOR_HELP_LINES: string[] = [
	"nano 說明",
	"",
	"直接打字就會寫進緩衝區，方向鍵移動游標，可以貼上，也能用中文輸入法。",
	"^ 代表 Ctrl；Mac 也是按 control 鍵，不是 command 鍵。",
	"",
	"^O（F3）  寫入：確認或修改檔名後按 Enter，存了還能繼續改",
	"^S        用目前的檔名直接存檔",
	"^X（F2）  離開：有沒存的修改時會問要不要存，Y 存、N 不存、^C 取消",
	"Esc       跟 ^X 一樣，只離開編輯器，不關終端機",
	"^W（F6）  搜尋：輸入文字按 Enter；再按 ^W、直接 Enter 找下一個",
	"^G（F1）  顯示這一頁",
	"",
	"有些瀏覽器把 Ctrl+W 當成關閉分頁，搜尋請改按 F6。",
	"Windows 的 Ctrl+X 被拿去離開了，剪下請用滑鼠右鍵；複製、貼上照常用 Ctrl+C、Ctrl+V（Mac 是 command+C、command+V）。",
	"",
	"按 Esc、Enter 或 ^X 回到編輯畫面。",
];

/** 按鍵代表的字母（小寫）：先看 `key`，非英文鍵盤配置時看實體鍵位 `code`；不是字母回傳 null。 */
function letterOf(input: EditorKeyInput): string | null {
	if (/^[a-z]$/i.test(input.key)) {
		return input.key.toLowerCase();
	}
	if (input.code !== undefined && /^Key[A-Z]$/.test(input.code)) {
		return input.code.slice(3).toLowerCase();
	}
	return null;
}

/** 編輯中的按鍵：只認 Ctrl 組合、F 鍵、Esc 與 Tab，其他（包含 ^C 複製）交給瀏覽器。 */
function editCommandForKey(input: EditorKeyInput, letter: string | null): EditorCommand | null {
	const ctrlLetter = input.ctrlKey ? letter : null;
	if (input.key === "Escape" || input.key === "F2" || ctrlLetter === "x") {
		return "exit";
	}
	if (input.key === "F3" || ctrlLetter === "o") {
		return "write";
	}
	if (ctrlLetter === "s") {
		return "save";
	}
	if (input.key === "F6" || ctrlLetter === "w") {
		return "search";
	}
	if (input.key === "F1" || ctrlLetter === "g") {
		return "help";
	}
	if (input.key === "Tab" && !input.ctrlKey) {
		return "insertTab";
	}
	return null;
}

/** 說明頁的離開鍵。 */
function isCloseHelpKey(input: EditorKeyInput, letter: string | null): boolean {
	if (["Escape", "Enter", "F1", "F2"].includes(input.key)) {
		return true;
	}
	if (input.ctrlKey) {
		return letter === "x" || letter === "g" || letter === "c";
	}
	return letter === "q";
}

/** 依模式把按鍵換成操作；不認得的回傳 null，元件就不攔（不 preventDefault、照常冒泡）。 */
export function editorCommandForKey(mode: EditorMode, input: EditorKeyInput): EditorCommand | null {
	// Mac 的 command 與 Alt 組合交給瀏覽器與遊戲（command+C、command+V、Alt+C 開面板）
	if (input.metaKey || input.altKey) {
		return null;
	}
	const letter = letterOf(input);
	const isCancel = input.key === "Escape" || (input.ctrlKey && letter === "c");

	switch (mode) {
		case "edit":
			return editCommandForKey(input, letter);
		case "confirmExit":
			if (isCancel) {
				return "cancel";
			}
			if (input.ctrlKey) {
				return null;
			}
			if (letter === "y") {
				return "yes";
			}
			if (letter === "n") {
				return "no";
			}
			return null;
		case "write":
		case "search":
			if (input.key === "Enter") {
				return "submit";
			}
			if (isCancel) {
				return "cancel";
			}
			return null;
		case "help":
			if (isCloseHelpKey(input, letter)) {
				return "closeHelp";
			}
			return null;
	}
}

/**
 * 打開時的狀態：編輯模式，狀態列是 shell 給的訊息（讀了幾行、新檔案、沒有寫入權限）。
 * 沒有檔名的緩衝區（`nano`、讀管線）把「上次存檔的內容」當成空的，有內容就算修改過，離開前會問。
 */
export function createEditorState(request: EditorRequest): EditorState {
	let savedContent = request.content;
	if (request.fileName === null) {
		savedContent = "";
	}
	return {
		mode: "edit",
		fileName: request.fileName,
		savedContent,
		promptInput: "",
		exitAfterWrite: false,
		lastSearch: null,
		message: request.notice,
		writes: [],
	};
}

/** 文字區的內容跟上次存檔（或打開時）不一樣。 */
export function isModified(state: EditorState, content: string): boolean {
	return content !== state.savedContent;
}

/** 提示列的輸入框內容變了。 */
export function setPromptInput(state: EditorState, value: string): EditorState {
	return { ...state, promptInput: value };
}

/** 不離開、不動選取的結果。 */
function stay(state: EditorState): EditorTransition {
	return { state, exit: false, selection: null };
}

/** 回到編輯模式並顯示訊息，提示列與「存完就離開」一起清掉。 */
function backToEdit(state: EditorState, message: string | null): EditorState {
	return { ...state, mode: "edit", promptInput: "", exitAfterWrite: false, message };
}

/** 進檔名提示列，預設目前的檔名。 */
function startWrite(state: EditorState, exitAfterWrite: boolean): EditorState {
	return { ...state, mode: "write", promptInput: state.fileName ?? "", exitAfterWrite, message: null };
}

/** 寫進 `fileName`：成功時記下寫入、換檔名，`exitAfterWrite` 時離開；失敗時回到編輯、狀態列說原因。 */
function writeTo(state: EditorState, fileName: string, env: EditorCommandEnv, exitAfterWrite: boolean): EditorTransition {
	const result = env.write(fileName, env.content);
	if (!result.ok) {
		return stay(backToEdit(state, result.status));
	}
	const next: EditorState = {
		...backToEdit(state, result.status),
		fileName: result.write.fileName,
		savedContent: env.content,
		writes: [...state.writes, result.write],
	};
	return { state: next, exit: exitAfterWrite, selection: null };
}

/** 離開：沒有修改直接離開，有修改先問。從提示列或說明頁來的（終端機的關閉鈕）一樣處理。 */
function requestExit(state: EditorState, env: EditorCommandEnv): EditorTransition {
	if (!isModified(state, env.content)) {
		return { state, exit: true, selection: null };
	}
	return stay({ ...state, mode: "confirmExit", promptInput: "", exitAfterWrite: false, message: null });
}

/** 搜尋提示列按 Enter：空白沿用上一次的字，從游標或選取的結尾往後找。 */
function submitSearch(state: EditorState, env: EditorCommandEnv): EditorTransition {
	let query = state.promptInput;
	if (query === "") {
		query = state.lastSearch ?? "";
	}
	if (query === "") {
		return stay(backToEdit(state, EDITOR_MESSAGES.cancelled));
	}

	// 沒選取時 end 就是游標；有選取（上一次找到的字）時從它的結尾接著找
	const found = findInContent(env.content, query, env.selection.end);
	const searched: EditorState = { ...state, lastSearch: query };
	if (found === null) {
		return stay(backToEdit(searched, EDITOR_MESSAGES.notFound(query)));
	}

	let message: string | null = null;
	// 繞回前面才找到時跟 nano 一樣提醒（Search Wrapped）
	if (found.wrapped) {
		message = EDITOR_MESSAGES.searchWrapped;
	}
	return { state: backToEdit(searched, message), exit: false, selection: { start: found.start, end: found.end } };
}

/** 執行一個操作。`insertTab` 由元件處理，這裡原樣回傳。 */
export function runEditorCommand(state: EditorState, command: EditorCommand, env: EditorCommandEnv): EditorTransition {
	switch (command) {
		case "write":
			return stay(startWrite(state, false));
		case "save":
			if (state.fileName === null) {
				return stay(startWrite(state, false));
			}
			return writeTo(state, state.fileName, env, false);
		case "exit":
			return requestExit(state, env);
		case "search":
			return stay({ ...state, mode: "search", promptInput: "", message: null });
		case "help":
			return stay({ ...state, mode: "help", message: null });
		case "insertTab":
			return stay(state);
		case "yes":
			return stay(startWrite(state, true));
		case "no":
			return { state, exit: true, selection: null };
		case "cancel":
			return stay(backToEdit(state, EDITOR_MESSAGES.cancelled));
		case "closeHelp":
			return stay(backToEdit(state, null));
		case "submit":
			if (state.mode === "write") {
				const fileName = state.promptInput.trim();
				if (fileName === "") {
					return stay(backToEdit(state, EDITOR_MESSAGES.cancelled));
				}
				return writeTo(state, fileName, env, state.exitAfterWrite);
			}
			if (state.mode === "search") {
				return submitSearch(state, env);
			}
			return stay(state);
	}
}

/**
 * 不分大小寫、字面比對，從 `from` 往後找第一個 `query`；找不到就從頭找（`wrapped`）。
 * 找不到或 `query` 是空字串時回傳 null。索引跟 textarea 的選取範圍同一套（UTF-16）。
 */
export function findInContent(content: string, query: string, from: number): (EditorSelection & { wrapped: boolean }) | null {
	if (query === "") {
		return null;
	}
	const haystack = content.toLowerCase();
	const needle = query.toLowerCase();
	const after = haystack.indexOf(needle, from);
	if (after !== -1) {
		return { start: after, end: after + query.length, wrapped: false };
	}
	const wrapped = haystack.indexOf(needle);
	if (wrapped === -1) {
		return null;
	}
	return { start: wrapped, end: wrapped + query.length, wrapped: true };
}

/** 標題列的檔名，沒有檔名時是「新緩衝區」（nano：New Buffer）。 */
export function editorFileLabel(state: EditorState): string {
	return state.fileName ?? "新緩衝區";
}

/** 狀態列輸入框前面的標籤；搜尋過時把上一次的字放在括號裡（直接 Enter 沿用它）。 */
export function editorPromptLabel(state: EditorState): string {
	if (state.mode === "write") {
		return "要寫入的檔名：";
	}
	if (state.lastSearch !== null) {
		return `搜尋 [${state.lastSearch}]：`;
	}
	return "搜尋：";
}

/** 底部兩列的按鍵提示，跟著模式換（同 nano）。 */
export function editorKeyHints(mode: EditorMode): EditorKeyHint[][] {
	switch (mode) {
		case "edit":
			return [
				[
					{ key: "^G", label: "說明" },
					{ key: "^O", label: "寫入" },
				],
				[
					{ key: "^X", label: "離開" },
					{ key: "^W", label: "搜尋" },
				],
			];
		case "write":
			return [[{ key: "Enter", label: "寫入" }], [{ key: "^C", label: "取消" }]];
		case "search":
			return [[{ key: "Enter", label: "搜尋" }], [{ key: "^C", label: "取消" }]];
		case "confirmExit":
			return [
				[{ key: "Y", label: "是" }],
				[
					{ key: "N", label: "否" },
					{ key: "^C", label: "取消" },
				],
			];
		case "help":
			return [[{ key: "Esc", label: "回到編輯" }], [{ key: "^X", label: "回到編輯" }]];
	}
}
