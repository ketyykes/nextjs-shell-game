// @vitest-environment node
import { describe, expect, it } from "vitest";
import { installPlayerProbe, PLAYER_PROBE_KEY, type PlayerProbe, type PlayerProbeSnapshot } from "./playerProbe";

/** 測試用的假角色狀態，讀取函式每次都讀它目前的值。 */
function createState(): PlayerProbeSnapshot {
	return { x: 224, y: 592, roomId: "cryo", inputEnabled: true };
}

function probeOf(target: Record<string, unknown>): PlayerProbe | undefined {
	return target[PLAYER_PROBE_KEY] as PlayerProbe | undefined;
}

describe("installPlayerProbe", () => {
	it("掛上之後 read() 回傳角色當下的座標、艙區與能否操作", () => {
		const target: Record<string, unknown> = {};
		const state = createState();
		installPlayerProbe(target, () => state);

		expect(probeOf(target)?.read()).toEqual({ x: 224, y: 592, roomId: "cryo", inputEnabled: true });

		state.x = 300.5;
		state.roomId = null;
		state.inputEnabled = false;
		expect(probeOf(target)?.read()).toEqual({ x: 300.5, y: 592, roomId: null, inputEnabled: false });
	});

	it("read() 回傳複本，呼叫端改了也不影響下一次讀到的值", () => {
		const target: Record<string, unknown> = {};
		const state = createState();
		installPlayerProbe(target, () => state);

		const snapshot = probeOf(target)?.read();
		if (snapshot === undefined) {
			throw new Error("鉤子沒有掛上");
		}
		snapshot.x = -1;
		expect(probeOf(target)?.read().x).toBe(224);
	});

	it("拆掉後 window 上不再有鉤子，重複拆不會出錯", () => {
		const target: Record<string, unknown> = {};
		const uninstall = installPlayerProbe(target, createState);

		uninstall();
		expect(PLAYER_PROBE_KEY in target).toBe(false);
		expect(() => uninstall()).not.toThrow();
	});

	it("舊場景晚一步拆鉤子時，不會拆掉新場景剛掛上的鉤子", () => {
		const target: Record<string, unknown> = {};
		const oldState = createState();
		const newState = { ...createState(), x: 999 };
		const uninstallOld = installPlayerProbe(target, () => oldState);
		installPlayerProbe(target, () => newState);

		uninstallOld();
		expect(probeOf(target)?.read().x).toBe(999);
	});
});
