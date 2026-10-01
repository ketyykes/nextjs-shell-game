/**
 * 第一章七個艙區 id 的執行期清單。
 *
 * `RoomId` 只是型別，zod schema 與旗標守衛需要實際的陣列；
 * 下面的編譯期檢查保證這份清單跟 `RoomId` 一致，`events.ts` 加了新艙區這裡會直接報錯。
 */

import type { RoomId } from "@/game/phaser/events";

export const ROOM_IDS = ["cryo", "lifesupport", "quarters", "medbay", "power", "corridor", "airlock"] as const satisfies readonly RoomId[];

/** 清單漏掉的 RoomId；不是 never 代表上面的陣列少列了艙區。 */
type MissingRoomId = Exclude<RoomId, (typeof ROOM_IDS)[number]>;

/** 編譯期檢查：`MissingRoomId` 必須是 never，否則這行型別錯誤。 */
const roomIdsAreExhaustive: [MissingRoomId] extends [never] ? true : false = true;
void roomIdsAreExhaustive;

/** 字串是否為合法的艙區 id。 */
export function isRoomId(value: string): value is RoomId {
	return (ROOM_IDS as readonly string[]).includes(value);
}
