/**
 * `chmod`：改檔案或目錄的權限（第五章艦橋）。
 *
 * `chmod 權限 路徑...`
 * - 符號寫法 `[ugoa]*[+-=][rwx]+`：沒寫類別等於 `a`（三組都改），
 *   例如 `+r`、`u+x`、`o-r`、`=r`
 * - 數字寫法三位 `0` 到 `7`，例如 `644`、`755`、`600`、`000`
 * - 權限寫法不合法時一個檔案都不動，回 `invalidMode`
 * - 遊戲簡化：不檢查擁有者，任何檔案都能改
 *
 * 不解析選項：`chmod -r 檔名` 的 `-r` 是「拿掉讀取權限」，不是選項。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { fsError, invalidMode, missingOperand } from "../messages";
import { captureFsError } from "./fileArgs";

/** 數字寫法：三位八進位數字。 */
const NUMERIC_MODE = /^[0-7]{3}$/;

/** 符號寫法：類別（可省略）、運算子、權限字母。 */
const SYMBOLIC_MODE = /^([ugoa]*)([-+=])([rwx]+)$/;

/** 權限字母在每組三碼裡的順序。 */
const PERMISSION_LETTERS = ["r", "w", "x"] as const;

/** 類別對應到九碼字串裡的起始位置。 */
const CLASS_OFFSETS: Record<string, number[]> = {
	u: [0],
	g: [3],
	o: [6],
	a: [0, 3, 6],
};

/** 一位八進位數字轉成三碼，例如 6 → `rw-`。 */
function digitToTriplet(digit: number): string {
	let triplet = "";
	triplet += (digit & 4) !== 0 ? "r" : "-";
	triplet += (digit & 2) !== 0 ? "w" : "-";
	triplet += (digit & 1) !== 0 ? "x" : "-";
	return triplet;
}

/** 把類別字串（例如 `ug`，空字串視為 `a`）換成要改的起始位置。 */
function collectOffsets(classes: string): Set<number> {
	const offsets = new Set<number>();
	const effective = classes === "" ? "a" : classes;

	for (const letter of effective) {
		for (const offset of CLASS_OFFSETS[letter]) {
			offsets.add(offset);
		}
	}

	return offsets;
}

/**
 * 把 chmod 的權限寫法套到目前的九碼權限上，回傳新的九碼權限；寫法不合法回傳 null。
 *
 * @example applyModeSpec("u+x", "rw-r--r--") // "rwxr--r--"
 */
export function applyModeSpec(spec: string, current: string): string | null {
	if (NUMERIC_MODE.test(spec)) {
		return Array.from(spec, (char) => digitToTriplet(Number(char))).join("");
	}

	const match = SYMBOLIC_MODE.exec(spec);

	if (match === null) {
		return null;
	}

	const [, classes, operator, letters] = match;
	const bits = current.padEnd(9, "-").slice(0, 9).split("");

	for (const offset of collectOffsets(classes)) {
		PERMISSION_LETTERS.forEach((letter, index) => {
			const position = offset + index;
			const mentioned = letters.includes(letter);

			if (operator === "+") {
				if (mentioned) {
					bits[position] = letter;
				}
			} else if (operator === "-") {
				if (mentioned) {
					bits[position] = "-";
				}
			} else {
				// `=`：提到的設成有，沒提到的設成沒有
				bits[position] = mentioned ? letter : "-";
			}
		});
	}

	return bits.join("");
}

export const chmodCommand: CommandDefinition = {
	name: "chmod",
	run(args, context): CommandResult {
		if (args.length < 2) {
			return { ok: false, lines: missingOperand("chmod", "權限和檔名，例如 chmod +r log_final.txt") };
		}

		const [spec, ...paths] = args;

		// 先驗一次寫法，不合法就一個檔案都不動
		if (applyModeSpec(spec, "---------") === null) {
			return { ok: false, lines: invalidMode(spec) };
		}

		const lines: string[] = [];
		let ok = true;

		for (const path of paths) {
			const error = captureFsError(() => {
				const node = context.fs.getNode(context.cwd, path);
				const nextMode = applyModeSpec(spec, node.mode) ?? node.mode;
				context.fs.setMode(context.cwd, path, nextMode);
			});

			if (error !== null) {
				ok = false;
				lines.push(...fsError(error.code, error.path));
			}
		}

		return { ok, lines };
	},
};
