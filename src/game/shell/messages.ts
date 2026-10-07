/**
 * 友善錯誤訊息模組。
 *
 * 所有給玩家看的錯誤與提示文字都集中在這裡，其他模組（指令、shell 入口）
 * 不可以自己寫中文錯誤字串，一律呼叫這裡的函式。
 *
 * 每個函式回傳 `string[]`，一個元素代表終端機的一行，多數只有一行。
 * 語氣像耐心的教學者：不責怪玩家，並且告訴玩家下一步可以做什麼。
 * 指令與路徑用反引號包住。
 */

import type { FsErrorCode, ParseError, RegexErrorCode } from "./types";

// ---------------------------------------------------------------------------
// 解析階段的錯誤
// ---------------------------------------------------------------------------

/** 指令不存在。 */
export function commandNotFound(name: string): string[] {
	return [`找不到指令 \`${name}\`，輸入 help 看看目前會的指令，或輸入 hint 拿提示。`];
}

/** 忘記空格，例如 `cdmedbay` 其實是 `cd medbay`。 */
export function missingSpace(command: string, rest: string): string[] {
	return [`你是不是想打 \`${command} ${rest}\`？指令和參數之間要有空格。`];
}

/** 偵測到全形字元（全形空白或全形標點）。 */
export function fullwidthChar(char: string): string[] {
	return [`偵測到全形字元「${char}」，請切換成英文輸入法再試一次。`];
}

/** 引號沒有成對關閉。 */
export function unclosedQuote(quote: string): string[] {
	return [`引號 ${quote} 沒有關起來，請在結尾補上另一個 ${quote}，或是把引號拿掉再試一次。`];
}

/** `|` 的前面或後面沒有指令，例如 `ls |` 或 `| sort`。 */
export function emptyCommand(operator: string): string[] {
	return [
		`\`${operator}\` 的兩邊都要有指令，它的意思是「把左邊的輸出交給右邊」。`,
		"例如 cat log.txt | grep ERROR，左邊讀檔案，右邊從裡面挑出含 ERROR 的行。",
	];
}

/** `>` 或 `>>` 後面沒有檔名。 */
export function missingRedirectTarget(operator: string): string[] {
	return [`\`${operator}\` 後面要接一個檔名，輸出才有地方存，例如 ls > list.txt。`];
}

/** `>` 或 `>>` 前面沒有指令（例如一行只打 `> out.txt`），或一行出現第二個重導向。 */
export function missingCommandForRedirect(operator: string): string[] {
	return [
		`\`${operator}\` 的左邊要有一個指令，它的意思是「把左邊指令的輸出存進右邊的檔案」，一行只能有一個。`,
		"例如 echo MAYDAY > outbox.txt。",
	];
}

/** 依解析錯誤代碼分派到對應訊息。 */
export function parseError(error: ParseError): string[] {
	switch (error.code) {
		case "FULLWIDTH_CHAR":
			return fullwidthChar(error.detail);
		case "UNCLOSED_QUOTE":
			return unclosedQuote(error.detail);
		case "EMPTY_COMMAND":
			if (error.detail === ">" || error.detail === ">>") {
				return missingCommandForRedirect(error.detail);
			}
			return emptyCommand(error.detail);
		case "MISSING_REDIRECT_TARGET":
			return missingRedirectTarget(error.detail);
	}
}

// ---------------------------------------------------------------------------
// 檔案系統錯誤
// ---------------------------------------------------------------------------

/** 路徑不存在。 */
export function pathNotFound(path: string): string[] {
	return [`這個目錄下沒有 \`${path}\`，用 ls 看看有什麼。`];
}

/** 對檔案做了目錄操作，例如 `cd` 到檔案，或路徑中間有一段是檔案。 */
export function notADirectory(path: string): string[] {
	return [
		`\`${path}\` 是檔案，不是目錄，所以沒辦法 cd 進去。`,
		"目錄像資料夾，可以走進去；檔案是資料夾裡的內容，要用 cat 來讀，例如 cat 檔名。",
	];
}

/** 對目錄做了檔案操作，例如 `cat` 一個目錄。 */
export function isADirectory(path: string): string[] {
	return [
		`\`${path}\` 是目錄，不是檔案，沒辦法直接讀。`,
		"想走進去用 cd，想看裡面有什麼用 ls，例如 ls 目錄名。",
	];
}

/** 目標已經存在。 */
export function alreadyExists(path: string): string[] {
	return [`\`${path}\` 已經存在了，換一個名字，或用 ls 看看現在有什麼。`];
}

/** 沒有讀取權限（第五章）。 */
export function permissionDenied(path: string): string[] {
	return [
		`沒有權限讀取 \`${path}\`。`,
		"用 ls -l 看它的權限欄，開頭的 r 代表可讀；沒有 r 的話，chmod +r 檔名 可以把讀取權限加回來。",
	];
}

/** 這個節點不能這樣動，例如刪根目錄、把目錄搬進自己底下。 */
export function resourceBusy(path: string): string[] {
	return [`\`${path}\` 不能這樣搬或刪：目錄不能搬進自己底下，根目錄也不能刪。`];
}

/** 依檔案系統錯誤代碼分派到對應訊息。 */
export function fsError(code: FsErrorCode, path: string): string[] {
	switch (code) {
		case "ENOENT":
			return pathNotFound(path);
		case "ENOTDIR":
			return notADirectory(path);
		case "EISDIR":
			return isADirectory(path);
		case "EEXIST":
			return alreadyExists(path);
		case "EACCES":
			return permissionDenied(path);
		case "EBUSY":
			return resourceBusy(path);
	}
}

/**
 * `rm`、`cp`、`grep` 對目錄操作但沒加 `-r`。
 * `example` 是照著打就能用的完整指令，由呼叫端帶上自己的其他參數組出來
 * （例如 grep 要保留搜尋樣式、cp 要保留目的地），不能只是 `指令 -r 路徑`。
 */
export function directoryNeedsRecursive(command: string, path: string, example: string): string[] {
	return [
		`\`${path}\` 是目錄，${command} 預設只處理檔案。`,
		`要連同裡面的東西一起處理，加上 -r：${example}。`,
	];
}

// ---------------------------------------------------------------------------
// 指令用法錯誤
// ---------------------------------------------------------------------------

/**
 * 缺少必要參數。
 * `what` 是缺少的東西加上例句，由呼叫端決定，
 * 例如 `missingOperand("cat", "一個檔名，例如 cat wake_up.txt")`。
 * 第二行固定提示用 man 查用法。
 */
export function missingOperand(command: string, what: string): string[] {
	return [`${command} 需要${what}。`, `不確定怎麼用的話，輸入 man ${command} 看說明。`];
}

/** 不認得的選項，例如 `ls -z`。 */
export function unknownOption(command: string, option: string): string[] {
	return [`\`${command}\` 沒有 \`${option}\` 這個選項，輸入 man ${command} 看看有哪些選項可以用。`];
}

/** 選項需要正整數但給的不是，例如 `head -n abc`、`head -n 0`（0 也算無效，所以不能說「不是數字」）。 */
export function invalidNumber(command: string, value: string): string[] {
	return [`\`${value}\` 不是有效的行數，${command} 的 -n 後面要接 1 以上的整數，例如 ${command} -n 5 檔名。`];
}

/** 指令既沒有檔名參數，也不是管線裡的一環（沒有輸入可讀）。 */
export function noInput(command: string, example: string): string[] {
	return [
		`${command} 需要有東西可以讀：接一個檔名，或是放在 | 的右邊接收前一個指令的輸出。`,
		`例如 ${example}。`,
	];
}

// ---------------------------------------------------------------------------
// grep 樣式、多餘參數
// ---------------------------------------------------------------------------

/** 每種樣式錯誤的原因說明，`invalidPattern` 的第一行用。 */
const REGEX_ERROR_REASONS: Record<RegexErrorCode, string> = {
	TRAILING_BACKSLASH: "結尾多了一個反斜線 \\，反斜線要接在別的字元前面，例如 \\. 代表句點本身",
	UNMATCHED_BRACKET: "[ 沒有對應的 ]，中括號要成對，例如 [0-9]",
	UNMATCHED_PAREN: "括號群組沒有成對，( 和 ) 要一起出現",
	UNMATCHED_BRACE: "{ 沒有對應的 }，次數要寫成 \\{3\\} 這種成對的形式",
	INVALID_INTERVAL: "{} 裡的次數寫法不對，要寫成 {3} 或 {2,5}，而且前面的數字不能比後面大",
	INVALID_RANGE: "[] 裡的範圍寫反了，要小的在前，例如 [a-z]、[0-9]",
	INVALID_CLASS_NAME: "[[:名稱:]] 裡的名稱不認得，可以用 alpha、digit、alnum、upper、lower、space、punct",
	CLASS_SYNTAX: "字元類別要寫兩層中括號，例如 [[:digit:]]，不是 [:digit:]",
	INVALID_BACKREF: "\\1 這類回頭參照要對應到前面已經寫完的括號群組",
};

/** `grep` 的樣式不是合法的正規表示式。 */
export function invalidPattern(command: string, pattern: string, code: RegexErrorCode): string[] {
	return [
		`\`${pattern}\` 不是合法的樣式：${REGEX_ERROR_REASONS[code]}。`,
		`${command} 預設把 . * [ ] ^ $ \\ 當成特殊符號；只想照字面找這串字，加 -F，例如 ${command} -F "a[1" log.txt。`,
	];
}

/** `grep` 同時給了 `-E` 與 `-F`。 */
export function conflictingMatchers(command: string): string[] {
	return [`${command} 的 -E 和 -F 不能一起用：-E 是延伸正規表示式，-F 是照字面比對，選一個就好。`];
}

/** 參數比指令能接受的多，例如 `uniq a b c`。`usage` 是完整用法。 */
export function extraOperand(command: string, operand: string, usage: string): string[] {
	return [`\`${command}\` 多了一個參數 \`${operand}\`，用法是 ${usage}。`, `不確定怎麼用的話，輸入 man ${command} 看說明。`];
}

// ---------------------------------------------------------------------------
// 第五章：變數與權限
// ---------------------------------------------------------------------------

/** `export` 的參數不是 `名稱=值` 的形式。 */
export function invalidAssignment(arg: string): string[] {
	return [
		`\`${arg}\` 不是 名稱=值 的形式。export 的寫法是 export 名稱=值，等號兩邊不要有空格。`,
		"例如 export NOVA_DIR=/opt/nova。",
	];
}

/** 變數名稱不合法（只能是英文字母、數字與底線，而且不能以數字開頭）。 */
export function invalidVariableName(name: string): string[] {
	return [`\`${name}\` 不能當變數名稱，只能用英文字母、數字與底線，而且不能以數字開頭。`];
}

/** `chmod` 的權限寫法看不懂。 */
export function invalidMode(value: string): string[] {
	return [
		`\`${value}\` 不是 chmod 認得的權限寫法。`,
		"可以用 +r、-r、+x、u+r 這種符號寫法（好幾段用逗號接起來，例如 u+x,g-w），或是 644、755 這種三位數字（也可以寫成 0644），例如 chmod +r log.txt。",
	];
}

// ---------------------------------------------------------------------------
// 第六章：程序
// ---------------------------------------------------------------------------

/** `kill` 的參數不是正整數。 */
export function invalidPid(value: string): string[] {
	return [`\`${value}\` 不是程序編號，kill 後面要接 ps 列出的 PID 數字，例如 kill 42。`];
}

/** 沒有這個 PID 的程序。 */
export function noSuchProcess(pid: number): string[] {
	return [`沒有編號 ${pid} 的程序，先用 ps 看看現在有哪些程序在跑。`];
}

/** 程序忽略了一般的終止訊號，要用 `-9`。 */
export function processIgnoredSignal(pid: number, command: string): string[] {
	return [
		`程序 ${pid}（${command}）忽略了終止訊號，還在跑。`,
		"一般的 kill 只是「請它自己結束」，它可以不理。要強制結束用 kill -9 加 PID。",
	];
}

/** 受保護的程序，連 `-9` 都不行。 */
export function processProtected(pid: number, command: string): string[] {
	return [`沒有權限終止程序 ${pid}（${command}），這是系統核心程序，殺掉整座站會停擺。`];
}

// ---------------------------------------------------------------------------
// man / help / hint / history
// ---------------------------------------------------------------------------

/** man 一個不存在的指令。 */
export function manNotFound(name: string): string[] {
	return [`沒有 \`${name}\` 的說明，輸入 help 看看目前會的指令。`];
}

/** 指令存在但玩家還沒學到，留給 help 提示用。 */
export function notLearnedYet(name: string): string[] {
	return [`\`${name}\` 還沒教到，之後的課會學到，先用手上會的指令試試看。`];
}

/** hint 三段都用完後再打 hint。 */
export function hintExhausted(): string[] {
	return ["提示已經全部給過了，上面就是完整答案。照著打一次，或用 man 查指令的用法。"];
}

/** 這台終端機的劇本沒有提供任何提示。 */
export function hintNotAvailable(): string[] {
	return ["這台終端機沒有提示，先用 ls 看看四周有什麼。"];
}

/** history 沒有任何紀錄。 */
export function historyEmpty(): string[] {
	return ["還沒有任何指令紀錄，先打幾個指令試試，例如 ls。"];
}
