/**
 * `id`：印出帳號的 uid、gid 與所屬群組（第十七場的彩蛋，只開放使用，不在任何章節的 `teaches` 裡）。
 *
 * 格式照 GNU id：`uid=1006(tech) gid=1006(tech) groups=1006(tech),100(users)`。
 * 主群組跟帳號同名同編號（見 `UserAccount`），`groups` 先列主群組，再照帳號表的順序列其他群組。
 *
 * - 不給帳號：查自己（`PLAYER_USER`）。
 * - `id 帳號`：查那個帳號，帳號表裡沒有回 `noSuchUser`（算錯誤）。一次只能查一個。
 * - 選項（`-u`、`-g` 等）不支援，回 `unknownOption`。
 *
 * 帳號表用 `createIdCommand` 注入：遊戲用 `STATION_ACCOUNTS`，沙盒換成不碰主線的那一份。
 */

import type { CommandDefinition, CommandResult, UserAccount } from "../types";
import { PLAYER_USER } from "../types";
import { extraOperand, noSuchUser, unknownOption } from "../messages";
import { STATION_ACCOUNTS } from "./accounts";

/** `id` 的用法，多給參數時的訊息用。 */
const USAGE = "id [帳號]";

/** 組出一個帳號的 `uid=… gid=… groups=…`。 */
function formatAccount(account: UserAccount): string {
	const primary = `${account.uid}(${account.name})`;
	const groups = [primary, ...account.groups.map((group) => `${group.gid}(${group.name})`)];
	return `uid=${primary} gid=${primary} groups=${groups.join(",")}`;
}

/** 依帳號表建立 `id` 指令。 */
export function createIdCommand(accounts: UserAccount[]): CommandDefinition {
	return {
		name: "id",
		run(args): CommandResult {
			const option = args.find((arg) => arg.startsWith("-"));
			if (option !== undefined) {
				return { ok: false, lines: unknownOption("id", option) };
			}
			if (args.length > 1) {
				return { ok: false, lines: extraOperand("id", args[1], USAGE) };
			}

			const name = args[0] ?? PLAYER_USER;
			const account = accounts.find((candidate) => candidate.name === name);
			if (account === undefined) {
				return { ok: false, lines: noSuchUser(name) };
			}
			return { ok: true, lines: [formatAccount(account)] };
		},
	};
}

export const idCommand: CommandDefinition = createIdCommand(STATION_ACCOUNTS);
