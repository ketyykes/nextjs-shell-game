// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extraOperand, noSuchUser, unknownOption } from "../messages";
import type { UserAccount } from "../types";
import { createIdCommand, idCommand } from "./id";
import { createContext } from "./testFixtures";

describe("id 預設的站上帳號", () => {
	it("指令名稱是 id", () => {
		expect(idCommand.name).toBe("id");
	});

	it("不給帳號時印自己的：uid 1006，名單上五個人是 1001 到 1005，自己是第六個", () => {
		expect(idCommand.run([], createContext())).toEqual({
			ok: true,
			lines: ["uid=1006(tech) gid=1006(tech) groups=1006(tech),100(users)"],
		});
	});

	it("阿彬是第五個，而且在 crew 群組裡；自己不在", () => {
		expect(idCommand.run(["abin"], createContext()).lines).toEqual([
			"uid=1005(abin) gid=1005(abin) groups=1005(abin),100(users),1000(crew)",
		]);
	});

	it("ps 看得到的 root 與 nova 也查得到", () => {
		expect(idCommand.run(["root"], createContext()).lines).toEqual(["uid=0(root) gid=0(root) groups=0(root)"]);
		expect(idCommand.run(["nova"], createContext()).lines).toEqual(["uid=999(nova) gid=999(nova) groups=999(nova)"]);
	});

	it("沒有這個帳號時回 noSuchUser，算錯誤", () => {
		expect(idCommand.run(["captain"], createContext())).toEqual({ ok: false, lines: noSuchUser("captain") });
	});

	it("一次只能查一個帳號，多的回 extraOperand", () => {
		expect(idCommand.run(["tech", "abin"], createContext())).toEqual({
			ok: false,
			lines: extraOperand("id", "abin", "id [帳號]"),
		});
	});

	it("選項回 unknownOption", () => {
		expect(idCommand.run(["-u"], createContext())).toEqual({ ok: false, lines: unknownOption("id", "-u") });
	});
});

describe("createIdCommand 換一份帳號表", () => {
	const accounts: UserAccount[] = [
		{ name: "root", uid: 0, groups: [] },
		{ name: "tech", uid: 1001, groups: [{ gid: 100, name: "users" }] },
	];

	it("照給的帳號表印", () => {
		const command = createIdCommand(accounts);

		expect(command.name).toBe("id");
		expect(command.run([], createContext()).lines).toEqual(["uid=1001(tech) gid=1001(tech) groups=1001(tech),100(users)"]);
		expect(command.run(["abin"], createContext())).toEqual({ ok: false, lines: noSuchUser("abin") });
	});
});
