/**
 * 檔案操作指令（mkdir、touch、cp、mv、rm）共用的小工具。
 *
 * 選項解析改在 `./options` 的 `parseFlagArgs`，跟過濾類指令共用。
 * `chmod` 不用它，因為 `chmod -r 檔名` 的 `-r` 是權限寫法（拿掉讀取權限），不是選項。
 */

import type { CommandContext } from "../types";
import { FsError } from "../types";
import { missingOperand } from "../messages";

/** 相容用：並行開發中的指令可能還從這裡 import，之後全部改從 `./options` 拿就可以刪。 */
export { parseFlagArgs, type FlagParseResult } from "./options";

/**
 * 執行一個檔案系統操作：成功回傳 null，丟 `FsError` 時回傳那個錯誤，其他錯誤照樣往外丟。
 * 讓指令可以逐一處理多個參數，某個失敗不中斷。
 */
export function captureFsError(action: () => void): FsError | null {
	try {
		action();
		return null;
	} catch (error) {
		if (error instanceof FsError) {
			return error;
		}

		throw error;
	}
}

/** 路徑是不是既有的目錄。 */
function isExistingDir(context: CommandContext, path: string): boolean {
	try {
		return context.fs.getNode(context.cwd, path).type === "dir";
	} catch (error) {
		if (error instanceof FsError) {
			return false;
		}

		throw error;
	}
}

/** `cp`、`mv` 的參數拆解結果：最後一個是目的地，前面都是來源。 */
export type TransferPlan =
	| { ok: true; sources: string[]; destination: string }
	| { ok: false; lines: string[] };

/**
 * 把 `cp`、`mv` 的參數拆成來源與目的地，並檢查用法：
 * 至少要有來源和目的地兩個參數；來源有多個時，目的地必須是已經存在的目錄。
 */
export function planTransfer(command: string, operands: string[], context: CommandContext): TransferPlan {
	if (operands.length === 0) {
		return { ok: false, lines: missingOperand(command, `來源和目的地，例如 ${command} core.cfg backup/`) };
	}

	if (operands.length === 1) {
		const source = operands[0];
		return {
			ok: false,
			lines: missingOperand(command, `在 ${source} 後面再接一個目的地，例如 ${command} ${source} backup/`),
		};
	}

	const sources = operands.slice(0, -1);
	const destination = operands[operands.length - 1];

	if (sources.length > 1 && !isExistingDir(context, destination)) {
		return {
			ok: false,
			lines: missingOperand(
				command,
				`一個已經存在的目錄當最後的目的地，才能一次處理多個來源，例如 ${command} core.cfg coolant.cfg backup/`,
			),
		};
	}

	return { ok: true, sources, destination };
}
