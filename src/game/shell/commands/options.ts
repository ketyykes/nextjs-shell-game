/**
 * 指令參數的「選項／操作數」切分，所有指令與目標判定（`story/objectives.ts`）共用。
 *
 * 預設規則跟 bash 的慣例一樣：
 * - `-` 開頭的參數是選項，選項可以放在操作數前後
 * - 單獨的 `-` 是操作數（常代表 stdin）
 * - `--` 之後全部當操作數，`--` 本身丟掉
 *
 * 各指令的差異用 `SplitArgsConfig` 參數化（例如 `find`、`kill` 沒有 `--` 的語意），
 * 切完之後每個指令只處理自己的旗標意義。錯誤一律由呼叫端依 `options` 的順序回報，
 * 因為操作數不會出錯，這樣跟「邊掃邊報錯」的結果一樣。
 */

import { unknownOption } from "../messages";

export interface SplitArgsConfig {
	/** `--` 是否結束選項。預設 true；設 false 時 `--` 留在 `options` 裡交給指令判斷。 */
	endOfOptions?: boolean;
	/** 單獨的 `-` 是否當操作數。預設 true；設 false 時它留在 `options` 裡。 */
	loneDashIsOperand?: boolean;
	/**
	 * 會吃掉下一個參數當值的選項（例如 `head` 的 `-n`、`find` 的 `-name`）。
	 * 值不管長什麼樣子都緊接著選項放進 `options`（`["-n", "5"]`）；選項是最後一個參數時後面就沒有值。
	 */
	valueOptions?: readonly string[];
}

/** 切分結果：選項（保持原順序）與操作數。 */
export interface SplitArgs {
	options: string[];
	operands: string[];
}

/** 把參數切成選項與操作數，規則見檔頭與 `SplitArgsConfig`。 */
export function splitOptionsAndOperands(args: readonly string[], config: SplitArgsConfig = {}): SplitArgs {
	const endOfOptions = config.endOfOptions ?? true;
	const loneDashIsOperand = config.loneDashIsOperand ?? true;
	const valueOptions = config.valueOptions ?? [];
	const options: string[] = [];
	const operands: string[] = [];
	let optionsEnded = false;
	let index = 0;

	while (index < args.length) {
		const arg = args[index];
		index += 1;

		if (optionsEnded || !arg.startsWith("-") || (arg === "-" && loneDashIsOperand)) {
			operands.push(arg);
			continue;
		}

		if (arg === "--" && endOfOptions) {
			optionsEnded = true;
			continue;
		}

		options.push(arg);

		if (valueOptions.includes(arg) && index < args.length) {
			options.push(args[index]);
			index += 1;
		}
	}

	return { options, operands };
}

/** 單字母旗標的解析結果：成功時帶出現過的選項字母與操作數，失敗時帶要印出的錯誤訊息。 */
export type FlagParseResult =
	| { ok: true; flags: Set<string>; operands: string[] }
	| { ok: false; lines: string[] };

/**
 * 解析只有單字母旗標的指令參數（ls、wc、sort、uniq、grep 與檔案操作類指令）。
 * - `-r`、`-f`、`-rf` 這種單一字母選項可以合併，也可以放在操作數後面
 * - `--` 之後全部當成操作數；單獨的 `-` 也是操作數
 * - 不支援的字母與 `--xxx` 長選項回傳 `unknownOption`
 *
 * `supported` 是可以接受的選項字母，例如 rm 傳 `"rRf"`、沒有選項的指令傳空字串。
 * `onFlag` 依出現順序對每個合法字母呼叫一次（重複的也會），回傳錯誤訊息就中止，
 * 給需要檢查旗標彼此衝突的指令用（例如 grep 的 `-E` 與 `-F`）。
 */
export function parseFlagArgs(
	command: string,
	args: readonly string[],
	supported: string,
	onFlag?: (flag: string) => string[] | null,
): FlagParseResult {
	const { options, operands } = splitOptionsAndOperands(args);
	const flags = new Set<string>();

	for (const option of options) {
		if (option.startsWith("--")) {
			return { ok: false, lines: unknownOption(command, option) };
		}

		for (const flag of option.slice(1)) {
			if (!supported.includes(flag)) {
				return { ok: false, lines: unknownOption(command, `-${flag}`) };
			}

			const error = onFlag?.(flag) ?? null;
			if (error !== null) {
				return { ok: false, lines: error };
			}

			flags.add(flag);
		}
	}

	return { ok: true, flags, operands };
}
