/**
 * `explain`：把一整行指令拆開，一項一項說明（第十九場，設計文件 4.15），像 explainshell。
 *
 * 用法 `explain <一整行指令>`。shell 看到一行的開頭是 explain，就把後面的原文整段交給它（`explainTargetOf`），
 * 不先解析 `|`、`>`、`;`，所以 `explain ls | wc -l` 說明的是整條管線，wc 不會真的執行。
 * explain 不在一行的開頭時（`pwd ; explain ls -a`）照一般指令執行，拿到的是 shell 解析、展開過的參數，接回一行再說明。
 *
 * 拆解交給解析器（`parseCommandList`），不自己切字串：一行依 `;`、`&&` 切成段，每段是一條管線，
 * 每個指令再照 `docsOptions.ts` 的選項表把參數分成選項、選項的值與參數。輸出一行一項，用縮排表示層級：
 * - 串了好幾段時每段先印那一段的原文，`;`、`&&` 自己一行；只有一段時直接從指令開始。
 * - 指令一行（名稱加 man 的一句話說明），它的選項與參數往內縮一層；`|` 與重導向跟指令同一層，重導向的檔案再縮一層。
 * - 參數裡的 `$名稱`、開頭的 `~`、路徑裡的 `..`、萬用字元 `*` `?` 再往內縮一層說明。
 *
 * 變數不展開，改說明它是變數並印目前的值。做法是同一行解析兩次：一次不給 env（`$NAME` 保留原樣，給玩家看），
 * 一次給「查什麼名稱都回傳記號」的 env，比對出哪些 `$NAME` 真的會被 shell 展開（單引號裡、反斜線跳脫過的不會）；
 * `~` 也用同一招。兩次解析只差在 word 的內容，段落、指令、參數的個數一樣。
 *
 * 永遠成功（`ok: true`）：只說明、不執行，不扣氧也不算錯誤；那一行有語法錯誤時印解析錯誤的說明。
 * 文字都不寫在這裡：標籤與句型在 `messages.ts`，一句話說明在 `docs.ts`、`docsOptions.ts`、`docsConcepts.ts`。
 */

import {
	explainArgument,
	explainAssignment,
	explainCommandName,
	explainDirectory,
	explainEndOfOptions,
	explainFile,
	explainGlobMatches,
	explainHomeDirectory,
	explainIgnoredArgument,
	explainInvalidOptionValue,
	explainLiteralDollar,
	explainMissingOptionValue,
	explainMissingPath,
	explainMode,
	explainNumericShorthand,
	explainOptionValue,
	explainPattern,
	explainPid,
	explainQuotedGlob,
	explainRedirectTarget,
	explainText,
	explainUnexpectedArgument,
	explainUnknownCommand,
	explainUnknownOption,
	explainUsage,
	explainUser,
	explainVariableName,
	explainVariableValue,
	parseError,
} from "../messages";
import type { ExplainRedirectTargetState } from "../messages";
import { parseCommandList, suggestLowercaseCommand, suggestSimilarCommand } from "../parser";
import type { DetailedCommand, DetailedPipeline, ParsedWord } from "../parser";
import type { CommandContext, CommandDefinition, CommandResult, ParseOptions } from "../types";
import { FsError } from "../types";
import { getCommandDoc } from "./docs";
import { getCommandArgsDoc, syntaxSummary } from "./docsOptions";
import type { CommandArgsDoc, OperandKind, OptionDoc, SyntaxSymbol } from "./docsOptions";

/** 一行的開頭是 explain，後面接空白或行尾。只認半形空白與 Tab，全形空白交給 shell 照常報「偵測到全形字元」。 */
const EXPLAIN_PREFIX = /^[ \t]*explain(?:[ \t]+|$)/;

/** 一層縮排。 */
const INDENT = "  ";

/** 變數記號的頭尾與家目錄記號：Unicode 私用區的字元，玩家打不出來，不會跟輸入的內容撞在一起。 */
const VARIABLE_START = "";
const VARIABLE_END = "";
const HOME_MARK = "";

/** 從標好記號的 word 裡找出會被展開的變數名稱。 */
const VARIABLE_MARK_PATTERN = new RegExp(`${VARIABLE_START}([A-Za-z_][A-Za-z0-9_]*)${VARIABLE_END}`, "g");

/** 沒被展開、照原樣留著的 `$名稱` 或 `${名稱}`（單引號裡、跳脫過的）。 */
const LITERAL_DOLLAR_PATTERN = /\$[A-Za-z_{]/;

/** shell 的萬用字元。 */
const GLOB_PATTERN = /[*?]/;

/** head、tail 的 `-5` 這種純數字選項。 */
const NUMERIC_OPTION_PATTERN = /^-\d+$/;

/** kill 的程序編號只認全是數字的字串。 */
const DIGITS_PATTERN = /^\d+$/;

/** 不管查哪個名稱都回傳「記號包住的名稱」的 env：解析時每個會被展開的 `$NAME` 都換成記號。 */
const MARKING_ENV = new Proxy<Record<string, string>>(
	{},
	{
		get(_target, property) {
			if (typeof property !== "string") {
				return undefined;
			}
			return `${VARIABLE_START}${property}${VARIABLE_END}`;
		},
	},
);

/** 第二次解析用的選項：變數與 `~` 都換成記號。 */
const MARKING_OPTIONS: ParseOptions = { env: MARKING_ENV, home: HOME_MARK };

/** 沒有選項表的指令（測試用的假指令）當成沒有選項、參數全是路徑。 */
const DEFAULT_ARGS_DOC: CommandArgsDoc = { options: [], style: "letters" };

/** 一個要說明的字（指令名、參數、選項的值、重導向的檔名）。 */
interface ExplainWord {
	/** 玩家寫的樣子：去掉引號，`$NAME` 與 `~` 保留原樣。 */
	text: string;
	/** 這個字裡會被展開的變數，依出現順序，同名只留一個。 */
	variables: string[];
	/** 開頭的 `~` 會換成家目錄。 */
	tilde: boolean;
	/** 有沒展開、照原樣留著的 `$`。 */
	literalDollar: boolean;
	/** 萬用字元：`expand` 沒有引號會被 shell 展開、`literal` 被引號或反斜線擋住、`none` 沒有萬用字元。 */
	glob: "expand" | "literal" | "none";
	/** 拿去虛擬檔案系統查的路徑（`~` 換成家目錄）；含變數時是 null，不展開就不知道指向哪裡。 */
	fsPath: string | null;
}

/** 一個要說明的指令：名稱與參數都已經整理成 `ExplainWord`。 */
interface ExplainCommandWords {
	name: ExplainWord;
	args: ExplainWord[];
}

/** 選項的值：黏在選項後面的（`-n5`）只有文字，分開寫的（`-n 5`）是完整的一個字，還要說明裡面的變數。 */
interface OptionValue {
	text: string;
	word: ExplainWord | null;
}

/** 參數分類之後的一項，`label` 是那一行開頭要印的寫法。 */
type ArgItem =
	| { kind: "option"; label: string; option: OptionDoc; value: OptionValue | null }
	| { kind: "missingValue"; label: string; option: OptionDoc }
	| { kind: "shorthand"; label: string; option: OptionDoc; digits: string }
	| { kind: "unknownOption"; label: string }
	| { kind: "endOfOptions"; label: string }
	| { kind: "operand"; word: ExplainWord; operand: OperandKind }
	| { kind: "ignored"; word: ExplainWord }
	| { kind: "unexpected"; word: ExplainWord };

/**
 * 一行的開頭是 explain 時，回傳後面的原文（可能是空字串）；不是的話回傳 null。
 * shell 用它決定要不要把整行原文交給 explain，見 `Shell.execute`。
 *
 * @example explainTargetOf("explain ls | wc -l") // "ls | wc -l"
 * @example explainTargetOf("ls explain") // null
 */
export function explainTargetOf(input: string): string | null {
	const match = EXPLAIN_PREFIX.exec(input);
	if (match === null) {
		return null;
	}
	return input.slice(match[0].length);
}

function indentOf(depth: number): string {
	return INDENT.repeat(depth);
}

/** 把一個字的兩種解析結果（玩家寫法、標好記號的）合成 `ExplainWord`。 */
function toExplainWord(text: string, quoted: boolean, marked: string, home: string): ExplainWord {
	const variables = [...new Set(Array.from(marked.matchAll(VARIABLE_MARK_PATTERN), (match) => match[1]))];

	let glob: ExplainWord["glob"] = "none";
	if (GLOB_PATTERN.test(text)) {
		glob = "expand";
		if (quoted) {
			glob = "literal";
		}
	}

	let fsPath: string | null = null;
	if (variables.length === 0) {
		fsPath = marked.replace(HOME_MARK, home);
	}

	return {
		text,
		variables,
		tilde: marked.startsWith(HOME_MARK),
		literalDollar: LITERAL_DOLLAR_PATTERN.test(marked),
		glob,
		fsPath,
	};
}

function fromParsedWord(plain: ParsedWord, marked: ParsedWord | undefined, home: string): ExplainWord {
	return toExplainWord(plain.value, plain.quoted, marked?.value ?? plain.value, home);
}

function fromParsedCommand(plain: DetailedCommand, marked: DetailedCommand | undefined, home: string): ExplainCommandWords {
	return {
		name: fromParsedWord(plain.name, marked?.name, home),
		args: plain.args.map((arg, index) => fromParsedWord(arg, marked?.args[index], home)),
	};
}

/** 語法符號那一行：符號加兩個空白加一句話說明。 */
function symbolLine(symbol: SyntaxSymbol, depth: number): string {
	return `${indentOf(depth)}${symbol}  ${syntaxSummary(symbol)}`;
}

function envValue(context: CommandContext, name: string): string | undefined {
	if (!Object.hasOwn(context.env, name)) {
		return undefined;
	}
	return context.env[name];
}

/** 路徑現在是檔案、目錄，還是不存在（null）。 */
function nodeTypeAt(path: string, context: CommandContext): "file" | "dir" | null {
	try {
		return context.fs.getNode(context.cwd, path).type;
	} catch (error) {
		if (error instanceof FsError) {
			return null;
		}
		throw error;
	}
}

/** 萬用字元目前對得上哪些路徑，寫法照 `fs.glob`（保留玩家的寫法）。 */
function globMatches(pattern: string, context: CommandContext): string[] {
	try {
		return context.fs.glob(context.cwd, pattern);
	} catch (error) {
		if (error instanceof FsError) {
			return [];
		}
		throw error;
	}
}

/** 說明變數時印的寫法：玩家寫 `${NAME}` 就照印，不然是 `$NAME`。 */
function variableLabel(text: string, name: string): string {
	const braced = `\${${name}}`;
	if (text.includes(braced)) {
		return braced;
	}
	return `$${name}`;
}

/**
 * 一個字裡的語法再往內縮一層說明：`$名稱`（附目前的值）、被擋住的 `$`、開頭的 `~`、
 * 路徑裡的 `..`（只有路徑才說）、萬用字元（沒引號時附上目前對得上的檔名，有引號時說不會展開）。
 */
function conceptLines(word: ExplainWord, isPath: boolean, context: CommandContext, depth: number): string[] {
	const prefix = indentOf(depth);
	const lines: string[] = [];

	for (const name of word.variables) {
		const description = explainVariableValue(syntaxSummary("$"), envValue(context, name));
		lines.push(`${prefix}${variableLabel(word.text, name)}  ${description}`);
	}
	if (word.literalDollar) {
		lines.push(`${prefix}${explainLiteralDollar()}`);
	}
	if (word.tilde) {
		lines.push(`${prefix}~  ${explainHomeDirectory(syntaxSummary("~"), context.home)}`);
	}
	if (isPath && word.text.split("/").includes("..")) {
		lines.push(symbolLine("..", depth));
	}
	if (word.glob === "literal") {
		lines.push(`${prefix}${explainQuotedGlob()}`);
	}
	if (word.glob === "expand") {
		for (const symbol of ["*", "?"] as const) {
			if (word.text.includes(symbol)) {
				lines.push(symbolLine(symbol, depth));
			}
		}
		if (word.fsPath !== null) {
			lines.push(`${prefix}${explainGlobMatches(globMatches(word.fsPath, context))}`);
		}
	}

	return lines;
}

function findOption(doc: CommandArgsDoc, spelling: string): OptionDoc | undefined {
	return doc.options.find((option) => option.short === spelling || option.long === spelling);
}

/** 參數依位置是什麼東西；選項表說這個指令不接參數時是 `unexpected`。 */
function operandItem(word: ExplainWord, doc: CommandArgsDoc, position: number): ArgItem {
	const kinds = doc.operands;
	if (kinds === undefined) {
		return { kind: "operand", word, operand: "path" };
	}
	if (kinds.length === 0) {
		return { kind: "unexpected", word };
	}
	return { kind: "operand", word, operand: kinds[Math.min(position, kinds.length - 1)] };
}

/**
 * 把一個指令的參數分成選項、選項的值與參數，規則照選項表的 `style`（見 `OptionStyle`），
 * 跟各指令實作的解析方式一致：選項可以放在參數後面，接值的選項吃下一個參數（不管它長什麼樣子）。
 */
function classifyArgs(args: ExplainWord[], doc: CommandArgsDoc): ArgItem[] {
	if (doc.ignoresArgs === true) {
		return args.map((word): ArgItem => ({ kind: "ignored", word }));
	}

	const items: ArgItem[] = [];
	let optionsEnded = doc.style === "none";
	let operandPosition = 0;
	let index = 0;

	const pushOperand = (word: ExplainWord): void => {
		items.push(operandItem(word, doc, operandPosition));
		operandPosition += 1;
		if (doc.leadingOptionsOnly === true) {
			optionsEnded = true;
		}
	};

	/** 接值的選項：值黏在後面就用它，不然吃下一個參數，沒有下一個時是缺值。 */
	const optionItem = (label: string, option: OptionDoc, attached: string): ArgItem => {
		if (option.value === undefined) {
			return { kind: "option", label, option, value: null };
		}
		if (attached !== "") {
			return { kind: "option", label: `${label}${attached}`, option, value: { text: attached, word: null } };
		}
		const next = args[index];
		if (next === undefined) {
			return { kind: "missingValue", label, option };
		}
		index += 1;
		return { kind: "option", label: `${label} ${next.text}`, option, value: { text: next.text, word: next } };
	};

	while (index < args.length) {
		const word = args[index];
		index += 1;
		const text = word.text;

		if (optionsEnded || !text.startsWith("-") || text === "-") {
			pushOperand(word);
			continue;
		}

		if (doc.style === "words") {
			const option = findOption(doc, text);
			if (option !== undefined) {
				items.push(optionItem(text, option, ""));
			} else if (doc.leadingOptionsOnly === true) {
				pushOperand(word);
			} else {
				items.push({ kind: "unknownOption", label: text });
			}
			continue;
		}

		// 以下是 letters：`--` 結束選項、`--xxx` 是長選項、`-5` 可能是簡寫，其餘一個字母一個選項
		if (text === "--") {
			items.push({ kind: "endOfOptions", label: text });
			optionsEnded = true;
			continue;
		}

		if (text.startsWith("--")) {
			const option = findOption(doc, text);
			if (option === undefined) {
				items.push({ kind: "unknownOption", label: text });
			} else {
				items.push(optionItem(text, option, ""));
			}
			continue;
		}

		const shorthandOf = doc.numericShorthand;
		if (shorthandOf !== undefined && NUMERIC_OPTION_PATTERN.test(text)) {
			const option = findOption(doc, shorthandOf);
			if (option !== undefined) {
				items.push({ kind: "shorthand", label: text, option, digits: text.slice(1) });
				continue;
			}
		}

		const letters = Array.from(text.slice(1));
		for (let position = 0; position < letters.length; position += 1) {
			const flag = `-${letters[position]}`;
			const option = findOption(doc, flag);
			if (option === undefined) {
				items.push({ kind: "unknownOption", label: flag });
				continue;
			}
			if (option.value === undefined) {
				items.push({ kind: "option", label: flag, option, value: null });
				continue;
			}
			// 接值的字母：後面剩下的字就是值，沒有就吃下一個參數；這個選項之後的字母都算值，不再往下看
			items.push(optionItem(flag, option, letters.slice(position + 1).join("")));
			break;
		}
	}

	return items;
}

/** 選項那一行的說明：不接值的就是一句話；接值的附上值，值只有固定幾種時改說那一種的意思。 */
function describeOption(option: OptionDoc, value: OptionValue | null): string {
	if (value === null) {
		return option.summary;
	}
	const values = option.values;
	if (values !== undefined) {
		if (Object.hasOwn(values, value.text)) {
			return values[value.text];
		}
		return explainInvalidOptionValue(option.summary, value.text, Object.keys(values));
	}
	return explainOptionValue(option.summary, option.value ?? "", value.text);
}

/** 路徑參數：含變數或沒引號的萬用字元時不說存不存在（要展開才知道），其餘照檔案系統說檔案、目錄或不存在。 */
function describePath(word: ExplainWord, context: CommandContext): string {
	if (word.fsPath === null || word.glob === "expand") {
		return explainArgument(word.text);
	}
	const type = nodeTypeAt(word.fsPath, context);
	if (type === "file") {
		return explainFile(word.text);
	}
	if (type === "dir") {
		return explainDirectory(word.text);
	}
	return explainMissingPath(word.text);
}

/** man、help、which 的參數：這台終端機有這個指令時附上一句話說明。 */
function commandSummary(name: string, context: CommandContext): string | null {
	if (!context.availableCommands.includes(name)) {
		return null;
	}
	return getCommandDoc(name)?.summary ?? null;
}

/** export 的參數：`名稱=值` 是設定，只有名稱時說那個變數目前的值。 */
function describeAssignment(text: string, context: CommandContext): string {
	const equalsIndex = text.indexOf("=");
	if (equalsIndex <= 0) {
		return explainVariableName(text, envValue(context, text));
	}
	return explainAssignment(text.slice(0, equalsIndex), text.slice(equalsIndex + 1));
}

/** kill 的參數：查得到這個程序時回傳它的指令列。 */
function processCommand(text: string, context: CommandContext): string | null {
	if (!DIGITS_PATTERN.test(text)) {
		return null;
	}
	const pid = Number(text);
	return context.processes.find((process) => process.pid === pid)?.command ?? null;
}

/** 不是選項的參數，照它在這個指令裡的角色說明。 */
function describeOperand(word: ExplainWord, operand: OperandKind, context: CommandContext): string {
	switch (operand) {
		case "path":
			return describePath(word, context);
		case "text":
			return explainText(word.text);
		case "pattern":
			return explainPattern(word.text);
		case "mode":
			return explainMode(word.text);
		case "user":
			return explainUser(word.text);
		case "command":
			return explainCommandName(word.text, commandSummary(word.text, context));
		case "variable":
			return explainVariableName(word.text, envValue(context, word.text));
		case "assignment":
			return describeAssignment(word.text, context);
		case "pid":
			return explainPid(word.text, processCommand(word.text, context));
	}
}

/** 分類好的一項參數排成一行（加上往內縮一層的語法說明）。 */
function describeArg(item: ArgItem, commandName: string, context: CommandContext, depth: number): string[] {
	const prefix = indentOf(depth);
	switch (item.kind) {
		case "option": {
			const lines = [`${prefix}${item.label}  ${describeOption(item.option, item.value)}`];
			const valueWord = item.value?.word ?? null;
			if (valueWord !== null) {
				lines.push(...conceptLines(valueWord, false, context, depth + 1));
			}
			return lines;
		}
		case "missingValue":
			return [`${prefix}${item.label}  ${explainMissingOptionValue(item.option.summary, item.option.value ?? "")}`];
		case "shorthand":
			return [`${prefix}${item.label}  ${explainNumericShorthand(item.option.summary, item.option.short, item.digits)}`];
		case "unknownOption":
			return [`${prefix}${item.label}  ${explainUnknownOption()}`];
		case "endOfOptions":
			return [`${prefix}${item.label}  ${explainEndOfOptions()}`];
		case "ignored":
			return [`${prefix}${item.word.text}  ${explainIgnoredArgument(commandName)}`];
		case "unexpected":
			return [`${prefix}${item.word.text}  ${explainUnexpectedArgument(commandName)}`];
		case "operand":
			return [
				`${prefix}${describeOperand(item.word, item.operand, context)}`,
				...conceptLines(item.word, item.operand === "path", context, depth + 1),
			];
	}
}

/** 找不到的指令：大小寫打錯或打錯字時給最接近的建議。 */
function suggestCommand(name: string, context: CommandContext): string | null {
	const lower = suggestLowercaseCommand(name, context.availableCommands);
	if (lower !== null) {
		return lower;
	}
	return suggestSimilarCommand(name, context.availableCommands, context.learnedCommands);
}

/** 一個指令：名稱與一句話說明一行，選項與參數往內縮一層；sudo、explain 後面的指令再往下一層。 */
function describeCommand(command: ExplainCommandWords, context: CommandContext, depth: number): string[] {
	const prefix = indentOf(depth);
	const name = command.name.text;

	if (!context.availableCommands.includes(name)) {
		return [`${prefix}${name}  ${explainUnknownCommand(suggestCommand(name, context))}`];
	}

	let header = `${prefix}${name}`;
	const doc = getCommandDoc(name);
	if (doc !== undefined) {
		header = `${header}  ${doc.summary}`;
	}

	const argsDoc = getCommandArgsDoc(name) ?? DEFAULT_ARGS_DOC;
	if (argsDoc.nestedCommand === true) {
		const [nestedName, ...nestedArgs] = command.args;
		if (nestedName === undefined) {
			return [header];
		}
		return [header, ...describeCommand({ name: nestedName, args: nestedArgs }, context, depth + 1)];
	}

	const lines = [header];
	for (const item of classifyArgs(command.args, argsDoc)) {
		lines.push(...describeArg(item, name, context, depth + 1));
	}
	return lines;
}

/** 重導向的目標檔案現在的狀態。 */
function redirectTargetState(target: ExplainWord, context: CommandContext): ExplainRedirectTargetState {
	if (target.fsPath === null) {
		return "unknown";
	}
	const type = nodeTypeAt(target.fsPath, context);
	if (type === "file") {
		return "file";
	}
	if (type === "dir") {
		return "directory";
	}
	return "missing";
}

/** 一條管線：指令之間是 `|`，結尾的重導向跟指令同一層，目標檔案再縮一層。 */
function describePipeline(
	pipeline: DetailedPipeline,
	marked: DetailedPipeline | undefined,
	context: CommandContext,
	depth: number,
): string[] {
	const lines: string[] = [];

	pipeline.commands.forEach((command, index) => {
		if (index > 0) {
			lines.push(symbolLine("|", depth));
		}
		const words = fromParsedCommand(command, marked?.commands[index], context.home);
		lines.push(...describeCommand(words, context, depth));
	});

	const redirect = pipeline.redirect;
	if (redirect !== null) {
		let symbol: SyntaxSymbol = ">";
		if (redirect.kind === "append") {
			symbol = ">>";
		}
		lines.push(symbolLine(symbol, depth));

		// 遊戲的 shell 不展開重導向檔名裡的萬用字元，所以不說明 * 與 ?
		const markedTarget = marked?.redirect?.target ?? redirect.target;
		const target: ExplainWord = { ...toExplainWord(redirect.target, false, markedTarget, context.home), glob: "none" };
		const state = redirectTargetState(target, context);
		lines.push(`${indentOf(depth + 1)}${explainRedirectTarget(target.text, state, redirect.kind)}`);
		lines.push(...conceptLines(target, true, context, depth + 2));
	}

	return lines;
}

/**
 * 說明一整行。只有一段時直接從指令開始；用 `;`、`&&` 串了好幾段時，每段先印原文、內容往內縮一層，
 * 連接符號自己一行。語法錯誤時回傳解析錯誤的說明（跟 shell 執行時印的一樣）。
 */
export function explainLine(line: string, context: CommandContext): string[] {
	const plain = parseCommandList(line);
	if (!plain.ok) {
		return parseError(plain.error);
	}
	if (plain.items.length === 0) {
		return explainUsage();
	}

	const marked = parseCommandList(line, MARKING_OPTIONS);
	const markedItems = marked.ok ? marked.items : [];
	const several = plain.items.length > 1;
	const lines: string[] = [];

	plain.items.forEach((item, index) => {
		if (item.connector !== null) {
			lines.push(symbolLine(item.connector, 0));
		}
		let depth = 0;
		if (several) {
			lines.push(item.source);
			depth = 1;
		}
		lines.push(...describePipeline(item.pipeline, markedItems[index]?.pipeline, context, depth));
	});

	return lines;
}

export const explainCommand: CommandDefinition = {
	name: "explain",
	run(args, context): CommandResult {
		// shell 從一行開頭呼叫時 args 只有一個元素，就是後面的原文；不在開頭時是解析過的參數，接回一行
		const line = args.join(" ");
		if (line.trim() === "") {
			return { ok: true, lines: explainUsage() };
		}
		return { ok: true, lines: explainLine(line, context) };
	},
};
