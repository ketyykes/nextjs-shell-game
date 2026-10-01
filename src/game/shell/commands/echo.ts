/**
 * `echo`：把參數用一個空格接起來，印成一行。
 *
 * 第四章搭配重導向 `>`、`>>` 把文字寫進檔案。
 * 輸出以行為單位，所以 `-n`（不換行）吃掉之後行為一樣；
 * 其他 `-x` 跟真的 echo 一樣當一般文字印出，不報錯。永遠成功。
 */

import type { CommandDefinition, CommandResult } from "../types";

/** 跟真的 echo 一樣只認得開頭連續的 `-n`，後面出現的 `-n` 是一般文字。 */
function stripLeadingNoNewlineFlags(args: string[]): string[] {
	let index = 0;

	while (index < args.length && args[index] === "-n") {
		index += 1;
	}

	return args.slice(index);
}

export const echoCommand: CommandDefinition = {
	name: "echo",
	run(args): CommandResult {
		const words = stripLeadingNoNewlineFlags(args);

		return { ok: true, lines: [words.join(" ")] };
	},
};
