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

import type { FsErrorCode, ListConnector, ParseError, RegexErrorCode } from "./types";

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

/** `;` 或 `&&` 旁邊少了指令，例如 `; ls`、`ls ;; pwd`、`cd logs &&`。 */
export function emptyListCommand(operator: ListConnector): string[] {
	if (operator === ";") {
		return [
			"`;` 的左邊要有指令，它的意思是「做完左邊再做右邊」，不管左邊成功還是失敗。",
			"例如 cd logs; ls，先走進 logs，再列出裡面的檔案。",
		];
	}
	return [
		"`&&` 的兩邊都要有指令，它的意思是「左邊成功了才做右邊」。",
		"例如 cd logs && ls，走得進 logs 才列出裡面的檔案。",
	];
}

/**
 * 引號外出現遊戲的 shell 不支援的寫法（M13-1），`detail` 是那個符號。
 * 明講不支援，再給一個用支援的語法做得到的替代寫法。
 */
export function unsupportedSyntax(detail: string): string[] {
	if (detail === "||") {
		return [
			"這個遊戲的 shell 不支援 `||`（前一個指令失敗才執行下一個）。",
			"請分兩行輸入：先打前一個指令，失敗了再打下一個。要「成功了才接著做」用 &&，例如 cd logs && ls。",
		];
	}
	if (detail === "&") {
		return [
			"這個遊戲的 shell 不支援 `&`（把指令丟到背景執行）。",
			"這裡的指令都會馬上跑完，把 & 拿掉就好；要接著執行下一個指令用 && 或 ;，例如 cd logs && ls。",
		];
	}
	if (detail === "<" || detail === "<<") {
		return [
			`這個遊戲的 shell 不支援 \`${detail}\`（從別的地方讀進輸入）。`,
			"直接把檔名接在指令後面就好，例如 sort data.txt；或是用 cat 讀出來再接 |，例如 cat data.txt | sort。",
		];
	}
	if (detail === "$(") {
		return [
			"這個遊戲的 shell 不支援 `$( )`（把一個指令的輸出塞進另一個指令）。",
			"先單獨執行括號裡的指令，再把看到的結果打進下一個指令。",
		];
	}
	if (detail === "`") {
		return [
			"這個遊戲的 shell 不支援反引號「`」（把一個指令的輸出塞進另一個指令）。",
			"先單獨執行反引號裡的指令，再把看到的結果打進下一個指令。",
		];
	}
	// 其餘都是指定檔案描述元的重導向：2>、2>>、2>&1、1>、&>、>&2、|&
	return [
		`這個遊戲的 shell 不支援 \`${detail}\` 這種寫法（在 > 或 | 旁邊加數字或 &，用來另外處理錯誤訊息）。`,
		"錯誤訊息會直接印在畫面上，把這一段拿掉就好；要把輸出存進檔案用 > 或 >>，例如 ls > list.txt。",
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
			if (error.detail === ";" || error.detail === "&&") {
				return emptyListCommand(error.detail);
			}
			return emptyCommand(error.detail);
		case "MISSING_REDIRECT_TARGET":
			return missingRedirectTarget(error.detail);
		case "UNSUPPORTED_SYNTAX":
			return unsupportedSyntax(error.detail);
	}
}

// ---------------------------------------------------------------------------
// 檔案系統錯誤
// ---------------------------------------------------------------------------

/**
 * 路徑不存在。
 * 單純檔名時「這個目錄下沒有」是對的；含斜線或 `~` 的路徑指向別處，
 * 再說「這個目錄下、用 ls 看看」會把玩家導去錯的地方（新手走查實測三次撞到）。
 */
export function pathNotFound(path: string): string[] {
	if (path.includes("/") || path.startsWith("~")) {
		return [`找不到 \`${path}\`。檢查路徑有沒有拼錯，或先用 ls 看看上一層目錄裡實際有什麼。`];
	}
	return [`這個目錄下沒有 \`${path}\`，用 ls 看看有什麼。`];
}

/** `mkdir` 的上層目錄不存在：教 -p，不要只說「沒有這個路徑」。 */
export function mkdirParentMissing(path: string): string[] {
	return [`上層目錄不存在，要連著父目錄一起建的話用 -p：mkdir -p ${path}。`];
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

/** `cd` 給了兩個以上的參數，例如 `cd logs 2028`（bash：`cd: too many arguments`）。 */
export function cdTooManyArguments(): string[] {
	return [
		"`cd` 的參數太多了，一次只能走進一個目錄，例如 cd logs。",
		'要往下走好幾層用 / 接起來，例如 cd logs/2028；名稱裡有空白就用引號包起來，例如 cd "my dir"。',
	];
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
	return ["提示已經全部給過了，上面是最詳細的一段。照著一步一步打，用到前一個指令印出的路徑就照實抄過來；指令用法不確定可以用 man 查。"];
}

/** 這台終端機的劇本沒有提供任何提示。 */
export function hintNotAvailable(): string[] {
	return ["這台終端機沒有提示，先用 ls 看看四周有什麼。"];
}

/** history 沒有任何紀錄。 */
export function historyEmpty(): string[] {
	return ["還沒有任何指令紀錄，先打幾個指令試試，例如 ls。"];
}

// ---------------------------------------------------------------------------
// M13-3：tree、cut、diff、which、less
// ---------------------------------------------------------------------------

/** `tree -L` 後面不是正整數，例如 `tree -L 0`（tree：Invalid level, must be greater than 0）。 */
export function invalidTreeLevel(value: string): string[] {
	return [`\`${value}\` 不是有效的層數，tree 的 -L 後面要接 1 以上的整數，例如 tree -L 2。`];
}

/** `tree` 碰到讀不到的目錄時，接在目錄名稱後面的標記（tree：[error opening dir]）。 */
export function treeUnreadableMark(): string {
	return "[沒有讀取權限，打不開]";
}

/** `cut` 沒有指定 `-f` 或 `-c`（cut：you must specify a list of bytes, characters, or fields）。 */
export function cutMissingList(): string[] {
	return [
		"cut 需要知道要切出哪一段：-f 取欄位（搭配 -d 指定分隔字元），或 -c 取字元位置。",
		"例如 cut -d , -f 2 crew.csv 取逗號分隔的第二欄，cut -c 1-5 door.log 取每行前五個字。",
	];
}

/** `cut` 同時給了 `-f` 與 `-c`（cut：only one list may be specified）。 */
export function cutConflictingLists(): string[] {
	return ["cut 的 -f 和 -c 不能一起用：-f 是依分隔字元切欄位，-c 是依字元位置切，選一個就好。"];
}

/** `cut -d` 搭配 `-c`（cut：an input delimiter may be specified only when operating on fields）。 */
export function cutDelimiterNeedsFields(): string[] {
	return ["cut 的 -d 只能跟 -f 一起用：分隔字元是用來切欄位的，-c 依字元位置切不需要它，例如 cut -d , -f 2 crew.csv。"];
}

/** `cut -s` 搭配 `-c`（cut：suppressing non-delimited lines makes sense only when operating on fields）。 */
export function cutSuppressNeedsFields(): string[] {
	return ["cut 的 -s 只能跟 -f 一起用：它的意思是「不印沒有分隔字元的行」，-c 依字元位置切用不到它。"];
}

/** `cut -d` 的分隔字元不是剛好一個字（cut：the delimiter must be a single character）。 */
export function cutInvalidDelimiter(value: string): string[] {
	return [`\`${value}\` 不能當分隔字元，cut 的 -d 後面要接剛好一個字，例如 -d , 或 -d :；空白要用引號包起來：-d " "。`];
}

/**
 * `cut -f`／`-c` 的清單寫法不對：`zero` 是從 0 開始數（cut：fields are numbered from 1）、
 * `decreasing` 是範圍前大後小（cut：invalid decreasing range）、`invalid` 是看不懂的寫法。
 */
export function cutInvalidList(list: string, reason: "zero" | "decreasing" | "invalid"): string[] {
	let detail = "可以寫 2、1,3、2-4 或 3-（第 3 個到最後）";
	if (reason === "zero") {
		detail = "位置從 1 開始數，沒有第 0 個";
	} else if (reason === "decreasing") {
		detail = "範圍要小的在前，例如 1-3，不是 3-1";
	}
	return [`\`${list}\` 不是 cut 看得懂的位置清單：${detail}。`];
}

/** `diff` 的兩個參數都是目錄（GNU diff 會比整個目錄，這個遊戲的 diff 只比檔案）。 */
export function diffDirectories(first: string, second: string): string[] {
	return [
		`\`${first}\` 和 \`${second}\` 都是目錄，這台站的 diff 只能比較兩個檔案。`,
		`先用 ls 看看兩邊有哪些檔案，再一個一個比，例如 diff ${first}/檔名 ${second}/檔名。`,
	];
}
