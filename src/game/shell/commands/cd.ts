/**
 * `cd`：切換目前工作目錄。
 *
 * 指令本身不改狀態，成功時透過 `nextCwd` 告訴 shell 新的位置。
 * 兩個以上的參數跟 bash 一樣報「參數太多」（`cd: too many arguments`），不換目錄。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { FsError } from "../types";
import { cdTooManyArguments, fsError } from "../messages";

export const cdCommand: CommandDefinition = {
	name: "cd",
	run(args, context): CommandResult {
		if (args.length > 1) {
			return { ok: false, lines: cdTooManyArguments() };
		}

		// 無參數回家目錄
		let target = context.home;

		if (args.length > 0) {
			target = args[0];
		}

		try {
			context.fs.getDir(context.cwd, target);
		} catch (error) {
			if (error instanceof FsError) {
				return { ok: false, lines: fsError(error.code, error.path) };
			}

			throw error;
		}

		return {
			ok: true,
			lines: [],
			nextCwd: context.fs.resolvePath(context.cwd, target),
		};
	},
};
