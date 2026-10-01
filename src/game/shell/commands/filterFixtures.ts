/**
 * 第二章過濾指令（head、tail、wc、grep、find）測試共用的檔案系統快照與 `CommandContext` 工廠。
 *
 * 資料取自第二章資料中心的世界觀：`/deck2/logs/` 底下的撤離日誌、艙門事件與 NOVA 核心日誌。
 * 檔名刻意不加 `.test` 後綴，避免被 Vitest 當成測試檔執行。
 */

import type { CommandContext, FsSnapshot } from "../types";
import { HOME_DIR } from "../types";
import { VirtualFileSystem } from "../fs";

/** 艙門事件日誌，共 12 行，用來測 `head`／`tail` 預設的 10 行。 */
export const DOOR_EVENTS_LINES = [
	"21:00 A1 OPEN",
	"21:05 A2 OPEN",
	"21:10 B1 OPEN",
	"21:15 B2 OPEN",
	"21:20 C1 OPEN",
	"21:25 C2 OPEN",
	"21:30 C3 OPEN",
	"21:35 D1 OPEN",
	"21:40 A1 LOCK",
	"21:41 A2 LOCK",
	"21:42 B1 LOCK",
	"21:43 ALL LOCK by NOVA",
];

/** 撤離當晚的日誌，5 行，大小寫混合的 ERROR 用來測 `grep -i`。 */
export const EVAC_LINES = [
	"21:40 INFO 撤離廣播開始",
	"21:42 ERROR 艙門 C2 無回應",
	"21:43 WARN 乘員計數不符",
	"21:45 error 艙門 C3 鎖定",
	"21:47 INFO 逃生艙 1 發射",
];

/** NOVA 核心日誌，3 行。 */
export const NOVA_CORE_LINES = ["NOVA core v3.1", "lockdown order: ALL DOORS", "rollback: pending"];

/** 封存目錄裡的舊日誌。 */
export const OLD_LOG_LINES = ["ERROR 舊紀錄"];

/** 封存目錄裡的隱藏日誌，`grep -r` 與 `find` 都要找得到。 */
export const HIDDEN_LOG_LINES = ["ERROR 隱藏紀錄"];

/** 把行陣列組成結尾有換行的檔案內容。 */
export function toContent(lines: string[]): string {
	return `${lines.join("\n")}\n`;
}

/** 第二章測試用快照。 */
export const CH2_TEST_SNAPSHOT: FsSnapshot = {
	home: {
		tech: {
			"notes.txt": "記得查撤離當晚的日誌\n",
		},
	},
	deck2: {
		"readme.txt": "資料中心\n",
		logs: {
			"door_events.log": toContent(DOOR_EVENTS_LINES),
			"evac_2028-06-02.log": toContent(EVAC_LINES),
			"nova_core.log": toContent(NOVA_CORE_LINES),
			"empty.log": "",
			archive: {
				"old.log": toContent(OLD_LOG_LINES),
				".purged.log": toContent(HIDDEN_LOG_LINES),
			},
		},
	},
};

/**
 * 權限測試用快照：`/vault` 是玩家讀不到的目錄，`/locked.log` 是玩家讀不到的檔案。
 * 另外獨立一份，避免影響上面快照的 `find`／`grep -r` 完整輸出。
 */
export const SEALED_TEST_SNAPSHOT: FsSnapshot = {
	"open.log": "NOVA open\n",
	"locked.log": { $type: "file", content: "NOVA locked\n", mode: "---------" },
	vault: {
		$type: "dir",
		mode: "---------",
		children: {
			"secret.log": "NOVA secret\n",
		},
	},
};

/** 站在根目錄、檔案系統是 `SEALED_TEST_SNAPSHOT` 的 context。 */
export function createSealedContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return createFilterContext({
		cwd: "/",
		fs: VirtualFileSystem.fromSnapshot(SEALED_TEST_SNAPSHOT),
		...overrides,
	});
}

/** 每次都建立一份新的檔案系統，測試之間互不影響。 */
export function createFilterTestFs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot(CH2_TEST_SNAPSHOT);
}

/** 產生指令用的 `CommandContext`，預設站在 `/deck2/logs`、沒有 stdin，可用 `overrides` 覆寫任何欄位。 */
export function createFilterContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		cwd: "/deck2/logs",
		home: HOME_DIR,
		fs: createFilterTestFs(),
		terminalId: "test",
		learnedCommands: [],
		hints: [],
		hintCount: 0,
		history: [],
		availableCommands: ["head", "tail", "wc", "grep", "find"],
		stdin: null,
		env: {},
		processes: [],
		...overrides,
	};
}
