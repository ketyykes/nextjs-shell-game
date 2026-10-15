/**
 * `sed`：照腳本逐行改寫文字（第十九場，只開放使用，不在劇本裡）。
 *
 * 用法 `sed [-n] [-E] [-i] [-e 腳本]... [腳本] [檔案...]`：沒有 `-e` 時第一個參數是腳本；沒給檔名時讀管線輸入。
 * 好幾個檔案接成一串處理（行號接著數，`$` 是最後一個檔案的最後一行），跟 GNU sed 一樣。
 *
 * 腳本支援的寫法（一段腳本裡用 `;` 或換行隔開好幾個指令，`-e` 給好幾段時依序接起來）：
 * - 指令：`s/舊/新/旗標`（取代）、`p`（印出）、`d`（刪除，這一行不再往下跑也不印）。
 * - 位址：沒寫是每一行；`N` 第 N 行、`$` 最後一行、`/樣式/` 符合的行；`起,迄` 是範圍
 *   （迄是行號而且不大於起點那行時只有那一行；迄是樣式時從下一行開始找，GNU 行為）。
 * - `s` 的分隔字元可以換（`s|/a|/b|`），`\` 加分隔字元是字面字元；旗標 `g`、`i`／`I`、`p`、數字（第幾個符合），可以混用（`2g`）。
 * - 取代字串：`&` 是整個符合、`\1` 到 `\9` 是群組、`\n` 換行（一行變好幾行）、`\t` Tab，`\&`、`\\` 是字面字元。
 * - 樣式沿用 grep 的 BRE／ERE 轉換（`grepPattern.ts`），`-E`（或 `-r`）用 ERE；樣式裡的 `\n` 是換行。
 *   `g` 遇到空字串的符合時，跟 GNU 一樣不會緊接在上一個符合後面再換一次（樣式 `b*` 換成 X 時 abc 變成 XaXcX）。
 * - `-n` 不自動印每一行，只印 `p` 與 `s///p` 印的；`-i` 直接改檔（寫回虛擬檔案系統、畫面不印），每個檔案各自從第 1 行數。
 *
 * 不支援（寫了就報錯，不默默誤解）：`a`、`i`、`c`、`y`、hold space（`h` `H` `g` `G` `x`）、`w`、`r`、`n`、`N`、`q`、`=`、
 * `!`、`{ }`、`s` 的 `w`／`e`／`m` 旗標、空樣式（沿用上一個樣式）、`\c樣式c` 的位址、`-i` 的備份副檔名與長選項。
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import {
	fsError,
	missingOperand,
	noInput,
	sedEmptyPattern,
	sedExtraCharacters,
	sedInPlaceSuffix,
	sedInvalidLineZero,
	sedInvalidPattern,
	sedInvalidReference,
	sedMissingCommand,
	sedNoInputFiles,
	sedUnexpectedComma,
	sedUnknownSFlag,
	sedUnsupportedCommand,
	sedUnterminatedAddress,
	sedUnterminatedS,
	sedZeroOccurrence,
	unknownOption,
} from "../messages";
import { joinContentLines, splitContentLines } from "./cat";
import { translatePattern } from "./grepPattern";
import { splitOptionsAndOperands } from "./options";

// ---------------------------------------------------------------------------
// 腳本的結構
// ---------------------------------------------------------------------------

/** 位址：第幾行、最後一行（`$`）或符合樣式的行。 */
type Address = { kind: "line"; line: number } | { kind: "last" } | { kind: "regex"; regex: RegExp };

/** 取代字串的一段：照抄的文字，或第幾組擷取（0 是整個符合，也就是 `&`）。 */
type ReplacementPart = { kind: "text"; text: string } | { kind: "group"; index: number };

interface Substitution {
	/** 一律帶 `g` 旗標，取代時從指定位置往後找。 */
	regex: RegExp;
	replacement: ReplacementPart[];
	global: boolean;
	/** 從第幾個符合開始換，沒寫數字是 1。 */
	occurrence: number;
	print: boolean;
}

type SedAction = { kind: "print" } | { kind: "delete" } | { kind: "substitute"; substitution: Substitution };

interface SedInstruction {
	start: Address | null;
	end: Address | null;
	action: SedAction;
}

/** 解析腳本時的錯誤，`parseScript` 接住後換成回傳值。 */
class SedScriptError extends Error {
	readonly lines: string[];

	constructor(lines: string[]) {
		super(lines.join("\n"));
		this.lines = lines;
	}
}

// ---------------------------------------------------------------------------
// 腳本解析
// ---------------------------------------------------------------------------

/** BRE 裡加了反斜線才是字面字元的符號；分隔字元是這些時，`\分隔字元` 要保留反斜線。 */
const BASIC_SPECIAL = new Set([".", "*", "[", "]", "^", "$"]);

/** ERE 多出來的特殊符號。 */
const EXTENDED_SPECIAL = new Set([...BASIC_SPECIAL, "+", "?", "(", ")", "{", "}", "|"]);

/** 指令結束的位置：腳本結尾、`;` 或換行。 */
function isCommandEnd(char: string | undefined): boolean {
	return char === undefined || char === ";" || char === "\n";
}

function isBlank(char: string | undefined): boolean {
	return char === " " || char === "\t";
}

function isDigit(char: string | undefined): boolean {
	return char !== undefined && char >= "0" && char <= "9";
}

/** 把一段 `sed` 腳本解析成指令。一個實例只解析一次。 */
class ScriptParser {
	private readonly chars: string[];
	private index = 0;

	constructor(
		private readonly script: string,
		private readonly extended: boolean,
	) {
		this.chars = Array.from(script);
	}

	parse(): SedInstruction[] {
		const instructions: SedInstruction[] = [];

		while (true) {
			this.skipSeparators();
			if (this.index >= this.chars.length) {
				return instructions;
			}
			instructions.push(this.parseInstruction());
		}
	}

	private peek(): string | undefined {
		return this.chars[this.index];
	}

	private skipBlanks(): void {
		while (isBlank(this.peek())) {
			this.index += 1;
		}
	}

	/** 指令之間的空白、`;` 與換行。 */
	private skipSeparators(): void {
		while (isBlank(this.peek()) || this.peek() === ";" || this.peek() === "\n") {
			this.index += 1;
		}
	}

	private parseInstruction(): SedInstruction {
		const start = this.parseAddress();
		let end: Address | null = null;

		if (start !== null) {
			this.skipBlanks();
			if (this.peek() === ",") {
				this.index += 1;
				this.skipBlanks();
				end = this.parseAddress();
				if (end === null) {
					throw new SedScriptError(sedUnexpectedComma());
				}
			}
		}

		this.skipBlanks();
		const command = this.peek();
		if (isCommandEnd(command)) {
			throw new SedScriptError(sedMissingCommand(this.script));
		}
		this.index += 1;

		const action = this.parseAction(command as string);
		this.expectCommandEnd();
		return { start, end, action };
	}

	private parseAction(command: string): SedAction {
		if (command === "p") {
			return { kind: "print" };
		}
		if (command === "d") {
			return { kind: "delete" };
		}
		if (command === "s") {
			return { kind: "substitute", substitution: this.parseSubstitution() };
		}
		throw new SedScriptError(sedUnsupportedCommand(command));
	}

	/** 指令後面只能接空白，再來就是下一個指令（`;`、換行）或腳本結尾。 */
	private expectCommandEnd(): void {
		this.skipBlanks();
		if (!isCommandEnd(this.peek())) {
			throw new SedScriptError(sedExtraCharacters(this.script));
		}
	}

	/** 讀位址，沒有位址時回傳 null（不移動位置）。 */
	private parseAddress(): Address | null {
		const char = this.peek();

		if (isDigit(char)) {
			let digits = "";
			while (isDigit(this.peek())) {
				digits += this.peek();
				this.index += 1;
			}
			const line = Number(digits);
			if (line === 0) {
				throw new SedScriptError(sedInvalidLineZero());
			}
			return { kind: "line", line };
		}

		if (char === "$") {
			this.index += 1;
			return { kind: "last" };
		}

		if (char === "/") {
			this.index += 1;
			const pattern = this.readPattern("/", () => sedUnterminatedAddress(this.script));
			return { kind: "regex", regex: this.compile(pattern.raw, pattern.source, false, false).regex };
		}

		return null;
	}

	/**
	 * 讀到下一個沒被跳脫的分隔字元為止（分隔字元本身吃掉），回傳要交給樣式轉換的寫法與玩家打的原文。
	 * `\分隔字元` 變成分隔字元本身（它在樣式語法裡有特殊意義時保留反斜線，才會是字面字元）；`\n` 變成換行；
	 * 其他反斜線寫法原樣交給樣式轉換。
	 */
	private readPattern(delimiter: string, onUnterminated: () => string[]): { source: string; raw: string } {
		const special = this.extended ? EXTENDED_SPECIAL : BASIC_SPECIAL;
		let source = "";
		let raw = "";

		while (true) {
			const char = this.peek();
			if (char === undefined) {
				throw new SedScriptError(onUnterminated());
			}
			this.index += 1;
			if (char === delimiter) {
				return { source, raw };
			}
			if (char !== "\\") {
				source += char;
				raw += char;
				continue;
			}

			const next = this.peek();
			if (next === undefined) {
				throw new SedScriptError(onUnterminated());
			}
			this.index += 1;
			raw += `\\${next}`;
			if (next === delimiter && !special.has(next)) {
				source += next;
			} else if (next === "n") {
				source += "\n";
			} else {
				source += `\\${next}`;
			}
		}
	}

	/** 讀取代字串到下一個沒被跳脫的分隔字元為止，拆成文字與群組參照。 */
	private readReplacement(delimiter: string): ReplacementPart[] {
		const parts: ReplacementPart[] = [];
		let text = "";
		const flush = (): void => {
			if (text !== "") {
				parts.push({ kind: "text", text });
				text = "";
			}
		};

		while (true) {
			const char = this.peek();
			if (char === undefined) {
				throw new SedScriptError(sedUnterminatedS(this.script));
			}
			this.index += 1;
			if (char === delimiter) {
				flush();
				return parts;
			}
			if (char === "&") {
				flush();
				parts.push({ kind: "group", index: 0 });
				continue;
			}
			if (char !== "\\") {
				text += char;
				continue;
			}

			const next = this.peek();
			if (next === undefined) {
				throw new SedScriptError(sedUnterminatedS(this.script));
			}
			this.index += 1;
			if (isDigit(next)) {
				flush();
				parts.push({ kind: "group", index: Number(next) });
			} else if (next === "n") {
				text += "\n";
			} else if (next === "t") {
				text += "\t";
			} else {
				// `\&`、`\\`、`\分隔字元` 與其他反斜線寫法都是那個字本身
				text += next;
			}
		}
	}

	private parseSubstitution(): Substitution {
		const delimiter = this.peek();
		if (delimiter === undefined || delimiter === "\\" || delimiter === "\n") {
			throw new SedScriptError(sedUnterminatedS(this.script));
		}
		this.index += 1;

		const pattern = this.readPattern(delimiter, () => sedUnterminatedS(this.script));
		const replacement = this.readReplacement(delimiter);
		let global = false;
		let print = false;
		let ignoreCase = false;
		let occurrence = 1;

		while (!isCommandEnd(this.peek()) && !isBlank(this.peek())) {
			const flag = this.peek() as string;
			if (isDigit(flag)) {
				let digits = "";
				while (isDigit(this.peek())) {
					digits += this.peek();
					this.index += 1;
				}
				occurrence = Number(digits);
				if (occurrence === 0) {
					throw new SedScriptError(sedZeroOccurrence());
				}
				continue;
			}
			this.index += 1;
			if (flag === "g") {
				global = true;
			} else if (flag === "p") {
				print = true;
			} else if (flag === "i" || flag === "I") {
				ignoreCase = true;
			} else {
				throw new SedScriptError(sedUnknownSFlag(flag));
			}
		}

		const compiled = this.compile(pattern.raw, pattern.source, ignoreCase, true);
		for (const part of replacement) {
			if (part.kind === "group" && part.index > compiled.groupCount) {
				throw new SedScriptError(sedInvalidReference(`\\${part.index}`, compiled.groupCount));
			}
		}

		return { regex: compiled.regex, replacement, global, occurrence, print };
	}

	/** 把樣式編成 JS 的 `RegExp`；`raw` 是玩家打的原文，錯誤訊息用。 */
	private compile(raw: string, source: string, ignoreCase: boolean, global: boolean): { regex: RegExp; groupCount: number } {
		if (source === "") {
			throw new SedScriptError(sedEmptyPattern());
		}

		const translated = translatePattern(source, this.extended ? "extended" : "basic");
		if (!translated.ok) {
			throw new SedScriptError(sedInvalidPattern(raw, translated.error));
		}

		let flags = "u";
		if (ignoreCase) {
			flags += "i";
		}
		if (global) {
			flags += "g";
		}
		return { regex: new RegExp(translated.source, flags), groupCount: translated.groupCount };
	}
}

/** 解析一段腳本；寫法有錯時回傳要印的錯誤訊息。 */
function parseScript(script: string, extended: boolean): { ok: true; instructions: SedInstruction[] } | { ok: false; lines: string[] } {
	try {
		return { ok: true, instructions: new ScriptParser(script, extended).parse() };
	} catch (error) {
		if (error instanceof SedScriptError) {
			return { ok: false, lines: error.lines };
		}
		throw error;
	}
}

// ---------------------------------------------------------------------------
// 執行
// ---------------------------------------------------------------------------

/** 目前這一行的位置。 */
interface LinePosition {
	line: number;
	isLast: boolean;
}

function matchesAddress(address: Address, pattern: string, position: LinePosition): boolean {
	if (address.kind === "line") {
		return position.line === address.line;
	}
	if (address.kind === "last") {
		return position.isLast;
	}
	return address.regex.test(pattern);
}

/**
 * 這個指令要不要處理這一行。範圍指令的狀態放在 `active[index]`：
 * 起點符合就進入範圍；結尾是行號而且不大於這一行、或結尾是 `$` 而這已經是最後一行時，只有這一行；
 * 結尾是樣式時從下一行開始找，找到的那一行也算在範圍內。
 */
function selects(instruction: SedInstruction, index: number, active: boolean[], pattern: string, position: LinePosition): boolean {
	const { start, end } = instruction;
	if (start === null) {
		return true;
	}
	if (end === null) {
		return matchesAddress(start, pattern, position);
	}

	if (active[index]) {
		if (end.kind === "line") {
			if (position.line >= end.line) {
				active[index] = false;
			}
			return true;
		}
		if (matchesAddress(end, pattern, position)) {
			active[index] = false;
		}
		return true;
	}

	if (!matchesAddress(start, pattern, position)) {
		return false;
	}
	if (end.kind === "line") {
		active[index] = end.line > position.line;
	} else if (end.kind === "last") {
		active[index] = !position.isLast;
	} else {
		active[index] = true;
	}
	return true;
}

/** 這個位置的字元佔幾個 UTF-16 單位（中文以外的罕用字、表情符號是 2）。 */
function charLengthAt(text: string, position: number): number {
	const code = text.codePointAt(position) ?? 0;
	return code > 0xffff ? 2 : 1;
}

function expandReplacement(parts: ReplacementPart[], match: RegExpExecArray): string {
	return parts.map((part) => (part.kind === "text" ? part.text : (match[part.index] ?? ""))).join("");
}

/** 對一行做取代，有換到回傳新的內容，沒換到回傳 null。 */
function substitute(substitution: Substitution, text: string): string | null {
	const { regex } = substitution;
	let output = "";
	let copyFrom = 0;
	let position = 0;
	let count = 0;
	let lastMatchEnd = -1;
	let replaced = false;

	while (position <= text.length) {
		regex.lastIndex = position;
		const match = regex.exec(text);
		if (match === null) {
			break;
		}
		const start = match.index;
		const end = start + match[0].length;

		// GNU 不接受緊接在上一個符合後面的空字串符合，跳過一個字再找
		if (start === end && start === lastMatchEnd) {
			if (start >= text.length) {
				break;
			}
			position = start + charLengthAt(text, start);
			continue;
		}

		count += 1;
		if (count >= substitution.occurrence) {
			output += text.slice(copyFrom, start) + expandReplacement(substitution.replacement, match);
			copyFrom = end;
			replaced = true;
			if (!substitution.global) {
				break;
			}
		}
		lastMatchEnd = end;

		if (start !== end) {
			position = end;
		} else if (start >= text.length) {
			break;
		} else {
			position = start + charLengthAt(text, start);
		}
	}

	if (!replaced) {
		return null;
	}
	return output + text.slice(copyFrom);
}

/** 照腳本處理一串行，回傳要輸出的行。 */
function runInstructions(instructions: SedInstruction[], lines: string[], quiet: boolean): string[] {
	const output: string[] = [];
	const active = instructions.map(() => false);

	lines.forEach((line, lineIndex) => {
		const position: LinePosition = { line: lineIndex + 1, isLast: lineIndex === lines.length - 1 };
		let pattern = line;
		let deleted = false;

		for (const [index, instruction] of instructions.entries()) {
			if (!selects(instruction, index, active, pattern, position)) {
				continue;
			}
			const { action } = instruction;
			if (action.kind === "delete") {
				deleted = true;
				break;
			}
			if (action.kind === "print") {
				output.push(...pattern.split("\n"));
				continue;
			}
			const result = substitute(action.substitution, pattern);
			if (result !== null) {
				pattern = result;
				if (action.substitution.print) {
					output.push(...pattern.split("\n"));
				}
			}
		}

		if (!deleted && !quiet) {
			output.push(...pattern.split("\n"));
		}
	});

	return output;
}

// ---------------------------------------------------------------------------
// 選項與輸入
// ---------------------------------------------------------------------------

interface SedOptions {
	quiet: boolean;
	extended: boolean;
	inPlace: boolean;
	scripts: string[];
	operands: string[];
}

/** 解析選項：`-n`、`-E`／`-r`、`-i`、`-e 腳本`（可以合併成 `-ne`，腳本也可以黏在 `-e` 後面）。 */
function parseSedArgs(args: string[]): { ok: true; options: SedOptions } | { ok: false; lines: string[] } {
	const { options, operands } = splitOptionsAndOperands(args, {
		takesValue: (option) => /^-[nEr]*e$/.test(option),
	});
	const result: SedOptions = { quiet: false, extended: false, inPlace: false, scripts: [], operands };
	let index = 0;

	while (index < options.length) {
		const option = options[index];
		index += 1;
		if (option.startsWith("--")) {
			return { ok: false, lines: unknownOption("sed", option) };
		}

		const letters = Array.from(option.slice(1));
		for (let position = 0; position < letters.length; position += 1) {
			const letter = letters[position];
			if (letter === "n") {
				result.quiet = true;
			} else if (letter === "E" || letter === "r") {
				result.extended = true;
			} else if (letter === "i") {
				// GNU 把 -i 後面黏著的字當成備份副檔名（-i.bak、連 -in 也是），這裡不支援
				if (position < letters.length - 1) {
					return { ok: false, lines: sedInPlaceSuffix(option) };
				}
				result.inPlace = true;
			} else if (letter === "e") {
				let script = letters.slice(position + 1).join("");
				if (script === "") {
					if (index >= options.length) {
						return {
							ok: false,
							lines: missingOperand("sed", "在 -e 後面接一段腳本，例如 sed -e 's/舊/新/' 檔名"),
						};
					}
					script = options[index];
					index += 1;
				}
				result.scripts.push(script);
				break;
			} else {
				return { ok: false, lines: unknownOption("sed", `-${letter}`) };
			}
		}
	}

	return { ok: true, options: result };
}

type ReadResult = { ok: true; lines: string[] } | { ok: false; lines: string[] };

function readFileLines(context: CommandContext, path: string): ReadResult {
	try {
		return { ok: true, lines: splitContentLines(context.fs.readFile(context.cwd, path)) };
	} catch (error) {
		if (error instanceof FsError) {
			return { ok: false, lines: fsError(error.code, error.path) };
		}
		throw error;
	}
}

/** `-i`：每個檔案各自處理後寫回去，畫面只印錯誤。 */
function editInPlace(instructions: SedInstruction[], files: string[], quiet: boolean, context: CommandContext): CommandResult {
	const errors: string[] = [];

	for (const path of files) {
		const read = readFileLines(context, path);
		if (!read.ok) {
			errors.push(...read.lines);
			continue;
		}
		const output = runInstructions(instructions, read.lines, quiet);
		try {
			context.fs.writeFile(context.cwd, path, joinContentLines(output));
		} catch (error) {
			if (!(error instanceof FsError)) {
				throw error;
			}
			errors.push(...fsError(error.code, error.path));
		}
	}

	return { ok: errors.length === 0, lines: errors };
}

export const sedCommand: CommandDefinition = {
	name: "sed",
	run(args, context): CommandResult {
		const parsed = parseSedArgs(args);
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const { quiet, extended, inPlace } = parsed.options;
		let scripts = parsed.options.scripts;
		let files = parsed.options.operands;
		if (scripts.length === 0) {
			if (files.length === 0) {
				return { ok: false, lines: missingOperand("sed", "一段腳本，例如 sed 's/舊/新/' 檔名") };
			}
			scripts = [files[0]];
			files = files.slice(1);
		}

		const instructions: SedInstruction[] = [];
		for (const script of scripts) {
			const result = parseScript(script, extended);
			if (!result.ok) {
				return { ok: false, lines: result.lines };
			}
			instructions.push(...result.instructions);
		}

		if (inPlace) {
			if (files.length === 0) {
				return { ok: false, lines: sedNoInputFiles() };
			}
			return editInPlace(instructions, files, quiet, context);
		}

		if (files.length === 0) {
			if (context.stdin === null) {
				return { ok: false, lines: noInput("sed", "sed 's/舊/新/' 檔名") };
			}
			return { ok: true, lines: runInstructions(instructions, context.stdin, quiet) };
		}

		// 好幾個檔案接成一串；讀不到的報錯、其他照跑（錯誤訊息印在前面）
		const errors: string[] = [];
		const lines: string[] = [];
		for (const path of files) {
			const read = readFileLines(context, path);
			if (read.ok) {
				lines.push(...read.lines);
			} else {
				errors.push(...read.lines);
			}
		}

		return { ok: errors.length === 0, lines: [...errors, ...runInstructions(instructions, lines, quiet)] };
	},
};
