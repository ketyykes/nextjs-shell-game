/**
 * 檔案操作指令（mkdir、touch、cp、mv、rm、chmod）測試共用的快照與 `CommandContext` 工廠。
 *
 * 資料取自第三章工程艙（反應爐設定目錄被刪，只剩備份）與第五章艦橋的封存日誌。
 * 檔名刻意不加 `.test` 後綴，避免被 Vitest 當成測試檔執行。
 */

import type { CommandContext, FsSnapshot } from "../types";
import { HOME_DIR } from "../types";
import { VirtualFileSystem } from "../fs";

/** 反應爐目錄，指令測試預設站在這裡。 */
export const REACTOR_DIR = "/deck3/reactor";

/** 備份裡 `core.cfg` 的內容。 */
export const CORE_CFG_CONTENT = "core=on\nrods=4\n";

/** 備份裡 `coolant.cfg` 的內容。 */
export const COOLANT_CFG_CONTENT = "flow=80\n";

/** 檔案操作指令測試用快照。 */
export const FILE_TEST_SNAPSHOT: FsSnapshot = {
	deck3: {
		reactor: {
			"status.txt": "主電力：離線\n",
			backup: {
				$type: "dir",
				owner: "chief",
				mtime: "2031-03-01T00:00:00Z",
				children: {
					"core.cfg": { $type: "file", content: CORE_CFG_CONTENT, owner: "chief", mtime: "2031-03-01T00:00:00Z" },
					"coolant.cfg": { $type: "file", content: COOLANT_CFG_CONTENT, owner: "chief", mtime: "2031-03-01T00:00:00Z" },
				},
			},
			trash: {
				"old.log": "舊日誌\n",
			},
		},
	},
	deck5: {
		captain: {
			sealed: {
				"log_final.txt": {
					$type: "file",
					content: "它還在跑。別相信那個聲音。\n",
					owner: "captain",
					mode: "---------",
				},
			},
		},
	},
	home: {
		tech: {},
	},
};

/** 每次都建立一份新的檔案系統，測試之間互不影響。 */
export function createFileTestFs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot(FILE_TEST_SNAPSHOT);
}

/** 產生指令用的 `CommandContext`，預設站在反應爐目錄，可用 `overrides` 覆寫任何欄位。 */
export function createFileContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		cwd: REACTOR_DIR,
		home: HOME_DIR,
		fs: createFileTestFs(),
		terminalId: "test",
		learnedCommands: [],
		hints: [],
		hintCount: 0,
		history: [],
		availableCommands: ["mkdir", "touch", "cp", "mv", "rm", "chmod"],
		stdin: null,
		env: {},
		processes: [],
		...overrides,
	};
}
