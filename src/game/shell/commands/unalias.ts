/**
 * `unalias`：拿掉別名（第十九場，只開放使用，不在劇本裡；bash 的內建指令）。
 *
 * - `unalias 名稱...`：拿掉指定的別名；沒有這個別名時說明一下，不算錯誤（結束碼 1，bash 的 not found），其他的照樣拿掉。
 * - `unalias -a`：全部拿掉。
 * 跟 `alias` 一樣用回傳值 `nextAliases` 整份交回 shell。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { aliasNotFound, missingOperand } from "../messages";
import { parseFlagArgs } from "./options";

export const unaliasCommand: CommandDefinition = {
	name: "unalias",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("unalias", args, "a");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}
		if (parsed.flags.has("a")) {
			return { ok: true, lines: [], nextAliases: {} };
		}
		if (parsed.operands.length === 0) {
			return {
				ok: false,
				lines: missingOperand("unalias", "要拿掉的別名名稱，例如 unalias ll；全部拿掉用 unalias -a"),
			};
		}

		const next: Record<string, string> = { ...(context.aliases ?? {}) };
		const lines: string[] = [];
		let changed = false;
		for (const name of parsed.operands) {
			if (Object.hasOwn(next, name)) {
				delete next[name];
				changed = true;
			} else {
				lines.push(...aliasNotFound(name));
			}
		}

		const result: CommandResult = { ok: true, lines };
		if (changed) {
			result.nextAliases = next;
		}
		if (lines.length > 0) {
			result.exitStatus = 1;
		}
		return result;
	},
};
