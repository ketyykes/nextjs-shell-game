/**
 * 站上的帳號與登入紀錄（第十七場的彩蛋指令 `id`、`last` 用）。
 *
 * 所有終端機共用同一份；沙盒練習模式在 `src/game/sandbox/practice.ts` 另外給一份不碰主線的。
 * 內容只用第一章就知道的事（設計文件 4.4）：名單上五個人、冷凍艙六個、玩家是第六個，
 * 阿彬兩天前（2031-03-10）凌晨還在站上；不提第五、六章的真相。
 *
 * - 名單上五個人的 uid 照冷凍艙位（第一章醫療艙的病歷索引）排 1001 到 1005：pod_01 艦長 captain、
 *   pod_02 工程師 engineer、pod_03 醫官 medic、pod_04 通訊官 comms、pod_05 阿彬 abin；玩家的 tech 是 1006。
 *   帳號名稱都是劇本裡出現過的：第二章資料中心的門禁紀錄與艙門事件（captain、engineer、medic、comms、abin）、
 *   第五章艦長日誌的擁有者（captain）。
 * - 名單上的人都在 `crew` 群組裡，tech 不在（名單上沒有你）。
 * - `eng` 是第三章零件倉的工程組共用帳號（banner 與 README），不是哪個人，uid 放在 2001 跟個人帳號分開，也不在 crew。
 * - 阿彬 2031-03-10 02:38 在通訊艙的終端機（tty4）登入、02:53 登出，包住他那天凌晨留下的每一個檔案時間：
 *   02:40 第六章 tech 家目錄的 .night_shift、02:44 第六章封存的發射碼、02:45 第五章 pod_03 的 .note、
 *   02:49 第四章的 outbox、02:51 第一章的 day_900.txt；登出對得上第四章氣閘的「02:53 乘員：abin」。
 *   第四章通訊艙登錄紀錄的「02:47 登錄者：abin … 登錄失敗」是呼號登錄，跟系統登入是兩回事。
 *   `accounts.test.ts` 會走過六章劇本與阿彬的留言核對，改時間線時一起看。
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
	{ name: "captain", uid: 1001, groups: [USERS_GROUP, CREW_GROUP] },
	{ name: "engineer", uid: 1002, groups: [USERS_GROUP, CREW_GROUP] },
	{ name: "medic", uid: 1003, groups: [USERS_GROUP, CREW_GROUP] },
	{ name: "comms", uid: 1004, groups: [USERS_GROUP, CREW_GROUP] },
	{ name: "abin", uid: 1005, groups: [USERS_GROUP, CREW_GROUP] },
	{ name: "tech", uid: 1006, groups: [USERS_GROUP] },
	{ name: "eng", uid: 2001, groups: [USERS_GROUP] },
];

export const STATION_LOGIN_LOG: LoginLog = {
	records: [
		{ user: "tech", tty: "tty1", login: "2031-03-12T08:15:00Z", logout: null },
		{ user: "abin", tty: "tty4", login: "2031-03-10T02:38:00Z", logout: "2031-03-10T02:53:00Z" },
	],
	begins: "2031-03-01T00:00:00Z",
};
