/**
 * 每個已註冊指令接受的選項與參數種類（第十九場，設計文件 4.15）。
 *
 * `explain` 拆解一行指令、Tab 補全指令選項都看這一份。內容照各指令的實作列（`commands/*.ts` 的選項解析），
 * 不是照真的 GNU 工具：遊戲的 `ls` 只有 `-a`、`-l`，這裡就只列這兩個。
 * `docsOptions.test.ts` 會拿表裡的每個選項真的執行一次該指令，也會確認表外的單字母選項都被擋下，
 * 改了指令的選項卻忘了改這裡，測試會紅。
 *
 * 檔尾另有 explain 說明語法符號（`|`、`>`、`;`、`&&`、`*`、`?`……）用的一句話：
 * 概念字典 `docsConcepts.ts` 有的直接用它的 summary，沒有的（`;`、`&&`、`?`）補在這裡。
 */

import { CONCEPT_DOCS } from "./docsConcepts";

/** 一個選項。 */
export interface OptionDoc {
	/** 短名，例如 `-a`、`-n`；find 的 `-name`、kill 的 `-KILL` 這種一個 dash 的多字母寫法也放這裡。 */
	short: string;
	/**
	 * 長名，例如 `--all`。遊戲的指令目前都不收長選項（`--all` 一律回「沒有這個選項」），所以目前沒有一筆有；
	 * 之後哪個指令支援了，加在這裡就會被 explain 與 Tab 補全認得。
	 */
	long?: string;
	/** 會吃掉一個值時，那個值的稱呼，例如 `行數`；不接值的選項沒有這個欄位。 */
	value?: string;
	/** 值只有固定幾種時，每一種值的說明（find 的 `-type f`、`-type d`）。 */
	values?: Record<string, string>;
	/** 一句話說明。 */
	summary: string;
}

/**
 * 不是選項的參數是什麼東西，決定 explain 怎麼說明它：
 * - `path`：檔案或目錄，explain 會查它存不存在
 * - `text`：要印出來的文字（echo）
 * - `pattern`：要找的樣式（grep 的第一個參數）
 * - `command`：指令名稱（man、help、which）
 * - `variable`：變數名稱（unset）
 * - `assignment`：`名稱=值`（export）
 * - `pid`：程序編號（kill）
 * - `mode`：權限寫法（chmod 的第一個參數）
 * - `user`：帳號名稱（id、last）
 */
export type OperandKind = "path" | "text" | "pattern" | "command" | "variable" | "assignment" | "pid" | "mode" | "user";

/**
 * 選項的寫法：
 * - `letters`：單字母選項可以合併（`-la`）；接值的字母後面還有字時那些字就是值（`-n5`、`-d,`），
 *   沒有時吃下一個參數（`-n 5`、`-dL 2`）。`--` 之後全部是參數。
 * - `words`：每個選項是完整的一個參數，不能合併（find 的 `-name`、kill 的 `-9`、unset 的 `-v`）；`--` 不結束選項。
 * - `none`：沒有選項，`-` 開頭的也是參數（chmod 的 `-r` 是「拿掉讀取權限」）。
 */
export type OptionStyle = "letters" | "words" | "none";

/** 一個指令的選項與參數說明。 */
export interface CommandArgsDoc {
	options: OptionDoc[];
	style: OptionStyle;
	/** 參數依位置的種類，超過長度的都用最後一個；沒給時全部是路徑。空陣列代表這個指令不接參數。 */
	operands?: OperandKind[];
	/** 這個指令不看任何參數（ps、pwd、clear……），給了也一樣。 */
	ignoresArgs?: boolean;
	/** 選項只認開頭連續的那幾個，遇到第一個不認得的 `-x` 或參數之後全部是參數（echo）。 */
	leadingOptionsOnly?: boolean;
	/** 純數字的選項是哪個選項的簡寫（head、tail 的 `-5` 等於 `-n 5`）。 */
	numericShorthand?: string;
	/** 參數本身是另一個完整的指令（sudo、explain），explain 往下一層說明它。 */
	nestedCommand?: boolean;
}

/** 不看參數的指令共用的說明（pwd、hint、history、clear、ps、exit、logout）。 */
const IGNORES_ARGS: CommandArgsDoc = { options: [], style: "letters", ignoresArgs: true };

/** 沒有選項、參數全是路徑的指令共用的說明（cd、cat、touch、mv）。`-x` 會被當成「沒有這個選項」說明。 */
const PATHS_ONLY: CommandArgsDoc = { options: [], style: "letters" };

/** head 與 tail 的參數只差在看開頭還是結尾。 */
function lineCountArgs(summary: string): CommandArgsDoc {
	return {
		options: [{ short: "-n", value: "行數", summary }],
		style: "letters",
		numericShorthand: "-n",
	};
}

/**
 * 每個已註冊指令的選項與參數說明，key 是指令名稱，順序照 `ALL_COMMANDS`。
 * 選項的說明一句話就好，寫法跟 `man` 的說明一致；細節（例如 grep 的正規表示式）留給 `man`。
 */
export const COMMAND_ARGS: Record<string, CommandArgsDoc> = {
	// 第一章
	pwd: IGNORES_ARGS,
	ls: {
		options: [
			{ short: "-a", summary: "連隱藏檔（. 開頭的檔案）一起列出" },
			{ short: "-l", summary: "用詳細格式列出：權限、擁有者、大小與修改日期" },
		],
		style: "letters",
	},
	cd: PATHS_ONLY,
	cat: PATHS_ONLY,
	help: { options: [], style: "letters", operands: ["command"] },
	hint: IGNORES_ARGS,
	man: { options: [], style: "letters", operands: ["command"] },
	history: IGNORES_ARGS,
	clear: IGNORES_ARGS,
	// 第二章
	head: lineCountArgs("只看開頭幾行，不給時是 10 行"),
	tail: lineCountArgs("只看結尾幾行，不給時是 10 行"),
	wc: {
		options: [
			{ short: "-l", summary: "只算行數" },
			{ short: "-w", summary: "只算字數" },
			{ short: "-c", summary: "只算位元組數" },
		],
		style: "letters",
	},
	grep: {
		options: [
			{ short: "-i", summary: "不分大小寫" },
			{ short: "-n", summary: "在每一行前面加上行號" },
			{ short: "-c", summary: "只印有幾行符合" },
			{ short: "-v", summary: "反過來，印出不符合的行" },
			{ short: "-r", summary: "走進目錄，把底下所有檔案都搜一遍" },
			{ short: "-w", summary: "只算整個單字的符合" },
			{ short: "-o", summary: "只印符合的那一段，一段一行" },
			{ short: "-E", summary: "用延伸正規表示式，多了 +、?、| 與 ( )" },
			{ short: "-F", summary: "樣式照字面比對，不當成正規表示式" },
		],
		style: "letters",
		operands: ["pattern", "path"],
	},
	find: {
		options: [
			{ short: "-name", value: "樣式", summary: "依檔名找" },
			{ short: "-iname", value: "樣式", summary: "依檔名找，不分大小寫" },
			{
				short: "-type",
				value: "類型",
				values: { f: "只找檔案", d: "只找目錄" },
				summary: "只找檔案或只找目錄",
			},
		],
		style: "words",
	},
	// 第三章
	mkdir: {
		options: [{ short: "-p", summary: "連上一層目錄一起建，已經存在也不報錯" }],
		style: "letters",
	},
	touch: PATHS_ONLY,
	cp: {
		options: [
			{ short: "-r", summary: "連同目錄裡的東西整個複製" },
			{ short: "-R", summary: "跟 -r 一樣" },
		],
		style: "letters",
	},
	mv: PATHS_ONLY,
	rm: {
		options: [
			{ short: "-r", summary: "連同目錄裡的東西整個刪掉" },
			{ short: "-R", summary: "跟 -r 一樣" },
			{ short: "-f", summary: "要刪的東西不存在也不報錯" },
		],
		style: "letters",
	},
	// 第四章
	echo: {
		options: [{ short: "-n", summary: "結尾不換行（這台終端機一行一行顯示，看起來沒有差別）" }],
		style: "words",
		operands: ["text"],
		leadingOptionsOnly: true,
	},
	sort: {
		options: [
			{ short: "-r", summary: "反過來，由大到小排" },
			{ short: "-n", summary: "依每行開頭的數字大小排" },
			{ short: "-u", summary: "排完把重複的行只留一個" },
		],
		style: "letters",
	},
	uniq: {
		options: [
			{ short: "-c", summary: "在每行前面加上連續出現的次數" },
			{ short: "-d", summary: "只印有重複的行" },
		],
		style: "letters",
	},
	// 第五章
	export: { options: [], style: "letters", operands: ["assignment"] },
	env: { options: [], style: "letters", operands: [] },
	chmod: { options: [], style: "none", operands: ["mode", "path"] },
	unset: {
		options: [{ short: "-v", summary: "拿掉變數（本來就是這樣，加不加都一樣）" }],
		style: "words",
		operands: ["variable"],
	},
	// 第六章
	ps: IGNORES_ARGS,
	top: { options: [], style: "letters", operands: [] },
	kill: {
		options: [
			{ short: "-9", summary: "強制終止，程序沒辦法拒絕" },
			{ short: "-KILL", summary: "跟 -9 一樣" },
			{ short: "-15", summary: "請程序自己結束（不加訊號時就是這個）" },
			{ short: "-TERM", summary: "跟 -15 一樣" },
		],
		style: "words",
		operands: ["pid"],
	},
	// M13-3：只開放使用，不在劇本裡
	tree: {
		options: [
			{ short: "-a", summary: "連隱藏檔一起畫" },
			{ short: "-d", summary: "只畫目錄" },
			{ short: "-L", value: "層數", summary: "只往下畫幾層" },
		],
		style: "letters",
	},
	cut: {
		options: [
			{ short: "-d", value: "分隔字元", summary: "欄位之間的分隔字元，不給時用 Tab" },
			{ short: "-f", value: "欄位", summary: "依欄位切，要哪幾欄" },
			{ short: "-c", value: "位置", summary: "依字元位置切，要哪幾個字" },
			{ short: "-s", summary: "略過沒有分隔字元的行" },
		],
		style: "letters",
	},
	diff: {
		options: [
			{ short: "-u", summary: "改用 - 與 + 標出刪掉和加入的行，前後附三行對照" },
			{ short: "-q", summary: "只說兩個檔案有沒有不同" },
		],
		style: "letters",
	},
	which: {
		options: [{ short: "-a", summary: "列出 PATH 裡每一個找得到的位置" }],
		style: "letters",
		operands: ["command"],
	},
	less: {
		options: [{ short: "-N", summary: "每一行前面加上行號" }],
		style: "letters",
	},
	// 第十七場：帳號與登入的彩蛋
	whoami: { options: [], style: "letters", operands: [] },
	id: { options: [], style: "letters", operands: ["user"] },
	last: { options: [], style: "letters", operands: ["user"] },
	sudo: { options: [], style: "none", nestedCommand: true },
	exit: IGNORES_ARGS,
	logout: IGNORES_ARGS,
	// 第十九場
	explain: { options: [], style: "none", nestedCommand: true },
	tr: {
		options: [
			{ short: "-d", summary: "刪掉第一組裡的字元" },
			{ short: "-s", summary: "把連續重複的字元壓成一個" },
		],
		style: "letters",
		operands: ["text"],
	},
	tee: {
		options: [{ short: "-a", summary: "接在檔案結尾，不蓋掉原本的內容" }],
		style: "letters",
	},
	xargs: {
		options: [
			{ short: "-n", value: "個數", summary: "每次最多接幾個項目給指令" },
			{ short: "-I", value: "代換字串", summary: "每個項目各執行一次，把指令裡的代換字串換成那個項目" },
			{ short: "-r", summary: "沒有任何項目時不執行（這裡本來就是這樣）" },
		],
		style: "letters",
		operands: ["command"],
		nestedCommand: true,
	},
	sed: {
		options: [
			{ short: "-n", summary: "不自動印每一行，只印 p 指令指定的" },
			{ short: "-E", summary: "用延伸正規表示式，多了 +、?、| 與 ( )" },
			{ short: "-r", summary: "同 -E" },
			{ short: "-i", summary: "直接改檔案，不印到畫面" },
			{ short: "-e", value: "腳本", summary: "再加一段腳本，依序套用" },
		],
		style: "letters",
		operands: ["pattern", "path"],
	},
	date: {
		options: [{ short: "-u", summary: "用世界標準時間顯示（這裡本來就是）" }],
		style: "letters",
		operands: ["text"],
	},
	alias: {
		options: [{ short: "-p", summary: "列出全部別名（不加參數也一樣）" }],
		style: "letters",
		operands: ["assignment"],
	},
	unalias: {
		options: [{ short: "-a", summary: "拿掉全部別名" }],
		style: "letters",
		operands: ["command"],
	},
};

/**
 * 取得指令的選項與參數說明，沒有這個指令時回傳 `undefined`。
 * 用 `Object.hasOwn` 判斷，避免 `constructor` 這類原型上的名稱被當成指令。
 */
export function getCommandArgsDoc(name: string): CommandArgsDoc | undefined {
	if (!Object.hasOwn(COMMAND_ARGS, name)) {
		return undefined;
	}
	return COMMAND_ARGS[name];
}

/** 選項的所有寫法：短名，加上有的話的長名。 */
export function optionSpellings(option: OptionDoc): string[] {
	const spellings = [option.short];
	if (option.long !== undefined) {
		spellings.push(option.long);
	}
	return spellings;
}

/** Tab 補全列候選時的說明：接值的選項多一句後面要接什麼，例如「只看開頭幾行，不給時是 10 行（後面接行數）」。 */
export function optionCompletionDescription(option: OptionDoc): string {
	if (option.value === undefined) {
		return option.summary;
	}
	return `${option.summary}（後面接${option.value}）`;
}

/** explain 會說明的語法符號。`$` 代表參數裡的 `$名稱`。 */
export type SyntaxSymbol = "|" | ">" | ">>" | ";" | "&&" | "||" | "<" | "2>" | "2>>" | "2>&1" | "&>" | "*" | "?" | "~" | "$" | "..";

/** 概念字典沒有的語法符號（它們不在任何章節的 teaches 裡，不需要完整的概念條目）。 */
const EXTRA_SYNTAX_SUMMARIES: Record<string, string> = {
	";": "不管前一段成功還是失敗，都接著執行下一段",
	"&&": "前一段成功了才執行下一段",
	"?": "萬用字元，代表任意一個字",
	"2>>": "把錯誤訊息接在檔案結尾",
	"2>&1": "把錯誤訊息跟一般輸出寫到同一個地方",
	"&>": "一般輸出與錯誤訊息都寫進同一個檔案",
};

/** 語法符號的一句話說明：概念字典有的用它的 summary（`$` 查 `$變數`），沒有的用 `EXTRA_SYNTAX_SUMMARIES`。 */
export function syntaxSummary(symbol: SyntaxSymbol): string {
	let conceptKey: string = symbol;
	if (symbol === "$") {
		conceptKey = "$變數";
	}
	if (Object.hasOwn(CONCEPT_DOCS, conceptKey)) {
		return CONCEPT_DOCS[conceptKey].summary;
	}
	return EXTRA_SYNTAX_SUMMARIES[symbol] ?? "";
}
