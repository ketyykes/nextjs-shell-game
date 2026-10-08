/**
 * `which`：印出指令的程式檔放在哪裡（M13-3，只開放使用，不在劇本裡）。
 *
 * 這台站的指令沒有真的放在虛擬檔案系統裡，位置照下面的規則決定（照 Debian 的配置）：
 * - shell 內建、沒有獨立程式檔的 `cd`、`export`、`help`、`history`：找不到，並說明它是內建指令
 * - 遊戲自己的 `hint`：`/usr/local/bin/hint`（站上加裝的工具）
 * - 其他已註冊的指令：`/usr/bin/<名稱>`；`/bin` 跟 `/usr/bin` 是同一個目錄（Debian 的 merged /usr），
 *   PATH 裡寫 `/bin` 時印 `/bin/<名稱>`
 *
 * 照環境變數 `PATH` 的目錄順序找，印第一個找得到的位置；`-a` 印出每一個。
 * 環境變數裡沒有 `PATH` 時用 `DEFAULT_PATH`。`PATH` 只影響 which，不影響指令能不能執行（玩家改壞 PATH 不會讓 ls 消失）。
 * 名稱含 `/` 時直接看那個檔案存不存在、能不能執行（擁有者看前三碼的 x，其他人看最後三碼）。
 *
 * 找不到時真的 which 不印東西、回傳 1；這裡改成印一段說明，而且跟 `grep` 沒符合一樣**不算錯誤**，避免懲罰探索。
 */

import type { CommandContext, CommandDefinition, CommandResult, FsNode } from "../types";
import { FsError, PLAYER_USER } from "../types";
import { missingOperand, whichBuiltin, whichNotFound } from "../messages";
import { parseFlagArgs } from "./options";

/** 環境變數沒有 `PATH` 時用的預設值。 */
export const DEFAULT_PATH = "/usr/local/bin:/usr/bin:/bin";

/** bash 的內建指令，沒有獨立的程式檔。 */
const SHELL_BUILTINS = new Set(["cd", "export", "help", "history"]);

/** 遊戲自己的工具，裝在 `/usr/local/bin`。 */
const LOCAL_TOOLS = new Set(["hint"]);

/** 去掉目錄結尾多餘的 `/`（根目錄 `/` 本身不動）。 */
function normalizeDir(dir: string): string {
	if (dir.length > 1 && dir.endsWith("/")) {
		return dir.replace(/\/+$/, "");
	}
	return dir;
}

/** 指令的程式檔裝在哪個目錄；內建指令或沒有這個指令時回傳 null。 */
function installDir(name: string, context: CommandContext): string | null {
	if (SHELL_BUILTINS.has(name) || !context.availableCommands.includes(name)) {
		return null;
	}
	if (LOCAL_TOOLS.has(name)) {
		return "/usr/local/bin";
	}
	return "/usr/bin";
}

/** PATH 裡的這個目錄有沒有這支程式：一樣的目錄，或 `/bin` 對 `/usr/bin`。 */
function dirContains(pathDir: string, install: string): boolean {
	if (pathDir === install) {
		return true;
	}
	return pathDir === "/bin" && install === "/usr/bin";
}

/** 檔案能不能執行：擁有者是玩家看前三碼的 x，否則看最後三碼。 */
function canExecute(node: FsNode): boolean {
	const mode = node.mode.padEnd(9, "-");
	if (node.owner === PLAYER_USER) {
		return mode[2] === "x";
	}
	return mode[8] === "x";
}

/** 名稱含 `/`：直接看那個檔案。 */
function isExecutableFile(name: string, context: CommandContext): boolean {
	try {
		const node = context.fs.getNode(context.cwd, name);
		return node.type === "file" && canExecute(node);
	} catch (error) {
		if (error instanceof FsError) {
			return false;
		}
		throw error;
	}
}

/** 查一個名稱，回傳要印的行。 */
function locate(name: string, path: string, all: boolean, context: CommandContext): string[] {
	if (name.includes("/")) {
		if (isExecutableFile(name, context)) {
			return [name];
		}
		return whichNotFound(name, path, false);
	}

	if (SHELL_BUILTINS.has(name)) {
		return whichBuiltin(name);
	}

	const install = installDir(name, context);
	if (install === null) {
		return whichNotFound(name, path, false);
	}

	const found: string[] = [];
	for (const rawDir of path.split(":")) {
		// 相對路徑（含空字串代表的目前目錄）裡不會有站上的指令
		if (!rawDir.startsWith("/")) {
			continue;
		}
		const dir = normalizeDir(rawDir);
		const location = `${dir === "/" ? "" : dir}/${name}`;
		if (dirContains(dir, install) && !found.includes(location)) {
			found.push(location);
			if (!all) {
				break;
			}
		}
	}

	if (found.length === 0) {
		return whichNotFound(name, path, true);
	}
	return found;
}

export const whichCommand: CommandDefinition = {
	name: "which",
	run(args, context): CommandResult {
		const parsed = parseFlagArgs("which", args, "a");
		if (!parsed.ok) {
			return { ok: false, lines: parsed.lines };
		}
		if (parsed.operands.length === 0) {
			return { ok: false, lines: missingOperand("which", "一個指令名稱，例如 which ls") };
		}

		const path = context.env.PATH ?? DEFAULT_PATH;
		const all = parsed.flags.has("a");
		const lines = parsed.operands.flatMap((name) => locate(name, path, all, context));
		// 找不到也不算錯誤，跟 grep 沒符合一樣（決策 #28 的延伸）
		return { ok: true, lines };
	},
};
