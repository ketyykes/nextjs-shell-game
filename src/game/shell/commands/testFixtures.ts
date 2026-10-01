/**
 * 指令測試共用的檔案系統快照與 `CommandContext` 工廠。
 *
 * 資料取自第一章 T1（冷凍艙控制台）、T3（宿舍房間）與 T4（配電箱）。
 * 檔名刻意不加 `.test` 後綴，避免被 Vitest 當成測試檔執行。
 */

import type { CommandContext, FsSnapshot } from "../types";
import { HOME_DIR, PLAYER_USER } from "../types";
import { VirtualFileSystem } from "../fs";

/** 冷凍艙目錄統一的修改時間，`ls -l` 測試用。 */
export const POD_MTIME = "2028-06-01T00:00:00Z";

/** `wake_up.txt` 的內容，結尾有換行，用來測 `cat` 不多印空行。 */
export const WAKE_UP_CONTENT = "喚醒排程：三年後\n原始設定：永不\n修改者：\n";

/** 配電箱隱藏檔 `.override` 的內容。 */
export const OVERRIDE_CONTENT = "RESET-B3-7734\n";

/** 第一章測試用快照。 */
export const CH1_TEST_SNAPSHOT: FsSnapshot = {
	home: {
		tech: {
			pod_01: { $type: "dir", children: {}, mtime: POD_MTIME },
			pod_02: { $type: "dir", children: {}, mtime: POD_MTIME },
			pod_03: { $type: "dir", children: {}, mtime: POD_MTIME },
			pod_04: { $type: "dir", children: {}, mtime: POD_MTIME },
			pod_05: { $type: "dir", children: {}, mtime: POD_MTIME },
			pod_06: { $type: "dir", children: {}, mtime: POD_MTIME },
			"wake_up.txt": { $type: "file", content: WAKE_UP_CONTENT, mtime: "2031-03-12T08:15:00Z" },
			".nova_cache": "NOVA 暫存資料\n",
		},
		abin: {
			$type: "dir",
			owner: "abin",
			mtime: "2031-03-10T03:07:00Z",
			children: {
				"day_001.txt": {
					$type: "file",
					content: "Day 1. Everyone is asleep. I have the whole ship to myself!\n",
					mtime: "2028-06-02T09:00:00Z",
					owner: "abin",
				},
				"day_450.txt": {
					$type: "file",
					content: "NOVA changed the schedule again.\n",
					mtime: "2029-08-25T21:30:00Z",
					owner: "abin",
				},
				"day_900.txt": {
					$type: "file",
					content: "不要相信那個聲音。\n",
					mtime: "2031-03-10T03:07:00Z",
					owner: "abin",
				},
			},
		},
	},
	deck1: {
		systems: {
			power: {
				"status.txt": "B3 斷路器：跳脫\n",
				breakers: {
					B3: {
						".override": OVERRIDE_CONTENT,
					},
				},
			},
		},
	},
};

/** 每次都建立一份新的檔案系統，測試之間互不影響。 */
export function createTestFs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot(CH1_TEST_SNAPSHOT);
}

/**
 * 產生指令用的 `CommandContext`，預設站在家目錄，可用 `overrides` 覆寫任何欄位。
 * `stdin` 預設 null（不在管線裡）、`env` 預設是 shell 會自動補的三個基本變數、`processes` 預設空陣列。
 */
export function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		cwd: HOME_DIR,
		home: HOME_DIR,
		fs: createTestFs(),
		terminalId: "test",
		learnedCommands: [],
		hints: [],
		hintCount: 0,
		history: [],
		availableCommands: ["pwd", "ls", "cd", "cat"],
		stdin: null,
		env: { HOME: HOME_DIR, USER: PLAYER_USER, PWD: HOME_DIR },
		processes: [],
		...overrides,
	};
}
