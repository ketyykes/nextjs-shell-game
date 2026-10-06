/**
 * `chmod`：改檔案或目錄的權限（第五章艦橋）。
 *
 * `chmod 權限 路徑...`
 * - 符號寫法 `[ugoa]*([+-=][rwx]*)+`：沒寫類別等於 `a`（三組都改），例如 `+r`、`u+x`、`o-r`、`=r`；
 *   同一段可以接好幾個運算（`u+r-x`），好幾段用逗號接起來依序套用（`u+x,g-w`、`a=r,u+w`、`ug=rw,o=`）。
 *   `=` 後面可以不接字母（`o=` 是全部拿掉）；`+`、`-` 後面一定要有字母（真的 chmod 接受 `u+` 但什麼都不做，
 *   對新手來說多半是打錯，這裡當不合法）
 * - 數字寫法三位或四位 `0` 到 `7`，例如 `644`、`0644`、`755`、`600`。四位時第一位是 setuid／setgid／sticky，
 *   遊戲的九碼權限沒有這三個位元，所以接受但忽略（`1755` 等於 `755`）；一兩位數（真的 chmod 會在前面補 0）
 *   多半是少打一位，當不合法
 * - 沒有 umask：不寫類別的 `+`、`-` 一律三組都改（真的 chmod 會避開 umask 擋掉的位元）
 * - 權限寫法不合法時一個檔案都不動，回 `invalidMode`
 * - 遊戲簡化：不檢查擁有者，任何檔案都能改
 *
 * 不解析選項：`chmod -r 檔名` 的 `-r` 是「拿掉讀取權限」，不是選項。
 */

import type { CommandDefinition, CommandResult } from "../types";
import { fsError, invalidMode, missingOperand } from "../messages";
import { captureFsError } from "./fileArgs";

/** 數字寫法：三位八進位數字，前面可以多一位特殊權限（忽略）。 */
const NUMERIC_MODE = /^[0-7]?([0-7]{3})$/;

/** 符號寫法的一段：類別（可省略）、一個以上的「運算子加權限字母」。 */
const SYMBOLIC_CLAUSE = /^([ugoa]*)((?:[-+=][rwx]*)+)$/;

/** 從一段符號寫法裡切出每個運算，例如 `+r-x` 切成 `+r`、`-x`。 */
const SYMBOLIC_OPERATION = /([-+=])([rwx]*)/g;

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

/** 把一個運算（例如 `+x`、`=r`）套到指定的幾組權限上，直接改 `bits`。 */
function applyOperation(bits: string[], offsets: Set<number>, operator: string, letters: string): void {
	for (const offset of offsets) {
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
}

/** 套用一段符號寫法（不含逗號），寫法不合法回傳 false，`bits` 可能已被改一部分（呼叫端會丟掉）。 */
function applyClause(bits: string[], clause: string): boolean {
	const match = SYMBOLIC_CLAUSE.exec(clause);

	if (match === null) {
		return false;
	}

	const [, classes, operations] = match;
	const offsets = collectOffsets(classes);

	for (const [, operator, letters] of operations.matchAll(SYMBOLIC_OPERATION)) {
		// `+`、`-` 後面沒有字母時什麼都不會變，多半是打錯，當成不合法
		if (letters === "" && operator !== "=") {
			return false;
		}

		applyOperation(bits, offsets, operator, letters);
	}

	return true;
}

/**
 * 把 chmod 的權限寫法套到目前的九碼權限上，回傳新的九碼權限；寫法不合法回傳 null。
 *
 * @example applyModeSpec("u+x", "rw-r--r--") // "rwxr--r--"
 * @example applyModeSpec("a=r,u+w", "rwxrwxrwx") // "rw-r--r--"
 */
export function applyModeSpec(spec: string, current: string): string | null {
	const numeric = NUMERIC_MODE.exec(spec);

	if (numeric !== null) {
		return Array.from(numeric[1], (char) => digitToTriplet(Number(char))).join("");
	}

	const bits = current.padEnd(9, "-").slice(0, 9).split("");

	// 逗號分隔的每一段依序套用，任何一段（包括空的一段）不合法就整個不合法
	for (const clause of spec.split(",")) {
		if (!applyClause(bits, clause)) {
			return null;
		}
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
