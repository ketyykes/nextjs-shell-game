/**
 * `alias`：設定與列出別名（第十九場，只開放使用，不在劇本裡；bash 的內建指令）。
 *
 * - 不加參數（或 `-p`）：照名稱排序，用 `alias ll='ls -l'` 的格式列出全部。
 * - `名稱=內容`：定義別名，不印東西；`名稱`：印那一條，查不到時說明、不算錯誤（結束碼 1）。可以混著給好幾個。
 * - 名稱不能是空的，也不能有空白、`/`、`$`、`` ` ``、`=`、引號、`\` 與 `| & ; ( ) < >`（bash 的 invalid alias name）。
 * - 內容只能是一個指令或用 `|` 串起來的管線（見 `checkAliasValue`）；空的內容不收（bash 收，這裡請玩家改用 `unalias`）。
 *
 * 別名用回傳值 `nextAliases` 整份交回 shell，只活在這個 shell 物件裡：不進存檔、不進 `ShellSessionState`，
 * 跟真的 shell 一樣，沒寫進設定檔的別名重開就沒了。展開規則見 `../aliases.ts`。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { checkAliasValue } from "../aliases";
import { aliasEmptyValue, aliasInvalidName, aliasNotFound, aliasUnsupportedValue, parseError } from "../messages";
import { parseFlagArgs } from "./options";

/** 合法的別名名稱：不能有空白、斜線、變數與引號相關的字，也不能有 shell 的特殊符號。 */
const ALIAS_NAME_PATTERN = /^[^\s/$`='"\\|&;()<>]+$/;

/** 用 bash 的格式印一條別名：`alias ll='ls -l'`，內容裡的單引號寫成 `'\''`。 */
export function formatAlias(name: string, value: string): string {
	return `alias ${name}='${value.replace(/'/g, "'\\''")}'`;
}

/** 照名稱排序列出全部別名。 */
function listAliases(aliases: Readonly<Record<string, string>>): string[] {
	return Object.keys(aliases)
		.sort((a, b) => a.localeCompare(b, "en"))
		.map((name) => formatAlias(name, aliases[name]));
}

/** 檢查一條定義，不能用時回傳錯誤訊息。 */
function definitionProblem(name: string, value: string): string[] | null {
	if (!ALIAS_NAME_PATTERN.test(name)) {
		return aliasInvalidName(name);
	}
	const problem = checkAliasValue(value);
	if (problem === null) {
		return null;
	}
	if (problem.kind === "empty") {
		return aliasEmptyValue(name);
	}
	if (problem.kind === "parse") {
		return parseError(problem.error);
	}
	return aliasUnsupportedValue(name);
}

export const aliasCommand: CommandDefinition = {
	name: "alias",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("alias", args, "p");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const current = context.aliases ?? {};
		if (parsed.operands.length === 0) {
			return { ok: true, lines: listAliases(current) };
		}

		const next: Record<string, string> = { ...current };
		const lines: string[] = [];
		let changed = false;
		let ok = true;
		let notFound = false;

		for (const operand of parsed.operands) {
			const equals = operand.indexOf("=");
			if (equals === -1) {
				if (Object.hasOwn(next, operand)) {
					lines.push(formatAlias(operand, next[operand]));
				} else {
					lines.push(...aliasNotFound(operand));
					notFound = true;
				}
				continue;
			}

			const name = operand.slice(0, equals);
			const value = operand.slice(equals + 1);
			const problem = definitionProblem(name, value);
			if (problem !== null) {
				lines.push(...problem);
				ok = false;
				continue;
			}
			next[name] = value;
			changed = true;
		}

		const result: CommandResult = { ok, lines };
		if (changed) {
			result.nextAliases = next;
		}
		if (ok && notFound) {
			result.exitStatus = 1;
		}
		return result;
	},
};
