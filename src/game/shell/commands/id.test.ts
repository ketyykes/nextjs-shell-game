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

	it("劇本裡出現過的船員帳號都查得到，uid 照冷凍艙位順序 1001 起，都在 crew 群組裡", () => {
		// 艙位順序見第一章醫療艙的病歷索引；帳號名稱見第二章門禁紀錄、艙門事件與第五章艦長日誌的擁有者
		expect(idCommand.run(["captain"], createContext()).lines).toEqual([
			"uid=1001(captain) gid=1001(captain) groups=1001(captain),100(users),1000(crew)",
		]);
		expect(idCommand.run(["engineer"], createContext()).lines).toEqual([
			"uid=1002(engineer) gid=1002(engineer) groups=1002(engineer),100(users),1000(crew)",
		]);
		expect(idCommand.run(["medic"], createContext()).lines).toEqual([
			"uid=1003(medic) gid=1003(medic) groups=1003(medic),100(users),1000(crew)",
		]);
		expect(idCommand.run(["comms"], createContext()).lines).toEqual([
			"uid=1004(comms) gid=1004(comms) groups=1004(comms),100(users),1000(crew)",
		]);
	});

	it("第三章零件倉的工程組共用帳號 eng 查得到，不是名單上的人所以不在 crew", () => {
		expect(idCommand.run(["eng"], createContext()).lines).toEqual([
			"uid=2001(eng) gid=2001(eng) groups=2001(eng),100(users)",
		]);
	});

	it("沒有這個帳號時回 noSuchUser，算錯誤", () => {
		expect(idCommand.run(["ghost"], createContext())).toEqual({ ok: false, lines: noSuchUser("ghost") });
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

	it("查不到帳號的訊息也可以換（救援船不是「這座站」）", () => {
		const command = createIdCommand(accounts, (name) => [`查不到 ${name}`]);

		expect(command.run(["nova"], createContext())).toEqual({ ok: false, lines: ["查不到 nova"] });
		expect(command.run(["root"], createContext()).ok).toBe(true);
	});
});
