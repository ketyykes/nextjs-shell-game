/**
 * `cp`：複製檔案或目錄（第三章工程艙）。
 *
 * `cp [-r] 來源... 目的地`
 * - 目的地是既有目錄就複製進去（保留原名），否則當成新名字
 * - 來源有多個時，目的地必須是已經存在的目錄
 * - 來源是目錄要加 `-r`（`-R` 也可以），否則提示要加 `-r`
 * - 某個來源失敗不中斷，繼續處理後面的，但整體 `ok` 為 false
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { directoryNeedsRecursive, fsError } from "../messages";
import { captureFsError, parseFlagArgs, planTransfer } from "./fileArgs";

/** 複製一個來源，成功回傳空陣列，失敗回傳要印的錯誤訊息。 */
function copyOne(context: CommandContext, source: string, destination: string, recursive: boolean): string[] {
	let isDir = false;
	const lookupError = captureFsError(() => {
		isDir = context.fs.getNode(context.cwd, source).type === "dir";
	});

	if (lookupError !== null) {
		return fsError(lookupError.code, lookupError.path);
	}

	if (isDir && !recursive) {
		return directoryNeedsRecursive("cp", source);
	}

	const copyError = captureFsError(() => context.fs.copy(context.cwd, source, destination, { recursive }));

	if (copyError !== null) {
		return fsError(copyError.code, copyError.path);
	}

	return [];
}

export const cpCommand: CommandDefinition = {
	name: "cp",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("cp", args, "rR");

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		const plan = planTransfer("cp", parsed.operands, context);

		if (!plan.ok) {
			return { ok: false, lines: plan.lines };
		}

		const recursive = parsed.flags.has("r") || parsed.flags.has("R");
		const lines: string[] = [];
		let ok = true;

		for (const source of plan.sources) {
			const errorLines = copyOne(context, source, plan.destination, recursive);

			if (errorLines.length > 0) {
				ok = false;
				lines.push(...errorLines);
			}
		}

		return { ok, lines };
	},
};
