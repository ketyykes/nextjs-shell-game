// @vitest-environment node
/**
 * 守門測試：36 台終端機的 id、標題、艙區寫死在這裡。
 *
 * `chapters.test.ts` 只比對「劇本等於 decks.ts」，劇本的身分欄位改從 `deckTerminalIdentity` 取之後，
 * decks.ts 本身被改到也不會亮紅燈；這份表格讓任何一邊的意外變動都會被抓到。
 * 真的要改終端機名稱或艙區時，連這份表格一起改。
 */
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "./index";

/** [id, 標題, 艙區]，依 id 排序。 */
const EXPECTED_IDENTITIES: ReadonlyArray<readonly [string, string, string]> = [
	["ch1-t1", "冷凍艙控制台", "cryo"],
	["ch1-t2", "維生系統監控台", "lifesupport"],
	["ch1-t3", "宿舍終端機", "quarters"],
	["ch1-t4", "配電箱", "power"],
	["ch1-t5", "醫療艙終端機", "medbay"],
	["ch1-t6", "艙門控制台", "airlock"],
	["ch2-t1", "入口登錄台", "dc_entry"],
	["ch2-t2", "日誌封存終端機", "dc_logs"],
	["ch2-t3", "機櫃管理台", "dc_racks"],
	["ch2-t4", "冷卻監控台", "dc_cooling"],
	["ch2-t5", "備援主控台", "dc_backup"],
	["ch2-t6", "資料中心艙門控制台", "dc_exit"],
	["ch3-t1", "工程艙登錄台", "eng_entry"],
	["ch3-t2", "工作間終端機", "eng_workshop"],
	["ch3-t3", "零件倉管理台", "eng_storage"],
	["ch3-t4", "反應爐控制台", "eng_reactor"],
	["ch3-t5", "設定機房終端機", "eng_config"],
	["ch3-t6", "工程艙艙門控制台", "eng_exit"],
	["ch4-t1", "通訊艙登錄台", "com_entry"],
	["ch4-t2", "中繼機房終端機", "com_relay"],
	["ch4-t3", "天線控制台", "com_antenna"],
	["ch4-t4", "訊號處理台", "com_signal"],
	["ch4-t5", "通訊紀錄終端機", "com_archive"],
	["ch4-t6", "通訊艙艙門控制台", "com_exit"],
	["ch5-t1", "艦橋登錄台", "br_entry"],
	["ch5-t2", "導航站終端機", "br_nav"],
	["ch5-t3", "艦長室終端機", "br_captain"],
	["ch5-t4", "安全管制台", "br_security"],
	["ch5-t5", "逃生艙紀錄台", "br_escape"],
	["ch5-t6", "艦橋艙門控制台", "br_exit"],
	["ch6-t1", "核心艙登錄台", "nv_entry"],
	["ch6-t2", "監控室終端機", "nv_monitor"],
	["ch6-t3", "記憶庫終端機", "nv_memory"],
	["ch6-t4", "NOVA 核心控制台", "nv_core"],
	["ch6-t5", "排程機房終端機", "nv_scheduler"],
	["ch6-t6", "逃生艙控制台", "nv_escape"],
];

describe("終端機身分", () => {
	it("六章 36 台終端機的 id、標題、艙區跟寫死的表格完全一樣", () => {
		const actual = CHAPTERS.flatMap((chapter) =>
			chapter.terminals.map((terminal) => [terminal.id, terminal.title, terminal.roomId] as const),
		).sort((a, b) => a[0].localeCompare(b[0]));

		expect(actual).toEqual(EXPECTED_IDENTITIES);
	});
});
