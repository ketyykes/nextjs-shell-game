/**
 * 從提示文字取出「玩家可以照抄的指令」，給 `hintCommands.test.ts` 驗證第三段提示照抄就能過關（決策：提示永遠可信）。
 * app 本身不 import 這個檔案。
 *
 * 解析規則：
 * - 「輸入 X」「輸入一次 X」「例如 X」：X 從觸發詞後的第一個英文小寫或 `$` 開始，到全形標點（，。；：）為止；
 *   中間用頓號隔開的拆成多步。
 * - X 以空白切成 token，中文 token 只在「後面全是英文 token，而且緊接的那個像指令的一部分（有小寫字母或
 *   `. / | > < * ~ $ -` 等符號）」時算參數（`grep 回應 ping.log`），否則從它開始是說明文字
 *   （`head access.log 看最早的紀錄`、`ps 找出 … 的 PID`、`ps | grep scheduler 找出 PID`——全大寫的 PID 是說明裡的名詞）。
 * - 指令後面接「再按 Tab」時，該步要先補全再送出。
 * - 整行只有英文的行（以小寫或 `$` 開頭）視為一行一道的指令清單。
 */

/** 從提示文字取出的一步：要打的字，以及打完要不要先按 Tab 補全再送出。 */
export interface HintStep {
	input: string;
	pressTab: boolean;
}

/** 一行一道的指令清單裡的一行。 */
const COMMAND_LINE = /^[a-z$][\x20-\x7e]*$/;

/** 一段指令的結尾：全形標點。 */
const SEGMENT_END = /[，。；：]/;

/** 指令 token：可見的 ASCII 字元。 */
const ASCII_TOKEN = /^[\x21-\x7e]+$/;

/** 像指令一部分的 token：有小寫字母或 shell 常見符號；全大寫的英文單字（PID、COMMAND）是說明文字裡的名詞。 */
const COMMAND_LIKE_TOKEN = /[a-z./|<>*~$-]/;

/** 指令開頭：英文小寫或 `$`。 */
const COMMAND_START = /^[a-z$]/;

/** 指令後面的說明要求先按 Tab。 */
const TAB_AFTER = /^再?按 Tab/;

/** 從一段（頓號拆開後的）文字取出開頭的指令，與後面剩下的說明文字。 */
function takeCommand(piece: string): { command: string; remainder: string } {
	const tokens = piece.trim().split(" ");
	if (!COMMAND_START.test(tokens[0]) || !ASCII_TOKEN.test(tokens[0])) {
		return { command: "", remainder: piece };
	}

	let accepted = 1;
	while (accepted < tokens.length) {
		const token = tokens[accepted];
		if (ASCII_TOKEN.test(token)) {
			accepted += 1;
			continue;
		}
		const rest = tokens.slice(accepted + 1);
		const isArgument =
			rest.length > 0 && COMMAND_LIKE_TOKEN.test(rest[0]) && rest.every((item) => ASCII_TOKEN.test(item));
		if (!isArgument) {
			break;
		}
		accepted += 1;
	}

	return {
		command: tokens.slice(0, accepted).join(" "),
		remainder: tokens.slice(accepted).join(" "),
	};
}

/** 一行說明文字裡的「輸入 X」「例如 X」。 */
function extractFromProse(line: string): HintStep[] {
	const steps: HintStep[] = [];
	// 觸發詞，後面要空一格再接英文小寫或 `$` 開頭的指令；每次呼叫建新的，lastIndex 不會跨呼叫殘留
	const trigger = /(?:輸入(?:一次)?|例如) (?=[a-z$])/g;
	let match = trigger.exec(line);
	while (match !== null) {
		const start = match.index + match[0].length;
		const rest = line.slice(start);
		const endMatch = SEGMENT_END.exec(rest);
		let segment = rest;
		if (endMatch !== null) {
			segment = rest.slice(0, endMatch.index);
		}

		for (const piece of segment.split("、")) {
			const { command, remainder } = takeCommand(piece);
			if (command !== "") {
				steps.push({ input: command, pressTab: TAB_AFTER.test(remainder) });
			}
		}

		trigger.lastIndex = start + segment.length;
		match = trigger.exec(line);
	}
	return steps;
}

/** 從一段提示文字依出現順序取出玩家可以照抄的指令。 */
export function extractHintSteps(hint: string): HintStep[] {
	const steps: HintStep[] = [];
	for (const rawLine of hint.split("\n")) {
		const line = rawLine.trim();
		if (COMMAND_LINE.test(line)) {
			steps.push({ input: line, pressTab: false });
			continue;
		}
		steps.push(...extractFromProse(line));
	}
	return steps;
}
