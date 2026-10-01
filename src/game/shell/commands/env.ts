/**
 * `env`：依名稱排序列出目前所有環境變數，一行一個 `名稱=值`。
 *
 * 真的 env 可以帶參數暫時改變數再執行指令，這裡不支援，有參數就回 `unknownOption`。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { unknownOption } from "../messages";
import { sortedVariableNames } from "./export";

export const envCommand: CommandDefinition = {
	name: "env",
	run(args, context): CommandResult {
		if (args.length > 0) {
			return { ok: false, lines: unknownOption("env", args[0]) };
		}

		const lines = sortedVariableNames(context.env).map((name) => `${name}=${context.env[name]}`);

		return { ok: true, lines };
	},
};
