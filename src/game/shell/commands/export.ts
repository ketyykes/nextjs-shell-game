/**
 * `export`：設定環境變數，或列出目前所有變數。
 *
 * - 沒參數：依名稱排序列出 `declare -x 名稱="值"`（跟 bash 一樣）。
 * - `名稱=值`：設定變數，值可以是空字串；只看第一個 `=`，值裡的 `=` 原樣保留。
 * - `名稱`（沒有 `=`）：變數存在就不動，不存在就設成空字串（bash 行為）。
 *
 * 指令不直接改 `context.env`，而是回傳整份新的 `nextEnv` 讓 shell 取代。
 * 多個參數逐一處理，失敗的不影響合法的（跟 bash 一樣），但整體 `ok` 為 false。
 * `$NAME` 的展開由 shell 核心處理，這裡只負責更新變數。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { invalidAssignment, invalidVariableName, unknownOption } from "../messages";

/** 合法的變數名稱：英文字母、數字與底線，不能以數字開頭。 */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 依名稱用 code unit 排序後的變數名稱，`env` 也用。 */
export function sortedVariableNames(env: Record<string, string>): string[] {
	return Object.keys(env).sort((a, b) => {
		if (a < b) {
			return -1;
		}

		if (a > b) {
			return 1;
		}

		return 0;
	});
}

/** 雙引號字串裡的值要跳脫 `\` 與 `"`，跟 bash 的 `declare -x` 輸出一樣。 */
function quoteValue(value: string): string {
	const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `"${escaped}"`;
}

/** 沒參數時的列表輸出。 */
function listVariables(env: Record<string, string>): string[] {
	return sortedVariableNames(env).map((name) => `declare -x ${name}=${quoteValue(env[name])}`);
}

export const exportCommand: CommandDefinition = {
	name: "export",
	run(args, context): CommandResult {
		if (args.length === 0) {
			return { ok: true, lines: listVariables(context.env) };
		}

		const nextEnv: Record<string, string> = { ...context.env };
		const errors: string[] = [];
		let changed = false;

		for (const arg of args) {
			if (arg.startsWith("-")) {
				// 選項一律不支援，直接停下，避免 `-n` 之類的被誤當成變數名稱
				return { ok: false, lines: unknownOption("export", arg) };
			}

			const equalsIndex = arg.indexOf("=");

			if (equalsIndex === 0) {
				errors.push(...invalidAssignment(arg));
				// `export NAME = VALUE` 的空格錯誤：後面的 VALUE 是同一個失誤，不再逐參數報錯
				if (arg === "=") {
					break;
				}
				continue;
			}

			let name = arg;
			let value: string | null = null;

			if (equalsIndex > 0) {
				name = arg.slice(0, equalsIndex);
				value = arg.slice(equalsIndex + 1);
			}

			if (!VARIABLE_NAME.test(name)) {
				errors.push(...invalidVariableName(name));
				continue;
			}

			if (value !== null) {
				nextEnv[name] = value;
			} else if (!Object.prototype.hasOwnProperty.call(nextEnv, name)) {
				nextEnv[name] = "";
			}

			changed = true;
		}

		const result: CommandResult = { ok: errors.length === 0, lines: errors };

		if (changed) {
			result.nextEnv = nextEnv;
		}

		return result;
	},
};
