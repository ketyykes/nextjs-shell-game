// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unknownOption } from "../messages";
import type { LoginLog } from "../types";
import { createLastCommand, lastCommand } from "./last";
import { createContext } from "./testFixtures";

/** util-linux last 的欄寬：帳號 8、終端機 12、來源主機 16（站上直接登入是空的）。 */
const EMPTY_HOST = " ".repeat(16);

describe("last 預設的站上登入紀錄", () => {
	it("指令名稱是 last", () => {
		expect(lastCommand.name).toBe("last");
	});

	it("最新的在前：自己還沒登出，阿彬兩天前凌晨在通訊艙登入過十五分鐘", () => {
		expect(lastCommand.run([], createContext())).toEqual({
			ok: true,
			lines: [
				`tech     tty1         ${EMPTY_HOST} Wed Mar 12 08:15   still logged in`,
				`abin     tty4         ${EMPTY_HOST} Mon Mar 10 02:38 - 02:53  (00:15)`,
				"",
				"wtmp begins Sat Mar  1 00:00:00 2031",
			],
		});
	});

	it("給帳號名稱只列那個帳號的紀錄", () => {
		expect(lastCommand.run(["abin"], createContext()).lines).toEqual([
			`abin     tty4         ${EMPTY_HOST} Mon Mar 10 02:38 - 02:53  (00:15)`,
			"",
			"wtmp begins Sat Mar  1 00:00:00 2031",
		]);
	});

	it("沒有紀錄的帳號只印結尾兩行，不算錯誤（跟真的 last 一樣）", () => {
		expect(lastCommand.run(["captain"], createContext())).toEqual({
			ok: true,
			lines: ["", "wtmp begins Sat Mar  1 00:00:00 2031"],
		});
	});

	it("選項回 unknownOption", () => {
		expect(lastCommand.run(["-n", "1"], createContext())).toEqual({ ok: false, lines: unknownOption("last", "-n") });
	});
});

describe("createLastCommand 換一份登入紀錄", () => {
	const log: LoginLog = {
		records: [
			{ user: "tech", tty: "tty2", login: "2027-08-14T05:30:00Z", logout: null },
			{ user: "tech", tty: "tty1", login: "2027-08-11T21:00:00Z", logout: "2027-08-13T22:10:00Z" },
		],
		begins: "2027-08-01T00:00:00Z",
	};

	it("照給的紀錄印；超過一天的長度寫成 天數+時:分", () => {
		const command = createLastCommand(log);

		expect(command.name).toBe("last");
		expect(command.run([], createContext()).lines).toEqual([
			`tech     tty2         ${EMPTY_HOST} Sat Aug 14 05:30   still logged in`,
			`tech     tty1         ${EMPTY_HOST} Wed Aug 11 21:00 - 22:10 (2+01:10)`,
			"",
			"wtmp begins Sun Aug  1 00:00:00 2027",
		]);
	});
});
