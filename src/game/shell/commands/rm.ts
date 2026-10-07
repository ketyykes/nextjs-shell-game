/**
 * `rm`：刪除檔案或目錄（第三章工程艙）。刪了就救不回來，沒有資源回收筒。
 *
 * `rm [-r] [-f] 路徑...`
 * - 目錄要加 `-r`（`-R` 也可以），否則提示要加 `-r`；`-f` 不會跳過這個檢查
 * - `-f` 時路徑不存在不算錯
 * - `-rf`、`-fr` 合併寫可以用
 * - 某個路徑失敗不中斷，繼續處理後面的，但整體 `ok` 為 false
 */

import type { CommandContext, CommandDefinition, CommandResult } from "../types";
import { directoryNeedsRecursive, fsError, missingOperand } from "../messages";
import { captureFsError, parseFlagArgs } from "./fileArgs";

/** `rm` 的選項。 */
interface RmOptions {
	recursive: boolean;
	force: boolean;
}

/** 刪除一個路徑，成功（或 `-f` 忽略）回傳空陣列，失敗回傳要印的錯誤訊息。 */
function removeOne(context: CommandContext, path: string, options: RmOptions): string[] {
	let isDir = false;
	const lookupError = captureFsError(() => {
		isDir = context.fs.getNode(context.cwd, path).type === "dir";
	});

	if (lookupError !== null) {
		if (options.force && lookupError.code === "ENOENT") {
			return [];
		}

		return fsError(lookupError.code, lookupError.path);
	}

	if (isDir && !options.recursive) {
		return directoryNeedsRecursive("rm", path, `rm -r ${path}`);
	}

	const removeError = captureFsError(() =>
		context.fs.remove(context.cwd, path, { recursive: options.recursive }),
	);

	if (removeError !== null) {
		return fsError(removeError.code, removeError.path);
	}

	return [];
}

export const rmCommand: CommandDefinition = {
	name: "rm",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("rm", args, "rRf");

		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}

		// 真的 rm -f 沒給路徑時會安靜成功，但這裡多半是新手忘了打檔名，提醒比較有幫助
		if (parsed.operands.length === 0) {
			return { ok: false, lines: missingOperand("rm", "要刪除的檔案，例如 rm old.log") };
		}

		const options: RmOptions = {
			recursive: parsed.flags.has("r") || parsed.flags.has("R"),
			force: parsed.flags.has("f"),
		};
		const lines: string[] = [];
		let ok = true;

		for (const path of parsed.operands) {
			const errorLines = removeOne(context, path, options);

			if (errorLines.length > 0) {
				ok = false;
				lines.push(...errorLines);
			}
		}

		return { ok, lines };
	},
};
