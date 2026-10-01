/**
 * 遊戲與輔助指令（help、hint、man、history、clear）測試共用的假環境。
 */

import { VirtualFileSystem } from "../fs";
import { HOME_DIR } from "../types";
import type { CommandContext } from "../types";

/** 建立指令執行環境，預設是空的檔案系統、沒學過任何指令，用 `overrides` 覆寫需要的欄位。 */
export function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		cwd: HOME_DIR,
		home: HOME_DIR,
		fs: VirtualFileSystem.fromSnapshot({}),
		terminalId: "ch1-t1",
		learnedCommands: [],
		hints: [],
		hintCount: 0,
		history: [],
		availableCommands: [],
		stdin: null,
		env: { HOME: HOME_DIR, USER: "tech", PWD: HOME_DIR },
		processes: [],
		...overrides,
	};
}
