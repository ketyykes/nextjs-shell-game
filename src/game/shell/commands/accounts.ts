/**
 * 站上的帳號與登入紀錄（第十七場的彩蛋指令 `id`、`last` 用）。
 *
 * 所有終端機共用同一份；沙盒練習模式在 `src/game/sandbox/practice.ts` 另外給一份不碰主線的。
 * 內容只用第一章就知道的事（設計文件 4.4）：名單上五個人、冷凍艙六個、玩家是第六個，
 * 阿彬兩天前（2031-03-10）凌晨還在站上；不提第五、六章的真相。
 *
 * - 名單上五個人的 uid 是 1001 到 1005，阿彬是名單上的第五人所以是 1005；玩家的 tech 是 1006。
 *   另外四個人的帳號名稱劇本從沒出現過，所以不列，`id` 查不到。
 * - 名單上的人都在 `crew` 群組裡，tech 不在（名單上沒有你）。
 * - 阿彬 2031-03-10 02:47 在通訊艙的終端機（tty4）登入、02:53 登出，對得上第四章通訊艙登錄紀錄的
 *   「02:47 登錄者：abin」與氣閘的「02:53 乘員：abin」；中間 02:51 改了第一章的 day_900.txt。
 * - tech 2031-03-12 08:15 醒來登入（第六章核心艙進出紀錄同一個時間），一直沒有登出。
 * - 登入紀錄從 2031-03-01 開始記（每月輪替），所以三年前的事不在這裡。
 */

import type { AccountGroup, LoginLog, UserAccount } from "../types";

/** 一般使用者都在的 users 群組（Debian 預設 gid 100）。 */
const USERS_GROUP: AccountGroup = { gid: 100, name: "users" };

/** 船員名單上的人才在的群組。 */
const CREW_GROUP: AccountGroup = { gid: 1000, name: "crew" };

export const STATION_ACCOUNTS: UserAccount[] = [
	{ name: "root", uid: 0, groups: [] },
	{ name: "nova", uid: 999, groups: [] },
	{ name: "abin", uid: 1005, groups: [USERS_GROUP, CREW_GROUP] },
	{ name: "tech", uid: 1006, groups: [USERS_GROUP] },
];

export const STATION_LOGIN_LOG: LoginLog = {
	records: [
		{ user: "tech", tty: "tty1", login: "2031-03-12T08:15:00Z", logout: null },
		{ user: "abin", tty: "tty4", login: "2031-03-10T02:47:00Z", logout: "2031-03-10T02:53:00Z" },
	],
	begins: "2031-03-01T00:00:00Z",
};
