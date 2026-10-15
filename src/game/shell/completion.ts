/**
 * Tab 補全。
 *
 * 只處理「游標在輸入結尾」的情況：
 * - 輸入只有一個 token 且結尾沒有空白：補指令名。
 * - 最後一個 token 是 `|`、`;`、`&&` 右邊的第一個 token（符號後面不加空白也算），或是 `man`、`help` 的參數：補指令名。
 * - 最後一個 token 是 `$`、`${` 開頭（前面可以有一個 `"`）、還沒有 `/`：補環境變數名（第十九場）。
 * - 最後一個 token 是 `-` 開頭：補那一段指令的選項（第十九場，來源 `commands/docsOptions.ts`），對不上任何選項時照舊補路徑。
 * - 其他情況：把最後一個 token 當路徑補全；路徑裡的 `$NAME` 會用 `env` 展開查目錄，回填維持原寫法。
 * - 一段開頭的 `explain` 不算那一段的指令：`explain ls -` 補 ls 的選項、`explain gr` 補指令名。
 *
 * 純字串與虛擬檔案系統運算，不依賴 React、Next.js 或 Phaser。
 * 含空白的檔名先不處理跳脫（tokenizer 也還不支援），第一章沒有這種檔名。
 */

import { getCommandArgsDoc, optionCompletionDescription, optionSpellings } from "./commands/docsOptions";
import type { CompletionContext, CompletionResult, FsNode } from "./types";
import { FsError } from "./types";

/** 後面整段是另一個指令的指令：補全時跳過它，看它後面那個指令（`explain ls -` 補 ls 的選項）。 */
const PREFIX_COMMANDS = new Set(["explain"]);

/** 一段開頭的第一個字與後面的空白。 */
const FIRST_WORD = /^(\S+)(?:\s+|$)/;

/**
 * 要補變數名的 token：可有可無的雙引號（雙引號裡的 `$` 會展開）、`$` 或 `${`、還沒打完的名稱。
 * 名稱後面已經有 `/` 的（`$POD_DIR/PT`）不算，交給路徑補全。
 */
const VARIABLE_TOKEN = /^("?)(\$\{?)([A-Za-z_][A-Za-z0-9_]*)?$/;

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

/**
 * 去掉一段開頭的 `explain`（可以好幾個），剩下的才是要補的那個指令。
 *
 * @example stripPrefixCommands("explain ls") // "ls"
 * @example stripPrefixCommands("explain") // ""
 */
function stripPrefixCommands(segmentHead: string): string {
	let rest = segmentHead;
	let match = FIRST_WORD.exec(rest);
	while (match !== null && PREFIX_COMMANDS.has(match[1])) {
		rest = rest.slice(match[0].length);
		match = FIRST_WORD.exec(rest);
	}
	return rest;
}

/**
 * 指令選項補全：候選是那個指令的選項短名與長名，順序照選項表，附上一句話說明。
 * 指令不在這台終端機、沒有選項表，或沒有任何選項對得上時回傳 null，由呼叫端照舊補路徑。
 */
function completeOption(head: string, token: string, commandName: string, context: CompletionContext): CompletionResult | null {
	if (!context.commandNames.includes(commandName)) {
		return null;
	}
	const doc = getCommandArgsDoc(commandName);
	if (doc === undefined) {
		return null;
	}

	const descriptions: Record<string, string> = {};
	const matches: string[] = [];
	for (const option of doc.options) {
		for (const spelling of optionSpellings(option)) {
			if (spelling.startsWith(token)) {
				matches.push(spelling);
				descriptions[spelling] = optionCompletionDescription(option);
			}
		}
	}

	if (matches.length === 0) {
		return null;
	}
	if (matches.length === 1) {
		return { completed: `${head}${matches[0]} `, candidates: matches, descriptions };
	}
	return { completed: head + longestCommonPrefix(matches), candidates: matches, descriptions };
}

/**
 * 環境變數名補全：唯一候選補完後不加空白（變數後面常接 `/`），`${` 開頭的補上 `}`。
 * token 不是變數寫法、沒給 `env`、或沒有變數對得上時回傳 null，由呼叫端照舊處理。
 */
function completeVariable(head: string, token: string, context: CompletionContext): CompletionResult | null {
	const env = context.env;
	const match = VARIABLE_TOKEN.exec(token);
	if (env === undefined || match === null) {
		return null;
	}

	const quote = match[1];
	const opener = match[2];
	const typed = match[3] ?? "";
	let closer = "";
	if (opener === "${") {
		closer = "}";
	}

	const names = Object.keys(env)
		.filter((name) => name.startsWith(typed))
		.sort((a, b) => a.localeCompare(b, "en"));
	if (names.length === 0) {
		return null;
	}

	const candidates = names.map((name) => `${opener}${name}${closer}`);
	if (names.length === 1) {
		return { completed: `${head}${quote}${opener}${names[0]}${closer}`, candidates };
	}
	return { completed: `${head}${quote}${opener}${longestCommonPrefix(names)}`, candidates };
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
 * - `$`、`${` 開頭的 token：補環境變數名（見 `completeVariable`）。
 * - 只有一個 token 且結尾沒有空白，或是 `|`、`;`、`&&` 右邊的第一個 token：補指令名。
 * - `-` 開頭的 token：補那一段指令的選項（見 `completeOption`），對不上時當路徑。
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
	// 最後一段指令：`|`、`;`、`&&` 右邊的部分，去掉開頭的 explain。整行只有一個 token 時是空字串
	const segmentHead = stripPrefixCommands(lastCommandSegment(head));

	const variable = completeVariable(head, lastToken, context);
	if (variable !== null) {
		return variable;
	}

	// 每一段的第一個 token 是指令；man 與 help 的參數是指令名，不是路徑
	if (segmentHead === "" || segmentHead === "man" || segmentHead === "help") {
		return completeCommandName(head, lastToken, context);
	}

	const commandName = FIRST_WORD.exec(segmentHead)?.[1];
	if (lastToken.startsWith("-") && commandName !== undefined) {
		const option = completeOption(head, lastToken, commandName, context);
		if (option !== null) {
			return option;
		}
	}

	return completePath(head, lastToken, context);
}

/**
 * 把多個候選排成要印在輸出區的行（Tab 列出候選時用）。
 * 有說明（指令選項）時一行一個，名稱補空白對齊後接兩個空白與說明，例如 `-a  連隱藏檔……一起列出`；
 * 沒有說明時照舊把候選用兩個空白接成一行。
 */
export function formatCompletionCandidates(result: CompletionResult): string[] {
	const descriptions = result.descriptions;
	if (descriptions === undefined) {
		return [result.candidates.join("  ")];
	}

	const width = Math.max(0, ...result.candidates.map((candidate) => candidate.length));
	return result.candidates.map((candidate) => {
		const description = descriptions[candidate];
		if (description === undefined) {
			return candidate;
		}
		return `${candidate.padEnd(width)}  ${description}`;
	});
}
