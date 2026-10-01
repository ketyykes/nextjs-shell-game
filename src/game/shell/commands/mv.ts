/**
 * `mv`：搬移或改名（第三章工程艙）。
 *
 * `mv 來源... 目的地`
 * - 目的地是既有目錄就搬進去（保留原名），否則當成新名字，所以 mv 也是改名的指令
 * - 來源有多個時，目的地必須是已經存在的目錄
 * - 目錄不用加 `-r` 就能搬
 * - 某個來源失敗不中斷，繼續處理後面的，但整體 `ok` 為 false
 */

import type { CommandDefinition, CommandResult } from "../types";
import { fsError } from "../messages";
import { captureFsError, parseFlagArgs, planTransfer } from "./fileArgs";

export const mvCommand: CommandDefinition = {
	name: "mv",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("mv", args, "");

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const plan = planTransfer("mv", parsed.operands, context);

		if (!plan.ok) {
			return { ok: false, lines: plan.lines };
		}

		const lines: string[] = [];
		let ok = true;

		for (const source of plan.sources) {
			const error = captureFsError(() => context.fs.move(context.cwd, source, plan.destination));

			if (error !== null) {
				ok = false;
				lines.push(...fsError(error.code, error.path));
			}
		}

		return { ok, lines };
	},
};
