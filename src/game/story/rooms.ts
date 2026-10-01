/**
 * 六個甲板共 42 個艙區 id 的執行期清單（第一章 7 個加第二到六章各 7 個）。
 *
 * `RoomId` 只是型別，zod schema 與旗標守衛需要實際的陣列；
 * 這裡逐一列出字面值（不用 `Object.keys(ROOM_NAMES)`），陣列才保有字面值型別給 `z.enum` 推型，
 * 下面的編譯期檢查也才有意義：`events.ts` 加了新艙區、這裡沒跟上，或列了不存在的 id，都會直接報錯。
 */

import type { RoomId } from "@/game/phaser/events";

export const ROOM_IDS = [
	// 第一章 冷凍艙與維生艙（deck1）
	"cryo",
	"lifesupport",
	"quarters",
	"medbay",
	"power",
	"corridor",
	"airlock",
	// 第二章 資料中心（deck2）
	"dc_entry",
	"dc_logs",
	"dc_racks",
	"dc_cooling",
	"dc_backup",
	"dc_exit",
	"dc_corridor",
	// 第三章 工程艙（deck3）
	"eng_entry",
	"eng_workshop",
	"eng_storage",
	"eng_reactor",
	"eng_config",
	"eng_exit",
	"eng_corridor",
	// 第四章 通訊艙（deck4）
	"com_entry",
	"com_relay",
	"com_antenna",
	"com_signal",
	"com_archive",
	"com_exit",
	"com_corridor",
	// 第五章 艦橋（deck5）
	"br_entry",
	"br_nav",
	"br_captain",
	"br_security",
	"br_escape",
	"br_exit",
	"br_corridor",
	// 第六章 NOVA 核心（deck6）
	"nv_entry",
	"nv_monitor",
	"nv_memory",
	"nv_core",
	"nv_scheduler",
	"nv_escape",
	"nv_corridor",
] as const satisfies readonly RoomId[];

/** 清單漏掉的 RoomId；不是 never 代表上面的陣列少列了艙區。 */
type MissingRoomId = Exclude<RoomId, (typeof ROOM_IDS)[number]>;

/** 編譯期檢查：`MissingRoomId` 必須是 never，否則這行型別錯誤。 */
const roomIdsAreExhaustive: [MissingRoomId] extends [never] ? true : false = true;
void roomIdsAreExhaustive;

/** 字串是否為合法的艙區 id。 */
export function isRoomId(value: string): value is RoomId {
	return (ROOM_IDS as readonly string[]).includes(value);
}
