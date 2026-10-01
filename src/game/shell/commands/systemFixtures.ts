/**
 * 第四到六章系統指令（echo、sort、uniq、export、env、ps、top、kill）測試共用的假環境。
 *
 * 檔案系統取自第四章通訊艙 `/deck4/comms/`，程序清單取自第六章 NOVA 核心。
 * 檔名刻意不加 `.test` 後綴，避免被 Vitest 當成測試檔執行。
 */

import { VirtualFileSystem } from "../fs";
import { HOME_DIR } from "../types";
import type { CommandContext, FsSnapshot, ProcessInfo } from "../types";

/** 通訊艙目錄，測試預設站在這裡。 */
export const COMMS_DIR = "/deck4/comms";

/** 求救訊號碎片：順序打亂、有重複，`sort`、`uniq` 用。 */
export const PART_01_CONTENT = "03 TO ANY VESSEL\n01 MAYDAY\n02 KEPLER-9\n";
export const PART_02_CONTENT = "02 KEPLER-9\n04 CREW: 1\n01 MAYDAY\n";

/** 通訊紀錄：相鄰重複與不相鄰重複都有，`uniq` 用。 */
export const RELAY_LOG_CONTENT = [
	"ERROR",
	"ERROR",
	"ERROR",
	"OK",
	"WARN",
	"WARN",
	"ERROR",
	"",
].join("\n");

/** 數字排序用：含負號、小數、沒有數字的行與同值行。 */
export const FREQ_CONTENT = [
	"10 alpha",
	"-3 beta",
	"2.5 gamma",
	"noise",
	"2.5 delta",
	"100 epsilon",
	"",
].join("\n");

/** 第四章測試用快照。 */
export const CH4_TEST_SNAPSHOT: FsSnapshot = {
	deck4: {
		comms: {
			fragments: {
				"part_01.txt": PART_01_CONTENT,
				"part_02.txt": PART_02_CONTENT,
			},
			"relay.log": RELAY_LOG_CONTENT,
			"freq.txt": FREQ_CONTENT,
			"outbox.txt": "",
		},
	},
};

/** 第六章測試用程序清單，刻意不依 pid 排序。 */
export function createTestProcesses(): ProcessInfo[] {
	return [
		{
			pid: 3141,
			user: "nova",
			cpu: 87.5,
			mem: 42,
			started: "2028-06-01T00:00:00Z",
			command: "/opt/nova/nova --core",
			ignoresTerm: true,
		},
		{
			pid: 1,
			user: "root",
			cpu: 0.1,
			mem: 0.2,
			started: "2028-05-30T12:00:00Z",
			command: "/sbin/init",
			protected: true,
		},
		{
			pid: 207,
			user: "tech",
			cpu: 0.1,
			mem: 1.5,
			started: "2031-03-12T08:15:00Z",
			command: "-bash",
		},
		{
			pid: 88,
			user: "root",
			cpu: 3,
			mem: 0.8,
			started: "2028-05-30T12:00:05Z",
			command: "/usr/sbin/commsd",
		},
	];
}

/** 預設環境變數。 */
export function createTestEnv(): Record<string, string> {
	return { USER: "tech", HOME: HOME_DIR, PWD: COMMS_DIR };
}

/** 產生系統指令用的 `CommandContext`，預設站在通訊艙、不在管線中，可用 `overrides` 覆寫任何欄位。 */
export function createSystemContext(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		cwd: COMMS_DIR,
		home: HOME_DIR,
		fs: VirtualFileSystem.fromSnapshot(CH4_TEST_SNAPSHOT),
		terminalId: "ch4-t1",
		learnedCommands: [],
		hints: [],
		hintCount: 0,
		history: [],
		availableCommands: [],
		stdin: null,
		env: createTestEnv(),
		processes: createTestProcesses(),
		...overrides,
	};
}
