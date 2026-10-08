/**
 * Tab 補全。
 *
 * 只處理「游標在輸入結尾」的情況：
 * - 輸入只有一個 token 且結尾沒有空白：補指令名。
 * - 最後一個 token 是 `|`、`;`、`&&` 右邊的第一個 token（符號後面不加空白也算），或是 `man`、`help` 的參數：補指令名。
 * - 其他情況：把最後一個 token 當路徑補全；路徑裡的 `$NAME` 會用 `env` 展開查目錄，回填維持原寫法。
 *
 * 純字串與虛擬檔案系統運算，不依賴 React、Next.js 或 Phaser。
 * 含空白的檔名先不處理跳脫（tokenizer 也還不支援），第一章沒有這種檔名。
 */

import type { CompletionContext, CompletionResult, FsNode } from "./types";
import { FsError } from "./types";

/** `splitDirAndPrefix` 的結果。 */
export interface DirAndPrefix {
	/**
	 * 目錄部分，包含結尾的 `/`，原樣保留玩家輸入的寫法。
	 * 例如 `~/`、`../`、`/deck1/systems/`；沒有 `/` 時是空字串。
	 */
	dirPart: string;
	/** 最後一個 `/` 之後的部分，也就是要被補全的前綴，可能是空字串。 */
	prefix: string;
}

function isWhitespace(char: string): boolean {
	return char === " " || char === "\t";
}

/**
 * 最後一個 token 從哪裡開始：往回掃到空白或 `;`、`|`、`&` 就停。
 * 符號後面不加空白（`ls;ca`、`cd logs&&wh`、`cat x|so`）時，要補的只有符號後面那一段。
 */
function isTokenBoundary(char: string): boolean {
	return isWhitespace(char) || char === ";" || char === "|" || char === "&";
}

/**
 * 把路徑 token 拆成目錄部分與前綴部分，以最後一個 `/` 為界。
 * 目錄部分保留結尾的 `/`，方便原樣接回去。
 *
 * @example splitDirAndPrefix("/home/abin/da") // { dirPart: "/home/abin/", prefix: "da" }
 * @example splitDirAndPrefix("wa") // { dirPart: "", prefix: "wa" }
 * @example splitDirAndPrefix("~/") // { dirPart: "~/", prefix: "" }
 */
export function splitDirAndPrefix(token: string): DirAndPrefix {
	const slashIndex = token.lastIndexOf("/");

	if (slashIndex === -1) {
		return { dirPart: "", prefix: token };
	}

	return {
		dirPart: token.slice(0, slashIndex + 1),
		prefix: token.slice(slashIndex + 1),
	};
}

/**
 * 算出所有名稱的共同前綴，逐字比對，區分大小寫。
 * 空陣列回傳空字串；只有一個名稱時回傳該名稱本身。
 *
 * @example longestCommonPrefix(["help", "hint", "history"]) // "h"
 */
export function longestCommonPrefix(names: string[]): string {
	if (names.length === 0) {
		return "";
	}

	// 用 Array.from 以字元（code point）為單位，避免把代理對（surrogate pair）切成兩半
	let common = Array.from(names[0]);

	for (const name of names.slice(1)) {
		const chars = Array.from(name);
		let length = 0;

		while (length < common.length && length < chars.length && common[length] === chars[length]) {
			length += 1;
		}

		common = common.slice(0, length);

		if (common.length === 0) {
			break;
		}
	}

	return common.join("");
}

/**
 * 取出 `head` 裡最後一段指令（`|`、`;`、`&&` 右邊）的內容，去掉前後空白。
 * 跟補全的其他部分一樣不走 tokenizer，引號裡的符號也會被當成分隔，但只影響「補指令名還是路徑」的判斷。
 *
 * @example lastCommandSegment("ls ; man ") // "man"
 * @example lastCommandSegment("ps | ") // ""
 */
function lastCommandSegment(head: string): string {
	const segments = head.split(/&&|[|;]/);
	return segments[segments.length - 1].trim();
}

/** 指令名補全。 */
function completeCommandName(head: string, prefix: string, context: CompletionContext): CompletionResult {
	const original = head + prefix;
	const matches = Array.from(new Set(context.commandNames))
		.filter((name) => name.startsWith(prefix))
		.sort((a, b) => a.localeCompare(b, "en"));

	if (matches.length === 0) {
		return { completed: original, candidates: [] };
	}

	if (matches.length === 1) {
		return { completed: `${head}${matches[0]} `, candidates: matches };
	}

	return { completed: head + longestCommonPrefix(matches), candidates: matches };
}

/**
 * 把路徑裡的 `$NAME` 換成環境變數的值，只用在查目錄，回填給玩家的字串維持原寫法。
 * 沒給 `env` 或變數沒定義時原樣保留（之後 `fs.list` 查不到就回空候選，不會誤導）。
 */
function expandEnvInPath(path: string, env: Record<string, string> | undefined): string {
	if (env === undefined) {
		return path;
	}

	return path.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name: string) => env[name] ?? whole);
}

/** 路徑補全。`head` 是最後一個 token 之前的所有輸入（含空白），原樣保留。 */
function completePath(head: string, token: string, context: CompletionContext): CompletionResult {
	const original = head + token;
	const { dirPart, prefix } = splitDirAndPrefix(token);
	// 跟 bash 一樣：玩家已經打了 `.` 才列出隱藏檔
	const includeHidden = prefix.startsWith(".");

	let entries: FsNode[];
	try {
		entries = context.fs.list(context.cwd, expandEnvInPath(dirPart, context.env) || ".", { includeHidden });
	} catch (error) {
		// 目錄部分不存在或不是目錄：原樣回傳，不 throw
		if (error instanceof FsError) {
			return { completed: original, candidates: [] };
		}

		throw error;
	}

	const matches = entries.filter((node) => node.name.startsWith(prefix));

	if (matches.length === 0) {
		return { completed: original, candidates: [] };
	}

	if (matches.length === 1) {
		const [node] = matches;

		// 目錄補 `/` 讓玩家繼續往下打，檔案補空格讓玩家繼續輸入下一個參數
		if (node.type === "dir") {
			return { completed: `${head}${dirPart}${node.name}/`, candidates: [`${node.name}/`] };
		}

		return { completed: `${head}${dirPart}${node.name} `, candidates: [node.name] };
	}

	const names = matches.map((node) => node.name);
	const candidates = matches.map((node) => {
		if (node.type === "dir") {
			return `${node.name}/`;
		}

		return node.name;
	});

	return {
		completed: head + dirPart + longestCommonPrefix(names),
		candidates,
	};
}

/**
 * 對輸入做 Tab 補全，游標視為在輸入結尾。
 *
 * - 空字串或只有空白：列出全部指令名，`completed` 等於原輸入。
 * - 只有一個 token 且結尾沒有空白，或是 `|`、`;`、`&&` 右邊的第一個 token：補指令名。
 * - 其他：把最後一個 token 當路徑補全，前面的 token 與目錄部分原樣保留。
 *
 * 補全結果的三種情況（唯一、多個、沒有）見 `CompletionResult`。
 * 目錄不存在或不是目錄時回傳原輸入與空候選，不會 throw。
 */
export function complete(input: string, context: CompletionContext): CompletionResult {
	if (input.trim() === "") {
		const all = Array.from(new Set(context.commandNames)).sort((a, b) => a.localeCompare(b, "en"));
		return { completed: input, candidates: all };
	}

	// 找出最後一個 token 的起點：最後一個空白或 `;`、`|`、`&` 之後
	let tokenStart = input.length;
	while (tokenStart > 0 && !isTokenBoundary(input[tokenStart - 1])) {
		tokenStart -= 1;
	}

	const head = input.slice(0, tokenStart);
	const lastToken = input.slice(tokenStart);
	// 最後一段指令：`|`、`;`、`&&` 右邊的部分。整行只有一個 token 時是空字串
	const segmentHead = lastCommandSegment(head);

	// 每一段的第一個 token 是指令；man 與 help 的參數是指令名，不是路徑
	if (segmentHead === "" || segmentHead === "man" || segmentHead === "help") {
		return completeCommandName(head, lastToken, context);
	}

	return completePath(head, lastToken, context);
}
